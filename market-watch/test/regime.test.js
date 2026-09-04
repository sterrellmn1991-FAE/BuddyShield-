import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRegime, summariseBreadth, REGIMES, REGIME_THRESHOLDS } from '../js/analysis/regime.js';

/** Build a series that trends at `dailyPct` per bar with mild deterministic noise. */
function trend(n, start, dailyPct, noise = 0) {
  const out = [start];
  for (let i = 1; i < n; i++) {
    const wobble = noise ? Math.sin(i / 3) * noise : 0;
    out.push(out[i - 1] * (1 + dailyPct / 100 + wobble / 100));
  }
  return out;
}

test('a long, steady uptrend is classified bullish', () => {
  const r = classifyRegime(trend(300, 100, 0.15), 'stock');
  assert.equal(r.regime, REGIMES.BULL);
  assert.ok(r.confidence >= 70, `confidence was ${r.confidence}`);
  assert.ok(r.reasons.length > 0);
});

test('a long, steady downtrend is classified bearish', () => {
  const r = classifyRegime(trend(300, 100, -0.15), 'stock');
  assert.equal(r.regime, REGIMES.BEAR);
  assert.ok(r.metrics.drawdown <= REGIME_THRESHOLDS.stock.bear);
});

test('a -12% pullback from the highs is a correction, not a bear market', () => {
  // Rise for a long while, then give back 12% — deep enough to sting,
  // not deep enough to meet the -20% bear definition.
  const up = trend(260, 100, 0.12);
  const peak = up.at(-1);
  const down = [];
  for (let i = 1; i <= 25; i++) down.push(peak * (1 - (0.12 * i) / 25));
  const r = classifyRegime([...up, ...down], 'stock');
  assert.ok(r.metrics.drawdown < -10 && r.metrics.drawdown > -20,
    `drawdown was ${r.metrics.drawdown}`);
  assert.notEqual(r.regime, REGIMES.BULL);
  assert.notEqual(r.regime, REGIMES.BEAR);
});

test('a flat market is classified sideways, not bullish', () => {
  const flat = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 10) * 0.4);
  const r = classifyRegime(flat, 'stock');
  assert.equal(r.regime, REGIMES.SIDEWAYS);
});

test('a deep crash that has not reclaimed its long-term average is NOT bullish', () => {
  // This is the bear-market-rally trap: a huge bounce off the lows that
  // still sits below the 200-day. It must never be reported as a bull market.
  const up = trend(200, 100, 0.1);
  const crash = [];
  const peak = up.at(-1);
  for (let i = 1; i <= 60; i++) crash.push(peak * (1 - (0.5 * i) / 60));
  const bounce = [];
  const bottom = crash.at(-1);
  for (let i = 1; i <= 30; i++) bounce.push(bottom * (1 + (0.3 * i) / 30));
  const r = classifyRegime([...up, ...crash, ...bounce], 'stock');
  assert.notEqual(r.regime, REGIMES.BULL);
  assert.ok([REGIMES.BEAR, REGIMES.RECOVERY].includes(r.regime), `got ${r.regime}`);
});

test('crypto thresholds are wider than stock thresholds', () => {
  assert.ok(REGIME_THRESHOLDS.crypto.bear < REGIME_THRESHOLDS.stock.bear);
  assert.ok(REGIME_THRESHOLDS.crypto.correction < REGIME_THRESHOLDS.stock.correction);
});

test('the same -25% drawdown reads bearish for a stock but not for crypto', () => {
  // A 25% drawdown clears the equity bear threshold (-20%) but not the
  // crypto one (-35%). Identical prices, different verdicts, on purpose.
  const up = trend(260, 100, 0.12);
  const peak = up.at(-1);
  const down = [];
  for (let i = 1; i <= 40; i++) down.push(peak * (1 - (0.25 * i) / 40));
  const series = [...up, ...down];

  const asStock = classifyRegime(series, 'stock');
  const asCrypto = classifyRegime(series, 'crypto');
  assert.equal(asStock.regime, REGIMES.BEAR);
  assert.notEqual(asCrypto.regime, REGIMES.BEAR);
});

test('too little history returns unknown rather than guessing', () => {
  const r = classifyRegime([100, 101, 102], 'stock');
  assert.equal(r.regime, REGIMES.UNKNOWN);
  assert.equal(r.confidence, 0);
});

test('classification always explains itself', () => {
  const r = classifyRegime(trend(300, 100, 0.15), 'stock');
  assert.ok(Array.isArray(r.reasons) && r.reasons.length >= 3,
    'a verdict with no reasons is not auditable');
  assert.ok(r.description.length > 20);
});

test('confidence is a percentage between 0 and 100', () => {
  for (const rate of [0.2, 0.05, 0, -0.05, -0.2]) {
    const r = classifyRegime(trend(300, 100, rate), 'stock');
    assert.ok(r.confidence >= 0 && r.confidence <= 100, `confidence ${r.confidence}`);
  }
});

test('summariseBreadth counts regimes and calls the overall mood', () => {
  const mk = (regime) => ({ analysis: { regime: { regime } } });
  const riskOn = summariseBreadth([mk('bull'), mk('bull'), mk('bull'), mk('sideways')]);
  assert.equal(riskOn.counts.bull, 3);
  assert.equal(riskOn.mood, 'Risk-on');

  const riskOff = summariseBreadth([mk('bear'), mk('bear'), mk('correction'), mk('bull')]);
  assert.equal(riskOff.mood, 'Risk-off');

  const mixed = summariseBreadth([mk('bull'), mk('bear'), mk('sideways')]);
  assert.equal(mixed.mood, 'Mixed');
});

test('summariseBreadth handles an empty watchlist', () => {
  const s = summariseBreadth([]);
  assert.equal(s.total, 0);
  assert.equal(s.mood, 'Mixed');
});
