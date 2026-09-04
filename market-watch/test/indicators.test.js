import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sma, ema, rsi, macd, atr, trueRange, stdev, returns,
  drawdownFromPeak, runUpFromTrough, slopePctPerBar, detectCross, returnZScore,
} from '../js/analysis/indicators.js';

const approx = (a, b, tol = 1e-6) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (tolerance ${tol})`);

test('sma: aligns output to input and warms up with nulls', () => {
  const out = sma([1, 2, 3, 4, 5], 3);
  assert.equal(out.length, 5);
  assert.deepEqual(out.slice(0, 2), [null, null]);
  approx(out[2], 2); // (1+2+3)/3
  approx(out[3], 3);
  approx(out[4], 4);
});

test('sma: returns all nulls when history is shorter than the period', () => {
  assert.deepEqual(sma([1, 2], 5), [null, null]);
});

test('ema: seeds from the SMA of the first period', () => {
  // Hand-derived: seed = SMA(1,2,3) = 2, k = 2/(3+1) = 0.5
  //   out[3] = 4*0.5 + 2*0.5 = 3
  //   out[4] = 5*0.5 + 3*0.5 = 4   (chains off out[3], not the seed)
  const out = ema([1, 2, 3, 4, 5], 3);
  approx(out[2], 2);
  approx(out[3], 3);
  approx(out[4], 4);
});

test('rsi: a pure uptrend saturates at 100, a pure downtrend at 0', () => {
  const up = Array.from({ length: 40 }, (_, i) => 100 + i);
  const down = Array.from({ length: 40 }, (_, i) => 100 - i);
  approx(rsi(up, 14).at(-1), 100, 1e-9);
  approx(rsi(down, 14).at(-1), 0, 1e-9);
});

test('rsi: matches a hand-computed Wilder RSI-14', () => {
  // The canonical RSI worked-example closes. Over the 14 changes spanning
  // these 15 bars: gains sum to 3.34, losses to 1.40, so
  //   avgGain = 3.34/14 = 0.2385714, avgLoss = 1.40/14 = 0.10
  //   RS = 2.3857143  ->  RSI = 100 - 100/(1+RS) = 70.464135
  // (Tables quoting ~70.53 for "this" dataset align the window one bar
  // differently; the arithmetic above is what RSI-14 means on these 15 bars.)
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
  ];
  const out = rsi(closes, 14);
  assert.equal(out[13], null, 'no value before enough history');
  approx(out[14], 70.464135, 1e-5);
});

test('rsi: a flat series sits at the neutral midpoint', () => {
  const flat = new Array(30).fill(50);
  approx(rsi(flat, 14).at(-1), 50);
});

test('macd: histogram equals macd minus signal wherever both exist', () => {
  const closes = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 6) * 10 + i * 0.2);
  const m = macd(closes);
  let checked = 0;
  for (let i = 0; i < closes.length; i++) {
    if (m.macd[i] !== null && m.signal[i] !== null) {
      approx(m.histogram[i], m.macd[i] - m.signal[i], 1e-9);
      checked++;
    }
  }
  assert.ok(checked > 50, `expected many defined points, got ${checked}`);
});

test('macd: on a steadily rising series the fast EMA leads, so macd is positive', () => {
  const closes = Array.from({ length: 100 }, (_, i) => 100 + i);
  assert.ok(macd(closes).macd.at(-1) > 0);
});

test('trueRange: uses the previous close when it gaps beyond the current bar', () => {
  const highs = [10, 12];
  const lows = [9, 11];
  const closes = [9.5, 11.5];
  const tr = trueRange(highs, lows, closes);
  approx(tr[0], 1);               // first bar: high - low
  approx(tr[1], 2.5);             // |high - prevClose| = |12 - 9.5|
});

test('atr: on constant-range bars equals that range', () => {
  const n = 40;
  const highs = new Array(n).fill(101);
  const lows = new Array(n).fill(99);
  const closes = new Array(n).fill(100);
  approx(atr(highs, lows, closes, 14).at(-1), 2, 1e-6);
});

test('stdev: matches a hand-computed sample standard deviation', () => {
  const out = stdev([2, 4, 4, 4, 5, 5, 7, 9], 8);
  approx(out[7], Math.sqrt(32 / 7), 1e-9);
});

test('returns: first entry is null, rest are percentages', () => {
  const r = returns([100, 110, 99]);
  assert.equal(r[0], null);
  approx(r[1], 10);
  approx(r[2], -10);
});

test('drawdownFromPeak / runUpFromTrough: signs and magnitudes', () => {
  const closes = [100, 120, 150, 90, 100];
  approx(drawdownFromPeak(closes, 252), ((100 - 150) / 150) * 100);
  approx(runUpFromTrough(closes, 252), ((100 - 90) / 90) * 100);
  assert.ok(drawdownFromPeak(closes, 252) <= 0);
  assert.ok(runUpFromTrough(closes, 252) >= 0);
});

test('drawdownFromPeak: respects the lookback window', () => {
  // The 150 peak is outside a 2-bar window, so recent drawdown is shallower.
  const closes = [100, 150, 120, 118];
  const short = drawdownFromPeak(closes, 2);
  const long = drawdownFromPeak(closes, 252);
  assert.ok(short > long, `${short} should be shallower than ${long}`);
});

test('slopePctPerBar: positive on a rising line, negative on a falling one', () => {
  const rising = Array.from({ length: 50 }, (_, i) => 100 + i);
  const falling = Array.from({ length: 50 }, (_, i) => 100 - i);
  assert.ok(slopePctPerBar(rising, 20) > 0);
  assert.ok(slopePctPerBar(falling, 20) < 0);
  assert.equal(slopePctPerBar(new Array(50).fill(100), 20), 0);
});

test('detectCross: finds a bullish cross and reports how long ago', () => {
  const a = [1, 2, 3, 6, 7];
  const b = [5, 5, 5, 5, 5];
  const cross = detectCross(a, b, 5);
  assert.equal(cross.direction, 'bullish');
  assert.equal(cross.barsAgo, 1);   // crossed at index 3, latest index is 4
});

test('detectCross: finds a bearish cross', () => {
  const a = [9, 8, 7, 3];
  const b = [5, 5, 5, 5];
  const cross = detectCross(a, b, 5);
  assert.equal(cross.direction, 'bearish');
  assert.equal(cross.barsAgo, 0);
});

test('detectCross: returns null when the cross is outside the lookback', () => {
  const a = [1, 6, 7, 8, 9, 10];
  const b = new Array(6).fill(5);
  assert.equal(detectCross(a, b, 2), null);
});

test('detectCross: ignores nulls from indicator warm-up', () => {
  const a = [null, null, 1, 9];
  const b = [null, null, 5, 5];
  assert.equal(detectCross(a, b, 5).direction, 'bullish');
});

test('returnZScore: a calm series then a shock scores high', () => {
  const closes = [100];
  for (let i = 1; i < 60; i++) closes.push(closes[i - 1] * (1 + (i % 2 ? 0.001 : -0.001)));
  closes.push(closes.at(-1) * 1.15);       // a 15% jump after 0.1% noise
  const z = returnZScore(closes, 30);
  assert.ok(z > 5, `expected a large z-score, got ${z}`);
});

test('returnZScore: the latest bar is excluded from its own baseline', () => {
  // If the shock were included in the mean/sd it would shrink its own z-score.
  const calm = Array.from({ length: 60 }, (_, i) => 100 + (i % 2));
  const withShock = [...calm, calm.at(-1) * 1.5];
  assert.ok(returnZScore(withShock, 30) > 2);
});

test('indicators return arrays aligned to input length', () => {
  const closes = Array.from({ length: 90 }, (_, i) => 100 + i);
  for (const arr of [sma(closes, 20), ema(closes, 20), rsi(closes, 14), macd(closes).macd]) {
    assert.equal(arr.length, closes.length);
  }
});

test('indicators tolerate empty input without throwing', () => {
  assert.deepEqual(sma([], 5), []);
  assert.deepEqual(rsi([], 14), []);
  assert.equal(drawdownFromPeak([], 252), null);
  assert.equal(returnZScore([], 30), null);
});
