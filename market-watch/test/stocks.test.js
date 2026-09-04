import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The stock provider decides at runtime whether the page is served by the
 * bundled proxy. On a static host (GitHub Pages) it is not, and the /api/stock
 * path 404s — so the provider must notice once and stop asking, rather than
 * burning a doomed request per symbol on every poll forever.
 *
 * Each test re-imports the module with a cache-busting query so the
 * module-level latch starts fresh.
 */
async function freshModule() {
  return import(`../js/providers/stocks.js?t=${Math.random()}`);
}

function stubBrowser({ proxyStatus = 404 } = {}) {
  const calls = { proxy: 0, other: 0 };
  globalThis.location = { protocol: 'https:', host: 'example.github.io' };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/stock/')) {
      calls.proxy++;
      return { ok: proxyStatus === 200, status: proxyStatus, json: async () => ({}) };
    }
    calls.other++;
    throw new Error('blocked by CORS');
  };
  return calls;
}

test('a 404 from the proxy path latches it off for the session', async () => {
  const calls = stubBrowser({ proxyStatus: 404 });
  const { fetchStock, hasLocalProxy } = await freshModule();

  assert.equal(hasLocalProxy(), true, 'an http(s) origin looks proxy-capable up front');

  for (const sym of ['SPY', 'NVDA', 'TSLA']) {
    await assert.rejects(() => fetchStock(sym, {}));
  }

  assert.equal(calls.proxy, 1, 'the proxy is tried once, then never again');
  assert.equal(hasLocalProxy(), false);
});

test('a transient proxy error does NOT latch it off', async () => {
  // A 500 or a timeout might be a restarting server; only a 404 proves the
  // endpoint does not exist on this host.
  const calls = stubBrowser({ proxyStatus: 503 });
  const { fetchStock, hasLocalProxy } = await freshModule();

  for (const sym of ['SPY', 'NVDA']) {
    await assert.rejects(() => fetchStock(sym, {}));
  }

  assert.equal(calls.proxy, 2, 'a transient failure is retried on the next symbol');
  assert.equal(hasLocalProxy(), true);
});

test('resetProxyDetection re-arms the probe', async () => {
  stubBrowser({ proxyStatus: 404 });
  const { fetchStock, hasLocalProxy, resetProxyDetection } = await freshModule();
  await assert.rejects(() => fetchStock('SPY', {}));
  assert.equal(hasLocalProxy(), false);
  resetProxyDetection();
  assert.equal(hasLocalProxy(), true);
});

test('with no proxy and no keys, the failure names every route it tried', async () => {
  stubBrowser({ proxyStatus: 404 });
  const { fetchStock } = await freshModule();
  await assert.rejects(() => fetchStock('SPY', {}), (err) => {
    assert.match(err.message, /Could not load "SPY"/);
    assert.match(err.message, /Demo mode/, 'offers a fix that works right now');
    assert.match(err.message, /Alpha Vantage/, 'offers the fix for live stocks here');
    assert.match(err.message, /crypto works everywhere|Live crypto/i, 'says what still works');
    return true;
  });
});

test('outside a browser there is no proxy to try', async () => {
  delete globalThis.location;
  const { hasLocalProxy } = await freshModule();
  assert.equal(hasLocalProxy(), false, 'the Node watcher must not attempt a relative URL');
});
