/**
 * Crypto prices via CoinGecko's public API.
 *
 * CoinGecko sends permissive CORS headers, so this works straight from the
 * browser with no key and no proxy. A free "demo" key can be supplied to
 * raise the rate limit, but is not required.
 */

const BASE = 'https://api.coingecko.com/api/v3';

/**
 * CoinGecko is keyed by internal ids ("bitcoin"), not tickers ("BTC").
 * These cover the common cases; anything else is resolved via /search.
 */
const SYMBOL_TO_ID = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin',
  ADA: 'cardano', AVAX: 'avalanche-2', DOT: 'polkadot', MATIC: 'matic-network',
  LINK: 'chainlink', LTC: 'litecoin', BCH: 'bitcoin-cash', TRX: 'tron',
  SHIB: 'shiba-inu', UNI: 'uniswap', ATOM: 'cosmos', XLM: 'stellar',
  NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', SUI: 'sui',
  PEPE: 'pepe', TON: 'the-open-network', ICP: 'internet-computer', FIL: 'filecoin',
};

const idCache = new Map();

function headers(apiKey) {
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
}

async function getJson(url, apiKey, signal) {
  const res = await fetch(url, { headers: headers(apiKey), signal });
  if (res.status === 429) {
    throw new Error('CoinGecko rate limit reached. Wait a minute, lengthen the refresh interval, or add a free CoinGecko demo key in Settings.');
  }
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  return res.json();
}

/** Resolve a ticker to a CoinGecko id, falling back to their search endpoint. */
export async function resolveId(symbol, apiKey, signal) {
  const key = String(symbol).toUpperCase();
  if (SYMBOL_TO_ID[key]) return SYMBOL_TO_ID[key];
  if (idCache.has(key)) return idCache.get(key);

  const data = await getJson(`${BASE}/search?query=${encodeURIComponent(key)}`, apiKey, signal);
  const match = (data.coins || []).find((c) => c.symbol?.toUpperCase() === key) || (data.coins || [])[0];
  if (!match) throw new Error(`No CoinGecko listing found for "${symbol}".`);
  idCache.set(key, match.id);
  return match.id;
}

/**
 * Fetch daily history plus current price for one coin.
 * `days` of 365 gives the regime classifier a full year to work with.
 */
export async function fetchCrypto(symbol, { apiKey, days = 365, signal } = {}) {
  const id = await resolveId(symbol, apiKey, signal);

  const chart = await getJson(
    `${BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`,
    apiKey, signal,
  );

  const points = chart.prices || [];
  if (!points.length) throw new Error(`CoinGecko returned no price history for "${symbol}".`);

  const timestamps = points.map((p) => p[0]);
  const closes = points.map((p) => p[1]);

  return {
    symbol: String(symbol).toUpperCase(),
    displaySymbol: String(symbol).toUpperCase(),
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    assetType: 'crypto',
    currency: 'USD',
    // market_chart gives closes only; analyseSeries synthesises H/L from them,
    // which makes ATR slightly conservative but keeps volatility analysis alive.
    series: { closes, highs: closes, lows: closes, timestamps },
    source: 'coingecko',
    fetchedAt: Date.now(),
  };
}
