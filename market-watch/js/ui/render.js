/**
 * Rendering. Every function here takes state and returns HTML strings; event
 * wiring lives in app.js via delegation, so re-rendering never leaks handlers.
 */

import { state } from '../state.js';
import { escapeHtml, formatPrice, formatPct, timeAgo, isFiniteNumber } from '../util.js';
import { summariseBreadth } from '../analysis/regime.js';
import { describeAnalysis } from '../analysis/signals.js';
import { assetKey, describeRule, RULE_KINDS, RULE_KIND_LABELS } from '../alerts/rules.js';
import { sparkline, priceChart, rsiGauge, macdChart } from './charts.js';

/* ------------------------------------------------------------------ header */

export function renderBreadth() {
  const assets = [...state.assets.values()];
  const { counts, mood } = summariseBreadth(assets);
  const chips = [
    ['bull', 'Bullish'], ['recovery', 'Recovery'], ['sideways', 'Sideways'],
    ['correction', 'Correction'], ['bear', 'Bearish'],
  ].filter(([k]) => counts[k] > 0)
    .map(([k, label]) => `<span class="chip chip--${k}">${counts[k]} ${label}</span>`)
    .join('');

  const moodClass = mood === 'Risk-on' ? 'bull' : mood === 'Risk-off' ? 'bear' : 'sideways';

  return `
    <div class="breadth">
      <div class="breadth__mood">
        <span class="breadth__label">Market tone</span>
        <strong class="breadth__value breadth__value--${moodClass}">${mood}</strong>
      </div>
      <div class="breadth__chips">${chips || '<span class="chip chip--sideways">No data yet</span>'}</div>
      <div class="breadth__meta">
        ${state.refreshing ? '<span class="pulse">Refreshing…</span>'
          : `Updated ${timeAgo(state.lastRefresh)}`}
        ${state.settings.demoMode ? '<span class="badge badge--demo">Demo data</span>' : ''}
      </div>
    </div>`;
}

/* --------------------------------------------------------------- watchlist */

function regimePill(regime) {
  // The glyph carries the meaning alongside colour, so the state is still
  // readable when colour is unavailable or indistinguishable.
  const glyph = {
    bull: '▲', bear: '▼', correction: '▽', recovery: '△', sideways: '▬', unknown: '?',
  }[regime.regime] || '?';
  return `<span class="pill pill--${regime.regime}" title="${escapeHtml(regime.description)}">
    <span class="pill__glyph" aria-hidden="true">${glyph}</span>${escapeHtml(regime.label)}
    ${regime.confidence ? `<span class="pill__conf">${regime.confidence}%</span>` : ''}
  </span>`;
}

function signalChips(analysis) {
  const chips = [];
  const m = analysis.momentum;
  const v = analysis.volatility;

  if (isFiniteNumber(m.rsi)) {
    const cls = m.rsiState === 'overbought' ? 'warn' : m.rsiState === 'oversold' ? 'info' : 'muted';
    chips.push(`<span class="sig sig--${cls}" title="Relative Strength Index (14)">RSI ${m.rsi.toFixed(0)}</span>`);
  }
  if (m.macdCross) {
    chips.push(`<span class="sig sig--${m.macdCross.direction === 'bullish' ? 'bull' : 'bear'}"
      title="MACD crossover ${m.macdCross.barsAgo} bar(s) ago">MACD ${m.macdCross.direction === 'bullish' ? '↗' : '↘'}</span>`);
  }
  if (v.isUnusualMove) {
    chips.push(`<span class="sig sig--warn" title="Standard deviations from this asset's normal daily move">${Math.abs(v.zScore).toFixed(1)}σ move</span>`);
  } else if (v.state === 'elevated') {
    chips.push('<span class="sig sig--warn" title="Average True Range well above its own median">Vol high</span>');
  } else if (v.state === 'compressed') {
    chips.push('<span class="sig sig--muted" title="Average True Range well below its own median">Vol low</span>');
  }
  return chips.join('');
}

