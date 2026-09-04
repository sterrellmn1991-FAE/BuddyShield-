#!/usr/bin/env node
/**
 * Optional local server for Market Watch.
 *
 * The app is a static site and runs fine from the filesystem — but stock data
 * is the exception. Yahoo Finance does not send CORS headers, so a browser
 * blocks the request even though the data is public. This server solves that
 * by fetching Yahoo server-side, where CORS does not apply, and serving the
 * result to the page from its own origin.
 *
 * Run it with `npm start`, then open http://localhost:8787.
 *
 * Zero dependencies — Node's own http module and global fetch (Node 18+).
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/** Only these hosts may be proxied. An open proxy is a liability, not a feature. */
const ALLOWED_UPSTREAM = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

/**
 * GET /api/stock/:symbol?range=2y&interval=1d
 * Proxies Yahoo's chart endpoint. Query parameters are whitelisted and
 * re-encoded rather than forwarded, so the client cannot steer the upstream
 * request anywhere it was not meant to go.
 */
async function handleStock(req, res, url) {
  const symbol = decodeURIComponent(url.pathname.replace('/api/stock/', '')).trim();

  // Ticker charset only. This is what stops a crafted "symbol" from becoming
  // a path segment or a second query string against the upstream host.
  if (!symbol || !/^[A-Za-z0-9.\-^=]{1,20}$/.test(symbol)) {
    return send(res, 400, JSON.stringify({ error: 'Invalid symbol.' }),
      { 'Content-Type': MIME['.json'] });
  }

  const range = /^(1mo|3mo|6mo|1y|2y|5y|10y|max)$/.test(url.searchParams.get('range') || '')
    ? url.searchParams.get('range') : '2y';
  const interval = /^(1d|1wk|1mo)$/.test(url.searchParams.get('interval') || '')
    ? url.searchParams.get('interval') : '1d';

  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set('range', range);
  upstream.searchParams.set('interval', interval);

  if (!ALLOWED_UPSTREAM.has(upstream.hostname)) {
    return send(res, 502, JSON.stringify({ error: 'Upstream host not allowed.' }),
      { 'Content-Type': MIME['.json'] });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const upstreamRes = await fetch(upstream, {
      signal: controller.signal,
      headers: {
        // Yahoo rejects requests with no User-Agent.
        'User-Agent': 'Mozilla/5.0 (compatible; MarketWatch/1.0)',
        Accept: 'application/json',
      },
    });
    clearTimeout(timeout);

    const text = await upstreamRes.text();
    return send(res, upstreamRes.ok ? 200 : upstreamRes.status, text, {
      'Content-Type': MIME['.json'],
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'Upstream timed out.' : err.message;
    return send(res, 504, JSON.stringify({ error: `Could not reach Yahoo: ${reason}` }),
      { 'Content-Type': MIME['.json'] });
  }
}

async function handleStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);

  // Resolve then verify containment: this is what makes "../../etc/passwd"
  // a 403 rather than a file read.
  const filePath = join(ROOT, normalize(rel));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  try {
    const data = await readFile(filePath);
    return send(res, 200, data, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
  } catch {
    return send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/stock/')) return await handleStock(req, res, url);
    return await handleStatic(req, res, url);
  } catch (err) {
    console.error(err);
    return send(res, 500, 'Internal error');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Market Watch running at http://localhost:${PORT}`);
  console.log('  Stock data is proxied through this server, so live stocks work without an API key.');
  console.log('  Press Ctrl+C to stop.\n');
});
