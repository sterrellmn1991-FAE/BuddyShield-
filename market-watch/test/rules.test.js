import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRule, evaluateRule, evaluateAll, assetKey, describeRule, RULE_KINDS, SEVERITY,
} from '../js/alerts/rules.js';

/** Minimal asset stub shaped like what analyseSeries() produces. */
function asset(overrides = {}) {
  return {
    symbol: 'BTC',
    displaySymbol: 'BTC',
    assetType: 'crypto',
    currency: 'USD',
    analysis: {
      price: 100,
      dayChangePct: 0,
      regime: { regime: 'sideways', confidence: 50 },
      momentum: { rsi: 50, macdCross: null, macdHistogram: 0 },
      volatility: { zScore: 0, isUnusualMove: false },
      ...(overrides.analysis || {}),
    },
    ...overrides,
  };
}

test('price_above fires only once price is strictly above the target', () => {
  const rule = createRule({ symbol: 'BTC', kind: RULE_KINDS.PRICE_ABOVE, params: { value: 100 } });
  assert.equal(evaluateRule(rule, asset({ analysis: { price: 99 } })).met, false);
  assert.equal(evaluateRule(rule, asset({ analysis: { price: 100 } })).met, false, 'equal is not above');
  assert.equal(evaluateRule(rule, asset({ analysis: { price: 101 } })).met, true);
});

test('price_below fires only once price is strictly below the target', () => {
  const rule = createRule({ symbol: 'BTC', kind: RULE_KINDS.PRICE_BELOW, params: { value: 100 } });
  assert.equal(evaluateRule(rule, asset({ analysis: { price: 101 } })).met, false);
  assert.equal(evaluateRule(rule, asset({ analysis: { price: 99 } })).met, true);
});

test('pct_change respects direction', () => {
  const up = createRule({ kind: RULE_KINDS.PCT_CHANGE, params: { direction: 'up', percent: 5 } });
  const down = createRule({ kind: RULE_KINDS.PCT_CHANGE, params: { direction: 'down', percent: 5 } });
  const either = createRule({ kind: RULE_KINDS.PCT_CHANGE, params: { direction: 'either', percent: 5 } });

  const rallied = asset({ analysis: { dayChangePct: 7 } });
  const dumped = asset({ analysis: { dayChangePct: -7 } });

  assert.equal(evaluateRule(up, rallied).met, true);
  assert.equal(evaluateRule(up, dumped).met, false);
  assert.equal(evaluateRule(down, dumped).met, true);
  assert.equal(evaluateRule(down, rallied).met, false);
  assert.equal(evaluateRule(either, rallied).met, true);
  assert.equal(evaluateRule(either, dumped).met, true);
});

test('a move of twice the threshold escalates to critical severity', () => {
  const rule = createRule({ kind: RULE_KINDS.PCT_CHANGE, params: { direction: 'up', percent: 5 } });
  assert.equal(evaluateRule(rule, asset({ analysis: { dayChangePct: 6 } })).severity, SEVERITY.WARNING);
  assert.equal(evaluateRule(rule, asset({ analysis: { dayChangePct: 12 } })).severity, SEVERITY.CRITICAL);
});

test('rsi rule handles both directions', () => {
  const over = createRule({ kind: RULE_KINDS.RSI, params: { direction: 'above', level: 70 } });
  const under = createRule({ kind: RULE_KINDS.RSI, params: { direction: 'below', level: 30 } });
  assert.equal(evaluateRule(over, asset({ analysis: { momentum: { rsi: 75 } } })).met, true);
  assert.equal(evaluateRule(over, asset({ analysis: { momentum: { rsi: 65 } } })).met, false);
  assert.equal(evaluateRule(under, asset({ analysis: { momentum: { rsi: 25 } } })).met, true);
});