export function renderWatchlist() {
  if (!state.watchlist.length) {
    return '<p class="empty">Your watchlist is empty. Add a symbol above to start.</p>';
  }

  return state.watchlist.map((item) => {
    const key = assetKey(item.assetType, item.symbol);
    const asset = state.assets.get(key);
    const error = state.errors.get(key);

    if (error) {
      return `<article class="card card--error" data-key="${key}">
        <header class="card__head">
          <div><h3 class="card__symbol">${escapeHtml(item.symbol)}</h3>
          <span class="card__type">${item.assetType}</span></div>
          <button class="icon-btn" data-action="remove-watch" data-id="${item.id}"
            aria-label="Remove ${escapeHtml(item.symbol)}">×</button>
        </header>
        <p class="card__error">${escapeHtml(error)}</p>
      </article>`;
    }

    if (!asset) {
      return `<article class="card card--loading" data-key="${key}">
        <header class="card__head">
          <div><h3 class="card__symbol">${escapeHtml(item.symbol)}</h3>
          <span class="card__type">${item.assetType}</span></div>
        </header>
        <p class="card__loading">Loading…</p>
      </article>`;
    }

    const a = asset.analysis;
    const changeCls = !isFiniteNumber(a.dayChangePct) ? 'flat' : a.dayChangePct > 0 ? 'up' : a.dayChangePct < 0 ? 'down' : 'flat';

    return `<article class="card ${state.selected === key ? 'card--selected' : ''}"
        data-key="${key}" data-action="select" tabindex="0" role="button"
        aria-label="${escapeHtml(item.symbol)} details">
      <header class="card__head">
        <div>
          <h3 class="card__symbol">${escapeHtml(asset.displaySymbol || item.symbol)}</h3>
          <span class="card__name">${escapeHtml(asset.name || '')}</span>
        </div>
        <button class="icon-btn" data-action="remove-watch" data-id="${item.id}"
          aria-label="Remove ${escapeHtml(item.symbol)}">×</button>
      </header>

      <div class="card__price">
        <span class="card__value">${formatPrice(a.price, asset.currency)}</span>
        <span class="card__change card__change--${changeCls}">
          ${changeCls === 'up' ? '▲' : changeCls === 'down' ? '▼' : '·'} ${formatPct(a.dayChangePct)}
        </span>
      </div>

      ${sparkline(a.series.closes.slice(-180), a.regime.regime)}

      <div class="card__foot">
        ${regimePill(a.regime)}
        <div class="card__sigs">${signalChips(a)}</div>
      </div>
      ${asset.limited ? `<p class="card__note">${escapeHtml(asset.limited)}</p>` : ''}
    </article>`;
  }).join('');
}

/* ------------------------------------------------------------ detail panel */

