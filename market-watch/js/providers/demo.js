/**
 * Deterministic synthetic market data.
 *
 * This exists for three reasons, in order of importance:
 *   1. The app is fully usable and demonstrable with no network and no keys.
 *   2. The analysis pipeline can be tested end to end without a live market.
 *   3. Rate limits and API outages stop being a hard failure.
 *
 * Series are generated from a seed derived from the symbol, so "BTC" always
 * produces the same chart. It is a geometric random walk with a drift regime
 * baked in, which means the regime classifier has something real to find.
 */

import { seededRandom, hashString } from '../util.js';

const DEMO_PROFILES = {
  // symbol: [name, startPrice, annualDriftPct, annualVolPct, regimeShape]
  BTC:   ['Bitcoin',      42000, 60, 42, 'bull'],
  ETH:   ['Ethereum',      2300, 40, 45, 'bull'],
  SOL:   ['Solana',         110, 30, 60, 'volatile'],
  DOGE:  ['Dogecoin',      0.14,  2, 55, 'sideways'],
  XRP:   ['XRP',           0.52,  5, 45, 'sideways'],
  AAPL:  ['Apple Inc.',     190, 22, 22, 'bull'],
  MSFT:  ['Microsoft',      410, 26, 20, 'bull'],
  NVDA:  ['NVIDIA',         120, 55, 38, 'volatile'],
  TSLA:  ['Tesla',          240, -30, 40, 'bear'],
  SPY:   ['S&P 500 ETF',    520, 14, 13, 'bull'],
  QQQ:   ['Nasdaq 100 ETF', 450, 18, 17, 'bull'],
  GME:   ['GameStop',        22, -45, 50, 'bear'],
};

const TRADING_DAYS = 400;

/**
 * Build a full OHLC series for a symbol.
 * @returns {{closes:number[],highs:number[],lows:number[],timestamps:number[]}}
 */
export function generateSeries(symbol, bars = TRADING_DAYS) {
  const key = String(symbol).toUpperCase();
  const profile = DEMO_PROFILES[key] || ['Demo Asset', 100, 10, 40, 'sideways'];
  const [, start, driftPct, volPct, shape] = profile;

  const rand = seededRandom(hashString(key));
  const dailyDrift = driftPct / 100 / 252;
  const dailyVol = volPct / 100 / Math.sqrt(252);

  const closes = [];
  const highs = [];
  const lows = [];
  const timestamps = [];
  const dayMs = 86_400_000;
  const now = Date.now();

  let price = start;
  for (let i = 0; i < bars; i++) {
    const progress = i / bars;
    // Shape the drift across the window so each profile actually exhibits the
    // regime it claims, instead of being an undifferentiated random walk.
    let drift = dailyDrift;
    if (shape === 'bull') drift = dailyDrift * (0.4 + progress * 1.6);
    else if (shape === 'bear') drift = dailyDrift * (0.4 + progress * 1.6);
    else if (shape === 'volatile') drift = dailyDrift * Math.sin(progress * Math.PI * 1.5);
    else drift = dailyDrift * 0.15;

    // Box-Muller for a normal shock from two uniforms.
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const shock = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const volNow = shape === 'volatile' ? dailyVol * (1 + 0.4 * Math.abs(Math.sin(progress * 8))) : dailyVol;

    price = price * Math.exp(drift - 0.5 * volNow ** 2 + volNow * shock);
    price = Math.max(price, start * 0.02);

    const range = price * volNow * (0.6 + rand() * 0.9);
    closes.push(price);
    highs.push(price + range * rand());
    lows.push(Math.max(price - range * rand(), price * 0.5));
    timestamps.push(now - (bars - 1 - i) * dayMs);
  }

  return { closes, highs, lows, timestamps };
}

export function demoName(symbol) {
  const p = DEMO_PROFILES[String(symbol).toUpperCase()];
  return p ? p[0] : String(symbol).toUpperCase();
}

export function demoSymbols(assetType) {
  const crypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP'];
  return assetType === 'crypto' ? crypto : Object.keys(DEMO_PROFILES).filter((s) => !crypto.includes(s));
}

/** Provider-shaped fetch so demo mode is a drop-in for the live providers. */
export async function fetchDemo(symbol, assetType) {
  const series = generateSeries(symbol);
  return {
    symbol: String(symbol).toUpperCase(),
    displaySymbol: String(symbol).toUpperCase(),
    name: demoName(symbol),
    assetType,
    currency: 'USD',
    series,
    source: 'demo',
    fetchedAt: Date.now(),
  };
}
