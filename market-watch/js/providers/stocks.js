/**
 * Stock prices.
 *
 * Stocks are harder than crypto for a browser-only app: the good free source
 * (Yahoo) does not reliably send CORS headers, so a page served from
 * file:// or a random origin may be blocked by the browser even though the
 * data is public. We therefore try several routes, best first, and tell the
 * user exactly what to do if all of them fail.
 *
 *   1. Local proxy  — if the page is served by the bundled server.js, it
 *                     exposes /api/stock/* which fetches Yahoo server-side.
 *                     Best free experience: full history, no key, no limits.
 *   2. Alpha Vantage — CORS-friendly and gives full daily history with a
 *                     free key (rate limited, but generous enough here).
 *   3. Finnhub      — CORS-friendly; real-time quote. Daily candles are a
 *                     paid feature on newer free plans, so history may be
 *                     unavailable and we degrade to quote-only.
 *   4. Yahoo direct — works in some contexts; tried last, failure is expected.
 */

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const ALPHA = 'https://www.alphavantage.co/query';
const FINNHUB = 'https://finnhub.io/api/v1';

/** True when the page is served by our own server, which carries the proxy. */
export function hasLocalProxy() {
  return typeof location !== 'undefined'
    && (location.protocol === 'http:' || location.protocol === 'https:')
    && !!location.host;
}

function shape(symbol, name, series, source) {
  return {
    symbol: String(symbol).toUpperCase(),
    displaySymbol: String(symbol).toUpperCase(),
    name: name || String(symbol).toUpperCase(),
    assetType: 'stock',
    currency: 'USD',
    series,
    source,
    fetchedAt: Date.now(),
  };
}

function parseYahooChart(json, symbol) {
  const result = json?.chart?.result?.[0];
  if (!result) {
    const msg = json?.chart?.error?.description || 'no data returned';
    throw new Error(`Yahoo: ${msg}`);
  }
  const quote = result.indicators?.quote?.[0] || {};
  const ts = result.timestamp || [];
  const closes = [];
  const highs = [];
  const lows = [];
  const timestamps = [];
  for (let i = 0; i < ts.length; i++) {
    const c = quote.close?.[i];
    if (c === null || c === undefined || !Number.isFinite(c)) continue;  // holidays / halts
    closes.push(c);
    highs.push(Number.isFinite(quote.high?.[i]) ? quote.high[i] : c);
    lows.push(Number.isFinite(quote.low?.[i]) ? quote.low[i] : c);
    timestamps.push(ts[i] * 1000);
  }
  if (!closes.length) throw new Error(`Yahoo returned no usable closes for "${symbol}".`);
  const name = result.meta?.longName || result.meta?.shortName || symbol;
  return { series: { closes, highs, lows, timestamps }, name };
}