export function renderDetail() {
  const asset = state.selected ? state.assets.get(state.selected) : null;
  if (!asset) {
    return `<div class="detail detail--empty">
      <h2>Select an asset</h2>
      <p>Pick anything on your watchlist to see its full trend read: price against its moving averages, the reasoning behind its market-regime call, momentum, and volatility.</p>
    </div>`;
  }

  const a = asset.analysis;
  const m = a.momentum;
  const v = a.volatility;
  const met = a.regime.metrics;

  const row = (label, value, hint = '') =>
    `<div class="stat"><dt>${escapeHtml(label)}${hint ? `<span class="stat__hint" title="${escapeHtml(hint)}">?</span>` : ''}</dt>
     <dd>${value}</dd></div>`;

  return `<div class="detail">
    <header class="detail__head">
      <div>
        <h2>${escapeHtml(asset.displaySymbol)} <span class="detail__name">${escapeHtml(asset.name || '')}</span></h2>
        <p class="detail__headline">${escapeHtml(describeAnalysis(a))}</p>
      </div>
      <div class="detail__price">
        <span class="detail__value">${formatPrice(a.price, asset.currency)}</span>
        <span class="card__change card__change--${a.dayChangePct > 0 ? 'up' : a.dayChangePct < 0 ? 'down' : 'flat'}">${formatPct(a.dayChangePct)}</span>
      </div>
    </header>

    <section class="detail__section">
      ${priceChart(a)}
    </section>

    <section class="detail__section">
      <h3>Why this is called <em>${escapeHtml(a.regime.label)}</em></h3>
      <p class="detail__desc">${escapeHtml(a.regime.description)}</p>
      <ul class="reasons">
        ${a.regime.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
      <p class="detail__conf">${a.regime.confidence}% of the trend signals agree with this call
        (${met.bullVotes?.length || 0} bullish, ${met.bearVotes?.length || 0} bearish).</p>
    </section>

    <section class="detail__section detail__grid">
      <div>
        <h3>Momentum</h3>
        ${rsiGauge(m.rsi)}
        <dl class="stats">
          ${row('RSI (14)', isFiniteNumber(m.rsi) ? `${m.rsi.toFixed(1)} — ${m.rsiState}` : '—',
            'Above 70 is overbought, below 30 oversold. Stretched readings can persist in a strong trend.')}
          ${row('MACD bias', escapeHtml(m.macdBias), 'Sign of the MACD histogram: momentum building or fading.')}
          ${row('Last cross', m.macdCross ? `${m.macdCross.direction}, ${m.macdCross.barsAgo} bar(s) ago` : 'none in 5 bars')}
        </dl>
        ${macdChart(a)}
      </div>
      <div>
        <h3>Volatility</h3>
        <dl class="stats">
          ${row('ATR (14)', isFiniteNumber(v.atr) ? formatPrice(v.atr, asset.currency) : '—',
            'Average True Range: the typical daily trading range.')}
          ${row('ATR as % of price', isFiniteNumber(v.atrPct) ? `${v.atrPct.toFixed(2)}%` : '—')}
          ${row('State', escapeHtml(v.state), 'Compared against this asset\'s own median range, not an absolute number.')}
          ${row('Latest move', isFiniteNumber(v.zScore) ? `${v.zScore.toFixed(2)}σ` : '—',
            'How unusual today\'s move is versus the last 30 sessions.')}
        </dl>
        <h3>Trend levels</h3>
        <dl class="stats">
          ${row('50-day average', isFiniteNumber(met.ma50) ? formatPrice(met.ma50, asset.currency) : '—')}
          ${row(`${met.longMaPeriod || 200}-day average`, isFiniteNumber(met.ma200) ? formatPrice(met.ma200, asset.currency) : '—')}
          ${row('From high', isFiniteNumber(met.drawdown) ? formatPct(met.drawdown) : '—',
            `Drawdown from the highest close in the last ${met.lookbackBars} bars.`)}
          ${row('From low', isFiniteNumber(met.runUp) ? formatPct(met.runUp) : '—',
            `Run-up from the lowest close in the last ${met.lookbackBars} bars.`)}
        </dl>
      </div>
    </section>

    <footer class="detail__foot">
      Source: ${escapeHtml(asset.source)} · fetched ${timeAgo(asset.fetchedAt)}
      · thresholds for ${escapeHtml(asset.assetType)}: correction ${met.thresholds?.correction}%, bear ${met.thresholds?.bear}%, bull +${met.thresholds?.bull}%
    </footer>
  </div>`;
}

/* -------------------------------------------------------------- rules list */