test('macd_cross only fires on a cross printed this bar', () => {
  const rule = createRule({ kind: RULE_KINDS.MACD_CROSS, params: { direction: 'bullish' } });
  const today = asset({ analysis: { momentum: { macdCross: { direction: 'bullish', barsAgo: 0 } } } });
  const stale = asset({ analysis: { momentum: { macdCross: { direction: 'bullish', barsAgo: 3 } } } });
  const wrongWay = asset({ analysis: { momentum: { macdCross: { direction: 'bearish', barsAgo: 0 } } } });
  assert.equal(evaluateRule(rule, today).met, true);
  assert.equal(evaluateRule(rule, stale).met, false, 'a 3-day-old cross is not news');
  assert.equal(evaluateRule(rule, wrongWay).met, false);
});

test('unusual_move triggers on absolute z-score in either direction', () => {
  const rule = createRule({ kind: RULE_KINDS.UNUSUAL_MOVE, params: { zscore: 2 } });
  assert.equal(evaluateRule(rule, asset({ analysis: { volatility: { zScore: 2.5 } } })).met, true);
  assert.equal(evaluateRule(rule, asset({ analysis: { volatility: { zScore: -2.5 } } })).met, true);
  assert.equal(evaluateRule(rule, asset({ analysis: { volatility: { zScore: 1.2 } } })).met, false);
});

test('regime_change needs a previous regime and an actual change', () => {
  const rule = createRule({ kind: RULE_KINDS.REGIME_CHANGE, params: { to: 'bear' } });
  const noPrev = asset({ analysis: { regime: { regime: 'bear', confidence: 80 } } });
  assert.equal(evaluateRule(rule, noPrev).met, false, 'first observation is not a change');

  const changed = asset({
    previousRegime: 'bull',
    analysis: { regime: { regime: 'bear', confidence: 80 } },
  });
  assert.equal(evaluateRule(rule, changed).met, true);

  const unchanged = asset({
    previousRegime: 'bear',
    analysis: { regime: { regime: 'bear', confidence: 80 } },
  });
  assert.equal(evaluateRule(rule, unchanged).met, false);
});

test('regime_change to "any" fires on any transition', () => {
  const rule = createRule({ kind: RULE_KINDS.REGIME_CHANGE, params: { to: 'any' } });
  const a = asset({ previousRegime: 'sideways', analysis: { regime: { regime: 'bull', confidence: 70 } } });
  assert.equal(evaluateRule(rule, a).met, true);
});

// --- Edge triggering and cooldown: the anti-spam guarantees -----------------

test('a rule fires once on the rising edge, not on every poll', () => {
  const rule = createRule({
    symbol: 'BTC', assetType: 'crypto',
    kind: RULE_KINDS.PRICE_ABOVE, params: { value: 100 }, cooldownMinutes: 0,
  });
  const map = new Map();
  const put = (price) => map.set(assetKey('crypto', 'BTC'), asset({ analysis: { price } }));

  put(99);
  assert.equal(evaluateAll([rule], map).length, 0, 'below target: silent');

  put(105);
  assert.equal(evaluateAll([rule], map).length, 1, 'crossing up: fires once');

  put(110);
  assert.equal(evaluateAll([rule], map).length, 0, 'still above: stays quiet');

  put(120);
  assert.equal(evaluateAll([rule], map).length, 0, 'still above: still quiet');
});

test('a rule re-arms after the condition clears', () => {
  const rule = createRule({
    symbol: 'BTC', assetType: 'crypto',
    kind: RULE_KINDS.PRICE_ABOVE, params: { value: 100 }, cooldownMinutes: 0,
  });
  const map = new Map();
  const put = (price) => map.set(assetKey('crypto', 'BTC'), asset({ analysis: { price } }));

  put(105);
  assert.equal(evaluateAll([rule], map).length, 1);
  put(95);
  assert.equal(evaluateAll([rule], map).length, 0, 'falling back below re-arms');
  put(105);
  assert.equal(evaluateAll([rule], map).length, 1, 'crossing again fires again');
});

