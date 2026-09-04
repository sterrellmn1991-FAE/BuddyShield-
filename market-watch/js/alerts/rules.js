/**
 * Alert rule engine.
 *
 * Two behaviours matter more than the rule types themselves:
 *
 *  1. Edge triggering. A rule fires on the TRANSITION from not-met to met.
 *     "BTC above $70,000" should fire once when it crosses, not on every
 *     poll for the rest of the day. Each rule carries `wasMet` for this.
 *
 *  2. Cooldown. Even a genuine re-cross should not fire twice in a minute
 *     when price is oscillating around the threshold. `cooldownMinutes`
 *     suppresses repeats.
 *
 * Both are what separate an alerting tool you keep from one you mute.
 */

import { makeId, formatPrice, formatPct, isFiniteNumber } from '../util.js';
import { REGIME_LABELS } from '../analysis/regime.js';

export const RULE_KINDS = {
  PRICE_ABOVE: 'price_above',
  PRICE_BELOW: 'price_below',
  PCT_CHANGE: 'pct_change',
  RSI: 'rsi',
  MACD_CROSS: 'macd_cross',
  UNUSUAL_MOVE: 'unusual_move',
  REGIME_CHANGE: 'regime_change',
};

export const RULE_KIND_LABELS = {
  price_above: 'Price rises above',
  price_below: 'Price falls below',
  pct_change: 'Percent move',
  rsi: 'RSI level',
  macd_cross: 'MACD crossover',
  unusual_move: 'Unusual move',
  regime_change: 'Market regime changes',
};

export const SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' };

/** Build a rule with defaults filled in. */
export function createRule(partial) {
  return {
    id: makeId('rule'),
    symbol: '',
    assetType: 'crypto',
    kind: RULE_KINDS.PRICE_ABOVE,
    enabled: true,
    cooldownMinutes: 60,
    repeat: true,           // false = one-shot; disables itself after firing
    wasMet: false,
    lastFiredAt: null,
    createdAt: Date.now(),
    params: {},
    note: '',
    ...partial,
  };
}

/**
 * Evaluate one rule against a snapshot.
 *
 * @param {object} rule
 * @param {object} asset  { symbol, name, assetType, analysis, quote }
 * @param {object} [prevState] previously stored regime for change detection
 * @returns {{met:boolean, message:string, severity:string, detail:object}}
 */
export function evaluateRule(rule, asset) {
  const a = asset?.analysis;
  const nothing = { met: false, message: '', severity: SEVERITY.INFO, detail: {} };
  if (!a) return nothing;

  const p = rule.params || {};
  const name = asset.displaySymbol || asset.symbol;
  const currency = asset.currency || 'USD';

  switch (rule.kind) {
    case RULE_KINDS.PRICE_ABOVE: {
      if (!isFiniteNumber(a.price) || !isFiniteNumber(p.value)) return nothing;
      const met = a.price > p.value;
      return {
        met,
        severity: SEVERITY.WARNING,
        message: `${name} rose above ${formatPrice(p.value, currency)} — now ${formatPrice(a.price, currency)}.`,
        detail: { price: a.price, target: p.value },
      };
    }

    case RULE_KINDS.PRICE_BELOW: {
      if (!isFiniteNumber(a.price) || !isFiniteNumber(p.value)) return nothing;
      const met = a.price < p.value;
      return {
        met,
        severity: SEVERITY.WARNING,
        message: `${name} fell below ${formatPrice(p.value, currency)} — now ${formatPrice(a.price, currency)}.`,
        detail: { price: a.price, target: p.value },
      };
    }

    case RULE_KINDS.PCT_CHANGE: {
      const change = a.dayChangePct;
      if (!isFiniteNumber(change) || !isFiniteNumber(p.percent)) return nothing;
      const dir = p.direction || 'either';
      const threshold = Math.abs(p.percent);
      let met = false;
      if (dir === 'up') met = change >= threshold;
      else if (dir === 'down') met = change <= -threshold;
      else met = Math.abs(change) >= threshold;
      return {
        met,
        severity: Math.abs(change) >= threshold * 2 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        message: `${name} moved ${formatPct(change)} in the latest session (threshold ${formatPct(dir === 'down' ? -threshold : threshold)}).`,
        detail: { change, threshold, direction: dir },
      };
    }

    case RULE_KINDS.RSI: {
      const rsi = a.momentum?.rsi;
      if (!isFiniteNumber(rsi) || !isFiniteNumber(p.level)) return nothing;
      const met = p.direction === 'below' ? rsi <= p.level : rsi >= p.level;
      const word = p.direction === 'below' ? 'oversold territory' : 'overbought territory';
      return {
        met,
        severity: SEVERITY.INFO,
        message: `${name} RSI is ${rsi.toFixed(1)}, ${p.direction} ${p.level} — ${word}. A reversal becomes more likely, though momentum can stay stretched.`,
        detail: { rsi, level: p.level },
      };
    }

    case RULE_KINDS.MACD_CROSS: {
      const cross = a.momentum?.macdCross;
      if (!cross) return nothing;
      const want = p.direction || 'either';
      const met = cross.barsAgo === 0 && (want === 'either' || cross.direction === want);
      return {
        met,
        severity: SEVERITY.INFO,
        message: `${name} just printed a ${cross.direction} MACD crossover — momentum is turning ${cross.direction === 'bullish' ? 'up' : 'down'}.`,
        detail: cross,
      };
    }

    case RULE_KINDS.UNUSUAL_MOVE: {
      const z = a.volatility?.zScore;
      const threshold = isFiniteNumber(p.zscore) ? Math.abs(p.zscore) : 2;
      if (!isFiniteNumber(z)) return nothing;
      const met = Math.abs(z) >= threshold;
      const dir = z > 0 ? 'higher' : 'lower';
      return {
        met,
        severity: Math.abs(z) >= 3 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        message: `${name} moved ${Math.abs(z).toFixed(1)} standard deviations ${dir} than its normal daily range (${formatPct(a.dayChangePct)}).`,
        detail: { zScore: z, threshold },
      };
    }

    case RULE_KINDS.REGIME_CHANGE: {
      const current = a.regime?.regime;
      const previous = asset.previousRegime;
      if (!current || !previous || current === previous) return nothing;
      const want = p.to || 'any';
      const met = want === 'any' || current === want;
      return {
        met,
        severity: current === 'bear' ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        message: `${name} shifted from ${REGIME_LABELS[previous] || previous} to ${REGIME_LABELS[current] || current} (${a.regime.confidence}% of signals agree).`,
        detail: { from: previous, to: current },
      };
    }

    default:
      return nothing;
  }
}

