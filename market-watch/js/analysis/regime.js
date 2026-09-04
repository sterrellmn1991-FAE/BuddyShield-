/**
 * Market regime classification.
 *
 * The question "is this bullish?" has a conventional answer in equities:
 * +20% off the lows is a bull market, -20% off the highs is a bear market,
 * and -10% is a correction. Those numbers are useless applied to crypto,
 * where a 20% drawdown is an ordinary week. So thresholds are per asset
 * class, and everything else about the method stays the same.
 *
 * Classification never rests on a single number. We gather independent
 * pieces of evidence — drawdown, run-up, price vs the 200-day, the 50/200
 * relationship, and the slope of the 50-day — and report both the verdict
 * and the reasons behind it, so the call is auditable rather than magic.
 */

import { sma, drawdownFromPeak, runUpFromTrough, slopePctPerBar, detectCross } from './indicators.js';
import { last, isFiniteNumber } from '../util.js';

/**
 * Drawdown/run-up thresholds by asset class, in percent.
 * `correction` and `bear` are negative; `bull` is positive.
 */
export const REGIME_THRESHOLDS = {
  stock: { correction: -10, bear: -20, bull: 20, flatSlope: 0.05 },
  crypto: { correction: -20, bear: -35, bull: 40, flatSlope: 0.12 },
};

export const REGIMES = {
  BULL: 'bull',
  BEAR: 'bear',
  CORRECTION: 'correction',
  RECOVERY: 'recovery',
  SIDEWAYS: 'sideways',
  UNKNOWN: 'unknown',
};

export const REGIME_LABELS = {
  bull: 'Bullish',
  bear: 'Bearish',
  correction: 'Correction',
  recovery: 'Recovery',
  sideways: 'Sideways',
  unknown: 'Not enough data',
};

/**
 * Longer-form descriptions, shown in the detail panel. These are meant to be
 * read by someone who does not already know what a golden cross is.
 */
export const REGIME_DESCRIPTIONS = {
  bull: 'Price is well off its lows and trading above its long-term average, with the short-term average above the long-term one. This is what a sustained uptrend looks like.',
  bear: 'Price has fallen far enough from its high, and sits below its long-term average, to meet the conventional definition of a bear market. Rallies inside this state often fail.',
  correction: 'A meaningful pullback from the highs, but not deep enough to qualify as a bear market. Corrections resolve in both directions — this is genuinely ambiguous.',
  recovery: 'Price has bounced hard off its lows but has not yet reclaimed its long-term average. This shape is common both at real bottoms and in bear-market rallies, so treat it as unconfirmed.',
  sideways: 'No decisive trend. The long-term average is flat and price is not far from its highs. Trend-following signals are least reliable in this state.',
  unknown: 'Not enough price history to classify the trend. At least 60 daily bars are needed; 200+ gives a reliable read.',
};

/**
 * Classify a price series.
 *
 * @param {number[]} closes  Daily closes, oldest first.
 * @param {'stock'|'crypto'} assetType
 * @returns {{
 *   regime: string, label: string, confidence: number, reasons: string[],
 *   metrics: object, description: string
 * }}
 */