test('cooldown suppresses a rapid re-cross', () => {
  const rule = createRule({
    symbol: 'BTC', assetType: 'crypto',
    kind: RULE_KINDS.PRICE_ABOVE, params: { value: 100 }, cooldownMinutes: 60,
  });
  const map = new Map();
  const put = (price) => map.set(assetKey('crypto', 'BTC'), asset({ analysis: { price } }));
  const t0 = 1_700_000_000_000;

  put(105);
  assert.equal(evaluateAll([rule], map, t0).length, 1);

  put(95);
  evaluateAll([rule], map, t0 + 60_000);          // re-arm
  put(105);
  assert.equal(evaluateAll([rule], map, t0 + 120_000).length, 0, 'within cooldown: suppressed');

  put(95);
  evaluateAll([rule], map, t0 + 3_700_000);       // re-arm after cooldown
  put(105);
  assert.equal(evaluateAll([rule], map, t0 + 3_800_000).length, 1, 'after cooldown: fires');
});

test('a one-shot rule disables itself after firing', () => {
  const rule = createRule({
    symbol: 'BTC', assetType: 'crypto', kind: RULE_KINDS.PRICE_ABOVE,
    params: { value: 100 }, repeat: false, cooldownMinutes: 0,
  });
  const map = new Map([[assetKey('crypto', 'BTC'), asset({ analysis: { price: 105 } })]]);
  assert.equal(evaluateAll([rule], map).length, 1);
  assert.equal(rule.enabled, false);
});

test('disabled rules are skipped entirely', () => {
  const rule = createRule({
    symbol: 'BTC', assetType: 'crypto', kind: RULE_KINDS.PRICE_ABOVE,
    params: { value: 100 }, enabled: false,
  });
  const map = new Map([[assetKey('crypto', 'BTC'), asset({ analysis: { price: 999 } })]]);
  assert.equal(evaluateAll([rule], map).length, 0);
});

test('a rule for an unwatched symbol is ignored, not crashed on', () => {
  const rule = createRule({ symbol: 'DOGE', assetType: 'crypto', kind: RULE_KINDS.PRICE_ABOVE, params: { value: 1 } });
  assert.doesNotThrow(() => evaluateAll([rule], new Map()));
  assert.equal(evaluateAll([rule], new Map()).length, 0);
});

test('rules with missing params never fire and never throw', () => {
  const map = new Map([[assetKey('crypto', 'BTC'), asset()]]);
  for (const kind of Object.values(RULE_KINDS)) {
    const rule = createRule({ symbol: 'BTC', assetType: 'crypto', kind, params: {} });
    assert.doesNotThrow(() => evaluateAll([rule], map), `${kind} threw on empty params`);
  }
});

test('assetKey is case-insensitive on the symbol', () => {
  assert.equal(assetKey('crypto', 'btc'), assetKey('crypto', 'BTC'));
});

test('describeRule produces a readable line for every rule kind', () => {
  for (const kind of Object.values(RULE_KINDS)) {
    const rule = createRule({
      symbol: 'BTC', kind,
      params: { value: 100, percent: 5, direction: 'up', level: 70, zscore: 2, to: 'bear' },
    });
    const text = describeRule(rule);
    assert.ok(typeof text === 'string' && text.length > 5, `${kind} -> "${text}"`);
    assert.ok(text.includes('BTC'));
  }
});

test('every fired event carries what a notification needs', () => {
  const rule = createRule({
    symbol: 'BTC', assetType: 'crypto', kind: RULE_KINDS.PRICE_ABOVE,
    params: { value: 100 }, note: 'take profit here',
  });
  const map = new Map([[assetKey('crypto', 'BTC'), asset({ analysis: { price: 150 } })]]);
  const [event] = evaluateAll([rule], map);
  assert.equal(event.symbol, 'BTC');
  assert.equal(event.ruleId, rule.id);
  assert.equal(event.note, 'take profit here');
  assert.ok(event.message.includes('BTC'));
  assert.ok(event.firedAt > 0);
  assert.ok(Object.values(SEVERITY).includes(event.severity));
});