/**
 * Run every enabled rule against the current assets and return the ones that
 * should fire right now. Mutates each rule's `wasMet` / `lastFiredAt` so edge
 * detection and cooldown work across polls.
 *
 * @param {object[]} rules
 * @param {Map<string,object>|object} assetsByKey  keyed by `${assetType}:${symbol}`
 * @param {number} now
 * @returns {object[]} triggered events
 */
export function evaluateAll(rules, assetsByKey, now = Date.now()) {
  const get = (key) => (assetsByKey instanceof Map ? assetsByKey.get(key) : assetsByKey[key]);
  const events = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const asset = get(assetKey(rule.assetType, rule.symbol));
    if (!asset) continue;

    const result = evaluateRule(rule, asset);

    // Edge trigger: only the not-met -> met transition is interesting.
    const isRisingEdge = result.met && !rule.wasMet;
    rule.wasMet = result.met;
    if (!isRisingEdge) continue;

    // Cooldown: suppress a re-cross that happens too soon after the last fire.
    const cooldownMs = Math.max(0, (rule.cooldownMinutes || 0) * 60_000);
    if (rule.lastFiredAt && now - rule.lastFiredAt < cooldownMs) continue;

    rule.lastFiredAt = now;
    if (!rule.repeat) rule.enabled = false;

    events.push({
      id: makeId('evt'),
      ruleId: rule.id,
      symbol: rule.symbol,
      assetType: rule.assetType,
      kind: rule.kind,
      message: result.message,
      severity: result.severity,
      detail: result.detail,
      note: rule.note || '',
      firedAt: now,
    });
  }

  return events;
}

export function assetKey(assetType, symbol) {
  return `${assetType}:${String(symbol).toUpperCase()}`;
}

/** One-line summary of a rule for the rules list. */
export function describeRule(rule) {
  const p = rule.params || {};
  const sym = rule.symbol;
  switch (rule.kind) {
    case RULE_KINDS.PRICE_ABOVE: return `${sym} rises above ${formatPrice(p.value)}`;
    case RULE_KINDS.PRICE_BELOW: return `${sym} falls below ${formatPrice(p.value)}`;
    case RULE_KINDS.PCT_CHANGE: {
      const d = p.direction === 'up' ? 'gains' : p.direction === 'down' ? 'drops' : 'moves';
      return `${sym} ${d} ${Math.abs(p.percent)}% in a session`;
    }
    case RULE_KINDS.RSI: return `${sym} RSI goes ${p.direction} ${p.level}`;
    case RULE_KINDS.MACD_CROSS: return `${sym} prints a ${p.direction === 'either' ? '' : p.direction + ' '}MACD cross`;
    case RULE_KINDS.UNUSUAL_MOVE: return `${sym} moves more than ${p.zscore || 2}σ from its norm`;
    case RULE_KINDS.REGIME_CHANGE:
      return p.to && p.to !== 'any'
        ? `${sym} turns ${REGIME_LABELS[p.to] || p.to}`
        : `${sym} changes market regime`;
    default: return `${sym} — ${rule.kind}`;
  }
}