async function viaProxy(symbol, signal) {
  const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}?range=2y&interval=1d`, { signal });
  if (!res.ok) throw new Error(`Local proxy responded ${res.status}`);
  const { series, name } = parseYahooChart(await res.json(), symbol);
  return shape(symbol, name, series, 'yahoo (local proxy)');
}

async function viaYahooDirect(symbol, signal) {
  const res = await fetch(`${YAHOO}/${encodeURIComponent(symbol)}?range=2y&interval=1d`, { signal });
  if (!res.ok) throw new Error(`Yahoo responded ${res.status}`);
  const { series, name } = parseYahooChart(await res.json(), symbol);
  return shape(symbol, name, series, 'yahoo');
}

async function viaAlphaVantage(symbol, apiKey, signal) {
  const url = `${ALPHA}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Alpha Vantage responded ${res.status}`);
  const json = await res.json();

  // Alpha Vantage signals problems with a 200 and a prose field.
  if (json.Note) throw new Error('Alpha Vantage rate limit reached (free keys allow a small number of calls per day).');
  if (json.Information) throw new Error(`Alpha Vantage: ${json.Information}`);
  if (json['Error Message']) throw new Error(`Alpha Vantage: unknown symbol "${symbol}".`);

  const table = json['Time Series (Daily)'];
  if (!table) throw new Error('Alpha Vantage returned no time series.');

  const dates = Object.keys(table).sort();          // oldest first
  const closes = [];
  const highs = [];
  const lows = [];
  const timestamps = [];
  for (const d of dates) {
    const row = table[d];
    const c = parseFloat(row['4. close']);
    if (!Number.isFinite(c)) continue;
    closes.push(c);
    highs.push(parseFloat(row['2. high']) || c);
    lows.push(parseFloat(row['3. low']) || c);
    timestamps.push(new Date(`${d}T00:00:00Z`).getTime());
  }
  if (!closes.length) throw new Error('Alpha Vantage returned no usable closes.');
  // Two years is plenty for a 200-day average; trimming keeps charts quick.
  const keep = 520;
  return shape(symbol, symbol, {
    closes: closes.slice(-keep),
    highs: highs.slice(-keep),
    lows: lows.slice(-keep),
    timestamps: timestamps.slice(-keep),
  }, 'alphavantage');
}

async function viaFinnhub(symbol, apiKey, signal) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 730;
  const candleUrl = `${FINNHUB}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
  const res = await fetch(candleUrl, { signal });

  if (res.ok) {
    const json = await res.json();
    if (json.s === 'ok' && Array.isArray(json.c) && json.c.length) {
      return shape(symbol, symbol, {
        closes: json.c,
        highs: json.h || json.c,
        lows: json.l || json.c,
        timestamps: (json.t || []).map((t) => t * 1000),
      }, 'finnhub');
    }
  }

  // Candles are premium on newer free plans (403). Fall back to a live quote
  // so the price and price alerts still work, with no trend analysis.
  const qres = await fetch(`${FINNHUB}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`, { signal });
  if (!qres.ok) throw new Error(`Finnhub responded ${qres.status}`);
  const q = await qres.json();
  if (!Number.isFinite(q.c) || q.c === 0) throw new Error(`Finnhub has no quote for "${symbol}".`);
  return {
    ...shape(symbol, symbol, {
      closes: [q.pc, q.c].filter(Number.isFinite),
      highs: [q.h ?? q.c, q.h ?? q.c],
      lows: [q.l ?? q.c, q.l ?? q.c],
      timestamps: [Date.now() - 86_400_000, Date.now()],
    }, 'finnhub (quote only)'),
    limited: 'Finnhub free plans no longer include daily candles, so only the live price is available — trend and momentum analysis need history. Run the bundled server (npm start) or add an Alpha Vantage key for full analysis.',
  };
}

/**
 * Try every available route in order and return the first success.
 * If they all fail, throw an error that names each attempt, because a
 * generic "fetch failed" here is genuinely unhelpful.
 */
export async function fetchStock(symbol, { alphaVantageKey, finnhubKey, signal } = {}) {
  const attempts = [];
  const routes = [];

  if (hasLocalProxy()) routes.push(['local proxy', () => viaProxy(symbol, signal)]);
  if (alphaVantageKey) routes.push(['Alpha Vantage', () => viaAlphaVantage(symbol, alphaVantageKey, signal)]);
  if (finnhubKey) routes.push(['Finnhub', () => viaFinnhub(symbol, finnhubKey, signal)]);
  routes.push(['Yahoo direct', () => viaYahooDirect(symbol, signal)]);

  for (const [label, run] of routes) {
    try {
      return await run();
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      attempts.push(`${label}: ${err.message}`);
    }
  }

  throw new Error(
    `Could not load "${symbol}" from any stock source.\n` +
    attempts.map((a) => `  • ${a}`).join('\n') +
    '\n\nStock data from a browser is blocked by CORS on most public endpoints. ' +
    'Fixes, easiest first: run the bundled server with "npm start" and open the ' +
    'page from it, add a free Alpha Vantage key in Settings, or switch on Demo mode.',
  );
}
