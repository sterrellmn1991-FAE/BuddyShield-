/**
 * Signal derivation: turns a raw price series into the compact set of facts
 * the UI renders and the alert engine evaluates. One pass, one shape, so the
 * dashboard and the alerts can never disagree about what the data says.
 */

import { rsi, macd, atr, detectCross, returnZScore, returns, sma } from './indicators.js';
import { classifyRegime } from './regime.js';
import { last, pctChange, isFiniteNumber } from '../util.js';

export const RSI_OVERBOUGHT = 70;
export const RSI_OVERSOLD = 30;
/** |z| at or above this counts as an unusual move for that asset. */
export const UNUSUAL_MOVE_Z = 2;

/**
 * @param {{closes:number[], highs?:number[], lows?:number[], timestamps?:number[]}} series
 * @param {'stock'|'crypto'} assetType
 */
export function analyseSeries(series, assetType = 'stock') {
  const closes = (series?.closes || []).filter(isFiniteNumber);
  // Some providers give closes only. Synthesising H/L from closes makes ATR
  // conservative (it understates true range) but keeps the pipeline working
  // instead of dropping volatility analysis entirely.
  const highs = series?.highs?.length === closes.length ? series.highs : closes;
  const lows = series?.lows?.length === closes.length ? series.lows : closes;

  const price = last(closes);
  const prev = closes.length >= 2 ? closes[closes.length - 2] : null;

  const regime = classifyRegime(closes, assetType);

  const rsiSeries = rsi(closes, 14);
  const rsiValue = last(rsiSeries);
  const rsiState = rsiValue === null
    ? 'unknown'
    : rsiValue >= RSI_OVERBOUGHT ? 'overbought'
      : rsiValue <= RSI_OVERSOLD ? 'oversold'
        : 'neutral';

  const macdResult = macd(closes, 12, 26, 9);
  const macdCross = detectCross(macdResult.macd, macdResult.signal, 5);
  const histogram = last(macdResult.histogram);

  const atrSeries = atr(highs, lows, closes, 14);
  const atrValue = last(atrSeries);
  const atrPct = isFiniteNumber(atrValue) && isFiniteNumber(price) && price !== 0
    ? (atrValue / price) * 100
    : null;

  const z = returnZScore(closes, 30);
  const dayChangePct = pctChange(prev, price);

  // Volatility band relative to the asset's own history, not an absolute
  // number — 3% daily range is calm for a small-cap crypto and alarming for
  // a utility stock.
  const atrHistory = atrSeries.filter(isFiniteNumber);
  const atrMedian = median(atrHistory.slice(-120));
  const volState = !isFiniteNumber(atrValue) || !isFiniteNumber(atrMedian) || atrMedian === 0
    ? 'unknown'
    : atrValue > atrMedian * 1.5 ? 'elevated'
      : atrValue < atrMedian * 0.6 ? 'compressed'
        : 'normal';

  return {
    price,
    dayChangePct,
    regime,
    momentum: {
      rsi: rsiValue,
      rsiState,
      macd: last(macdResult.macd),
      macdSignal: last(macdResult.signal),
      macdHistogram: histogram,
      macdCross,                            // {direction, barsAgo} | null
      macdBias: isFiniteNumber(histogram) ? (histogram > 0 ? 'bullish' : 'bearish') : 'unknown',
    },
    volatility: {
      atr: atrValue,
      atrPct,
      atrMedian,
      state: volState,
      zScore: z,
      isUnusualMove: isFiniteNumber(z) && Math.abs(z) >= UNUSUAL_MOVE_Z,
    },
    series: {
      closes,
      timestamps: series?.timestamps || [],
      sma50: sma(closes, 50),
      sma200: closes.length >= 200 ? sma(closes, 200) : sma(closes, Math.floor(closes.length / 2)),
      macd: macdResult,
      rsi: rsiSeries,
      returns: returns(closes),
    },
  };
}

function median(arr) {
  const v = arr.filter(isFiniteNumber).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Short human-readable headline for a card, e.g.
 * "Bullish · momentum cooling · unusually large move today".
 */
export function describeAnalysis(analysis) {
  if (!analysis) return '';
  const parts = [analysis.regime.label];
  const m = analysis.momentum;
  if (m.rsiState === 'overbought') parts.push('overbought (RSI ' + Math.round(m.rsi) + ')');
  else if (m.rsiState === 'oversold') parts.push('oversold (RSI ' + Math.round(m.rsi) + ')');
  if (m.macdCross) {
    parts.push(`${m.macdCross.direction} MACD cross ${m.macdCross.barsAgo === 0 ? 'today' : m.macdCross.barsAgo + ' bars ago'}`);
  }
  if (analysis.volatility.isUnusualMove) {
    const dir = analysis.volatility.zScore > 0 ? 'up' : 'down';
    parts.push(`unusually large move ${dir} (${analysis.volatility.zScore.toFixed(1)}σ)`);
  } else if (analysis.volatility.state === 'elevated') {
    parts.push('volatility elevated');
  } else if (analysis.volatility.state === 'compressed') {
    parts.push('volatility compressed');
  }
  return parts.join(' · ');
}