export function renderRules() {
  if (!state.rules.length) {
    return '<p class="empty">No alerts yet. Create one on the left — start with a price target on something you already care about.</p>';
  }
  return `<ul class="rules">${state.rules.map((rule) => `
    <li class="rule ${rule.enabled ? '' : 'rule--off'}">
      <label class="rule__toggle">
        <input type="checkbox" data-action="toggle-rule" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
        <span class="sr-only">Enable ${escapeHtml(describeRule(rule))}</span>
      </label>
      <div class="rule__body">
        <span class="rule__desc">${escapeHtml(describeRule(rule))}</span>
        <span class="rule__meta">
          ${escapeHtml(rule.assetType)} ·
          ${rule.repeat ? `repeats, ${rule.cooldownMinutes}m cooldown` : 'one-shot'}
          ${rule.lastFiredAt ? ` · last fired ${timeAgo(rule.lastFiredAt)}` : ''}
          ${rule.wasMet ? ' · <span class="rule__armed">condition currently true</span>' : ''}
        </span>
        ${rule.note ? `<span class="rule__note">${escapeHtml(rule.note)}</span>` : ''}
      </div>
      <button class="icon-btn" data-action="remove-rule" data-id="${rule.id}"
        aria-label="Delete alert">×</button>
    </li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------- alert feed */

export function renderEvents() {
  if (!state.events.length) {
    return '<p class="empty">Nothing has fired yet. Triggered alerts land here, newest first.</p>';
  }
  return `<ul class="events">${state.events.slice(0, 60).map((e) => `
    <li class="event event--${e.severity}">
      <span class="event__time">${timeAgo(e.firedAt)}</span>
      <span class="event__msg">${escapeHtml(e.message)}</span>
      ${e.note ? `<span class="event__note">${escapeHtml(e.note)}</span>` : ''}
    </li>`).join('')}</ul>`;
}

/* -------------------------------------------------------- rule form fields */

/** The rule form changes shape by rule kind; this renders the right inputs. */
export function renderRuleParams(kind) {
  switch (kind) {
    case RULE_KINDS.PRICE_ABOVE:
    case RULE_KINDS.PRICE_BELOW:
      return `<label class="field">Target price
        <input type="number" step="any" min="0" name="value" required placeholder="e.g. 70000">
      </label>`;

    case RULE_KINDS.PCT_CHANGE:
      return `<label class="field">Direction
        <select name="direction">
          <option value="either">Moves either way</option>
          <option value="up">Gains</option>
          <option value="down">Drops</option>
        </select>
      </label>
      <label class="field">Percent
        <input type="number" step="any" min="0" name="percent" value="5" required>
      </label>`;

    case RULE_KINDS.RSI:
      return `<label class="field">When RSI goes
        <select name="direction">
          <option value="above">Above (overbought)</option>
          <option value="below">Below (oversold)</option>
        </select>
      </label>
      <label class="field">Level
        <input type="number" min="0" max="100" name="level" value="70" required>
      </label>`;

    case RULE_KINDS.MACD_CROSS:
      return `<label class="field">Cross direction
        <select name="direction">
          <option value="either">Either</option>
          <option value="bullish">Bullish (momentum turning up)</option>
          <option value="bearish">Bearish (momentum turning down)</option>
        </select>
      </label>`;

    case RULE_KINDS.UNUSUAL_MOVE:
      return `<label class="field">Standard deviations
        <input type="number" step="0.5" min="1" name="zscore" value="2" required>
        <span class="field__hint">2σ ≈ a move bigger than roughly 95% of this asset's recent days.</span>
      </label>`;

    case RULE_KINDS.REGIME_CHANGE:
      return `<label class="field">Alert when it turns
        <select name="to">
          <option value="any">Any change</option>
          <option value="bull">Bullish</option>
          <option value="bear">Bearish</option>
          <option value="correction">Correction</option>
          <option value="recovery">Recovery</option>
          <option value="sideways">Sideways</option>
        </select>
      </label>`;

    default:
      return '';
  }
}

export function ruleKindOptions() {
  return Object.values(RULE_KINDS)
    .map((k) => `<option value="${k}">${RULE_KIND_LABELS[k]}</option>`).join('');
}

export function watchOptions() {
  if (!state.watchlist.length) return '<option value="">Add a symbol first</option>';
  return state.watchlist
    .map((w) => `<option value="${w.assetType}:${escapeHtml(w.symbol)}">${escapeHtml(w.symbol)} (${w.assetType})</option>`)
    .join('');
}
