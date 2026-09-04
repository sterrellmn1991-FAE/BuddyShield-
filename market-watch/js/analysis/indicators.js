/**
 * Technical indicators.
 *
 * Conventions used throughout this file:
 *  - Input is a plain array of numbers, oldest first, newest last.
 *  - Output is an array of the SAME length as the input, so index i of the
 *    result always lines up with index i of the input (which is what the
 *    charts and the alert engine both assume).
 *  - Positions with insufficient history to compute a value are `null`,
 *    never 0 and never NaN. Callers use `last()` to grab the newest value.
 */

import { isFiniteNumber } from '../util.js';

/** Simple moving average. */
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` bars.
 * Seeding with an SMA (rather than the first close) is the standard approach
 * and keeps the early values from being dragged around by a single print.
 */
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Relative Strength Index using Wilder's smoothing (the original 1978
 * definition, and what every charting package means by "RSI 14").
 * Returns values in 0..100.
 */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    // Wilder smoothing: equivalent to an EMA with alpha = 1/period.
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain, avgLoss) {
  // An unbroken run of gains means no losses to divide by; RSI saturates at 100.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD. Returns three aligned arrays:
 *   macd      = EMA(fast) - EMA(slow)
 *   signal    = EMA(macd, signalPeriod)
 *   histogram = macd - signal
 *
 * The signal line is an EMA of the MACD line, which only exists once the slow
 * EMA does, so we compute it over the defined slice and map it back into place.
 */
export function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const n = values.length;
  const empty = () => new Array(n).fill(null);
  const result = { macd: empty(), signal: empty(), histogram: empty() };
  if (n < slowPeriod) return result;

  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);

  const macdLine = empty();
  const defined = [];
  const definedIdx = [];
  for (let i = 0; i < n; i++) {
    if (fast[i] !== null && slow[i] !== null) {
      macdLine[i] = fast[i] - slow[i];
      defined.push(macdLine[i]);
      definedIdx.push(i);
    }
  }
  result.macd = macdLine;
  if (defined.length < signalPeriod) return result;

  const signalDefined = ema(defined, signalPeriod);
  for (let j = 0; j < signalDefined.length; j++) {
    if (signalDefined[j] === null) continue;
    const i = definedIdx[j];
    result.signal[i] = signalDefined[j];
    result.histogram[i] = macdLine[i] - signalDefined[j];
  }
  return result;
}

/** True Range per bar. Index 0 falls back to high-low (no previous close). */
export function trueRange(highs, lows, closes) {
  const out = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      out[i] = highs[i] - lows[i];
      continue;
    }
    const prevClose = closes[i - 1];
    out[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - prevClose),
      Math.abs(lows[i] - prevClose),
    );
  }
  return out;
}

/** Average True Range, Wilder-smoothed. */
export function atr(highs, lows, closes, period = 14) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n <= period) return out;
  const tr = trueRange(highs, lows, closes);

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Rolling sample standard deviation (n-1 denominator). */
export function stdev(values, period) {
  const out = new Array(values.length).fill(null);
  if (period < 2 || values.length < period) return out;
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / (period - 1));
  }
  return out;
}

/** Bar-over-bar simple returns as percentages. First entry is null. */
export function returns(values) {
  const out = new Array(values.length).fill(null);
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    out[i] = prev === 0 ? null : ((values[i] - prev) / Math.abs(prev)) * 100;
  }
  return out;
}

/** Highest value over the trailing `period` bars (inclusive). */
export function rollingMax(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    let m = -Infinity;
    for (let j = start; j <= i; j++) if (values[j] > m) m = values[j];
    out[i] = m;
  }
  return out;
}

/** Lowest value over the trailing `period` bars (inclusive). */
export function rollingMin(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    let m = Infinity;
    for (let j = start; j <= i; j++) if (values[j] < m) m = values[j];
    out[i] = m;
  }
  return out;
}

/**
 * Drawdown (%) of the latest close from the highest close in the lookback
 * window. Always <= 0. This is the number that decides "correction" vs "bear".
 */
export function drawdownFromPeak(values, period = 252) {
  if (!values.length) return null;
  const i = values.length - 1;
  const start = Math.max(0, i - period + 1);
  let peak = -Infinity;
  for (let j = start; j <= i; j++) if (values[j] > peak) peak = values[j];
  if (!isFiniteNumber(peak) || peak === 0) return null;
  return ((values[i] - peak) / peak) * 100;
}

/**
 * Run-up (%) of the latest close from the lowest close in the lookback window.
 * Always >= 0. This is the "+20% off the lows" half of the bull definition.
 */
export function runUpFromTrough(values, period = 252) {
  if (!values.length) return null;
  const i = values.length - 1;
  const start = Math.max(0, i - period + 1);
  let trough = Infinity;
  for (let j = start; j <= i; j++) if (values[j] < trough) trough = values[j];
  if (!isFiniteNumber(trough) || trough === 0) return null;
  return ((values[i] - trough) / trough) * 100;
}

/**
 * Slope of a series over the last `bars`, expressed as percent change of the
 * line per bar. Used to ask "is the 50-day average actually rising?" rather
 * than only "is price above it?".
 */
export function slopePctPerBar(values, bars = 20) {
  const defined = values.filter((v) => v !== null && Number.isFinite(v));
  if (defined.length < bars + 1) return null;
  const end = defined[defined.length - 1];
  const start = defined[defined.length - 1 - bars];
  if (!isFiniteNumber(start) || start === 0) return null;
  return ((end - start) / Math.abs(start)) * 100 / bars;
}

/**
 * Detect a crossover between two aligned series within the last `lookback`
 * bars. Returns { direction: 'bullish'|'bearish', barsAgo } or null.
 * "Bullish" means series `a` crossed from at-or-below `b` to above it.
 */
export function detectCross(a, b, lookback = 5) {
  const n = Math.min(a.length, b.length);
  for (let i = n - 1; i >= 1 && n - 1 - i < lookback; i--) {
    const prevA = a[i - 1];
    const prevB = b[i - 1];
    const curA = a[i];
    const curB = b[i];
    if ([prevA, prevB, curA, curB].some((v) => v === null || !Number.isFinite(v))) continue;
    if (prevA <= prevB && curA > curB) return { direction: 'bullish', barsAgo: n - 1 - i };
    if (prevA >= prevB && curA < curB) return { direction: 'bearish', barsAgo: n - 1 - i };
  }
  return null;
}

/**
 * Z-score of the most recent return against the trailing distribution of
 * returns. |z| >= 2 is the "this move is unusual for this asset" signal.
 */
export function returnZScore(closes, period = 30) {
  const rets = returns(closes).filter((r) => r !== null);
  if (rets.length < period + 1) return null;
  const window = rets.slice(-period - 1, -1); // exclude the latest from its own baseline
  const latest = rets[rets.length - 1];
  const mean = window.reduce((s, r) => s + r, 0) / window.length;
  const variance = window.reduce((s, r) => s + (r - mean) ** 2, 0) / (window.length - 1);
  const sd = Math.sqrt(variance);
  if (!isFiniteNumber(sd) || sd === 0) return null;
  return (latest - mean) / sd;
}