export function classifyRegime(closes, assetType = 'stock') {
  const t = REGIME_THRESHOLDS[assetType] || REGIME_THRESHOLDS.stock;
  const clean = (closes || []).filter(isFiniteNumber);

  if (clean.length < 60) {
    return {
      regime: REGIMES.UNKNOWN,
      label: REGIME_LABELS.unknown,
      confidence: 0,
      reasons: [`Only ${clean.length} bars of history available; need at least 60.`],
      description: REGIME_DESCRIPTIONS.unknown,
      metrics: {},
    };
  }

  // With less than a full year of data, scale the lookback down rather than
  // refusing to answer — a 90-bar series still has a meaningful high and low.
  const lookback = Math.min(252, clean.length);
  const price = last(clean);
  const sma50 = sma(clean, 50);
  const sma200 = clean.length >= 200 ? sma(clean, 200) : sma(clean, Math.floor(clean.length / 2));
  const longMaPeriod = clean.length >= 200 ? 200 : Math.floor(clean.length / 2);

  const ma50 = last(sma50);
  const ma200 = last(sma200);
  const drawdown = drawdownFromPeak(clean, lookback);
  const runUp = runUpFromTrough(clean, lookback);
  const slope50 = slopePctPerBar(sma50, 20);
  const cross = detectCross(sma50, sma200, 30);

  const metrics = {
    price, ma50, ma200, longMaPeriod, drawdown, runUp, slope50,
    lookbackBars: lookback,
    aboveLongMa: isFiniteNumber(ma200) ? price > ma200 : null,
    goldenCross: cross && cross.direction === 'bullish' ? cross.barsAgo : null,
    deathCross: cross && cross.direction === 'bearish' ? cross.barsAgo : null,
    thresholds: t,
  };

  // Independent votes. Each is worth evidence toward a regime; we tally them
  // to produce a confidence figure rather than pretending the call is binary.
  const bullVotes = [];
  const bearVotes = [];
  const reasons = [];

  if (isFiniteNumber(drawdown)) {
    if (drawdown <= t.bear) {
      bearVotes.push('drawdown');
      reasons.push(`Down ${Math.abs(drawdown).toFixed(1)}% from its ${lookback}-bar high (bear threshold is ${Math.abs(t.bear)}%).`);
    } else if (drawdown <= t.correction) {
      bearVotes.push('correction-drawdown');
      reasons.push(`Down ${Math.abs(drawdown).toFixed(1)}% from its ${lookback}-bar high (correction territory starts at ${Math.abs(t.correction)}%).`);
    } else {
      bullVotes.push('shallow-drawdown');
      reasons.push(`Only ${Math.abs(drawdown).toFixed(1)}% below its ${lookback}-bar high.`);
    }
  }

  if (isFiniteNumber(runUp) && runUp >= t.bull) {
    bullVotes.push('runup');
    reasons.push(`Up ${runUp.toFixed(1)}% from its ${lookback}-bar low (bull threshold is ${t.bull}%).`);
  }

  if (isFiniteNumber(ma200)) {
    if (price > ma200) {
      bullVotes.push('above-long-ma');
      reasons.push(`Trading above its ${longMaPeriod}-day average.`);
    } else {
      bearVotes.push('below-long-ma');
      reasons.push(`Trading below its ${longMaPeriod}-day average.`);
    }
  }

  if (isFiniteNumber(ma50) && isFiniteNumber(ma200)) {
    if (ma50 > ma200) {
      bullVotes.push('ma-stack');
      reasons.push('50-day average is above the long-term average (bullish stack).');
    } else {
      bearVotes.push('ma-stack');
      reasons.push('50-day average is below the long-term average (bearish stack).');
    }
  }

  if (metrics.goldenCross !== null) {
    bullVotes.push('golden-cross');
    reasons.push(`Golden cross ${metrics.goldenCross} bar(s) ago — the 50-day crossed above the long-term average.`);
  }
  if (metrics.deathCross !== null) {
    bearVotes.push('death-cross');
    reasons.push(`Death cross ${metrics.deathCross} bar(s) ago — the 50-day crossed below the long-term average.`);
  }

  let trendIsFlat = false;
  if (isFiniteNumber(slope50)) {
    if (Math.abs(slope50) < t.flatSlope) {
      trendIsFlat = true;
      reasons.push(`The 50-day average is essentially flat (${slope50.toFixed(3)}%/bar).`);
    } else if (slope50 > 0) {
      bullVotes.push('slope');
      reasons.push(`The 50-day average is rising (${slope50.toFixed(3)}%/bar).`);
    } else {
      bearVotes.push('slope');
      reasons.push(`The 50-day average is falling (${slope50.toFixed(3)}%/bar).`);
    }
  }

  // --- Decision -----------------------------------------------------------
  // Ordering matters: a deep drawdown outranks everything, because an asset
  // 40% off its high is not "bullish" no matter how good the last month was.
  let regime;
  const deepDrawdown = isFiniteNumber(drawdown) && drawdown <= t.bear;
  const inCorrection = isFiniteNumber(drawdown) && drawdown <= t.correction && drawdown > t.bear;
  const bigRunUp = isFiniteNumber(runUp) && runUp >= t.bull;
  const aboveLong = metrics.aboveLongMa === true;

  if (deepDrawdown) {
    // A big bounce that has not reclaimed the long-term average is a
    // recovery attempt, not a confirmed bull. This distinction is the whole
    // reason bear-market rallies trap people.
    regime = bigRunUp && aboveLong ? REGIMES.RECOVERY : REGIMES.BEAR;
  } else if (inCorrection) {
    regime = bigRunUp && aboveLong ? REGIMES.RECOVERY : REGIMES.CORRECTION;
  } else if (bigRunUp && aboveLong && bullVotes.length > bearVotes.length) {
    regime = REGIMES.BULL;
  } else if (aboveLong && bullVotes.length >= 3 && bearVotes.length === 0) {
    // Steady uptrend that never had a big enough drop to produce a 20% run-up
    // off a low. Still a bull by every other measure.
    regime = REGIMES.BULL;
  } else if (trendIsFlat || bullVotes.length === bearVotes.length) {
    regime = REGIMES.SIDEWAYS;
  } else if (bearVotes.length > bullVotes.length) {
    regime = aboveLong ? REGIMES.SIDEWAYS : REGIMES.CORRECTION;
  } else {
    regime = REGIMES.SIDEWAYS;
  }

  // Confidence = how much of the gathered evidence agrees with the verdict.
  // For the directional calls that is the share of votes pointing that way.
  // For sideways it is the inverse: a big margin either way is evidence
  // AGAINST calling it rangebound, so a balanced tally scores highest.
  const total = bullVotes.length + bearVotes.length;
  let confidence = 0;
  if (total > 0) {
    if (regime === REGIMES.BULL || regime === REGIMES.RECOVERY) {
      confidence = Math.round((bullVotes.length / total) * 100);
    } else if (regime === REGIMES.BEAR || regime === REGIMES.CORRECTION) {
      confidence = Math.round((bearVotes.length / total) * 100);
    } else {
      const margin = Math.abs(bullVotes.length - bearVotes.length);
      confidence = Math.round((1 - margin / total) * 100);
    }
  }

  return {
    regime,
    label: REGIME_LABELS[regime],
    description: REGIME_DESCRIPTIONS[regime],
    confidence,
    reasons,
    metrics: { ...metrics, bullVotes, bearVotes },
  };
}

/**
 * Summarise regimes across a whole watchlist — the "what is the market doing
 * overall" line at the top of the dashboard.
 */
export function summariseBreadth(assets) {
  const counts = { bull: 0, bear: 0, correction: 0, recovery: 0, sideways: 0, unknown: 0 };
  for (const a of assets) {
    const r = a?.analysis?.regime?.regime;
    if (r && counts[r] !== undefined) counts[r]++;
  }
  const known = assets.length - counts.unknown;
  let mood = 'Mixed';
  if (known > 0) {
    const bullish = counts.bull + counts.recovery;
    const bearish = counts.bear + counts.correction;
    if (bullish / known >= 0.6) mood = 'Risk-on';
    else if (bearish / known >= 0.6) mood = 'Risk-off';
    else if (counts.sideways / known >= 0.6) mood = 'Rangebound';
  }
  return { counts, mood, total: assets.length };
}
