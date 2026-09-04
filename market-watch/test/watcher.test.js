import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateConfig, inQuietHours, loadConfig, isAllowedWebhookUrl, ConfigError } from '../js/watcher/config.js';
import { webhookBody } from '../js/watcher/deliver.js';
import { loadState, saveState, applyState, captureState, appendLog } from '../js/watcher/store.js';

const validConfig = () => ({
  settings: { demoMode: true, refreshSeconds: 60 },
  watchlist: [{ symbol: 'btc', assetType: 'crypto' }],
  rules: [{ id: 'r1', symbol: 'btc', assetType: 'crypto', kind: 'price_above', params: { value: 1 } }],
});

/* ------------------------------------------------------------ config shape */

test('validateConfig fills in defaults and normalises symbols', () => {
  const cfg = validateConfig(validConfig());
  assert.equal(cfg.watchlist[0].symbol, 'BTC', 'symbols are upper-cased');
  assert.equal(cfg.rules[0].symbol, 'BTC');
  assert.equal(cfg.rules[0].enabled, true);
  assert.equal(cfg.rules[0].repeat, true);
  assert.equal(cfg.rules[0].cooldownMinutes, 60);
  assert.equal(cfg.watcher.desktopNotifications, true);
  assert.equal(cfg.watcher.stateFile, '.watcher-state.json');
});

test('validateConfig rejects an empty watchlist', () => {
  const cfg = validConfig();
  cfg.watchlist = [];
  assert.throws(() => validateConfig(cfg), ConfigError);
});

test('validateConfig rejects an empty rule set', () => {
  const cfg = validConfig();
  cfg.rules = [];
  assert.throws(() => validateConfig(cfg), /never alert|empty/);
});

test('validateConfig rejects a bad assetType', () => {
  const cfg = validConfig();
  cfg.watchlist[0].assetType = 'commodity';
  assert.throws(() => validateConfig(cfg), /assetType/);
});

test('validateConfig catches a rule pointing at an unwatched symbol', () => {
  // This is the silent-failure case: the watcher would run for weeks and
  // never fire, with nothing to indicate why.
  const cfg = validConfig();
  cfg.rules[0].symbol = 'DOGE';
  assert.throws(() => validateConfig(cfg), /never fire/);
});

test('validateConfig rejects a non-https webhook', () => {
  const cfg = validConfig();
  cfg.watcher = { webhooks: [{ url: 'http://insecure.example.com/hook' }] };
  assert.throws(() => validateConfig(cfg), /https/);
});

test('webhook URL policy: https anywhere, plain http only on loopback', () => {
  assert.equal(isAllowedWebhookUrl('https://discord.com/api/webhooks/x/y'), true);
  assert.equal(isAllowedWebhookUrl('https://hooks.slack.com/services/x'), true);
  assert.equal(isAllowedWebhookUrl('http://localhost:9911/relay'), true, 'a local relay is fine');
  assert.equal(isAllowedWebhookUrl('http://127.0.0.1:9911/relay'), true);
  assert.equal(isAllowedWebhookUrl('http://example.com/hook'), false, 'plaintext over the wire is not');
  assert.equal(isAllowedWebhookUrl('ftp://example.com/hook'), false);
  assert.equal(isAllowedWebhookUrl('not a url'), false);
  assert.equal(isAllowedWebhookUrl(''), false);
});

test('validateConfig defaults an unknown webhook format to json', () => {
  const cfg = validConfig();
  cfg.watcher = { webhooks: [{ url: 'https://example.com/hook', format: 'telepathy' }] };
  assert.equal(validateConfig(cfg).watcher.webhooks[0].format, 'json');
});

test('validateConfig rejects malformed quiet hours', () => {
  const cfg = validConfig();
  cfg.watcher = { quietHours: { start: '11pm', end: '7am' } };
  assert.throws(() => validateConfig(cfg), /HH:MM/);
});

test('refreshSeconds is floored so the watcher cannot hammer a free API', () => {
  const cfg = validConfig();
  cfg.settings.refreshSeconds = 1;
  assert.equal(validateConfig(cfg).settings.refreshSeconds, 30);
});

test('loadConfig gives an actionable message for a missing file', async () => {
  await assert.rejects(() => loadConfig('/nonexistent/nope.json'), /No config file at/);
});

test('loadConfig gives an actionable message for malformed JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mw-'));
  const p = join(dir, 'bad.json');
  await writeFile(p, '{ "watchlist": [ }');
  await assert.rejects(() => loadConfig(p), /not valid JSON/);
});

/* ------------------------------------------------------------- quiet hours */

test('quiet hours: a same-day window', () => {
  const q = { start: '09:00', end: '17:00' };
  assert.equal(inQuietHours(q, at(12, 0)), true);
  assert.equal(inQuietHours(q, at(8, 59)), false);
  assert.equal(inQuietHours(q, at(9, 0)), true, 'start is inclusive');
  assert.equal(inQuietHours(q, at(17, 0)), false, 'end is exclusive');
});

test('quiet hours: a window that wraps past midnight', () => {
  // The case that matters for a 24/7 crypto watcher, and the one a naive
  // start <= now <= end comparison gets wrong.
  const q = { start: '23:00', end: '07:00' };
  assert.equal(inQuietHours(q, at(23, 30)), true, 'before midnight');
  assert.equal(inQuietHours(q, at(3, 0)), true, 'after midnight');
  assert.equal(inQuietHours(q, at(6, 59)), true, 'just before the end');
  assert.equal(inQuietHours(q, at(7, 0)), false, 'end is exclusive');
  assert.equal(inQuietHours(q, at(12, 0)), false, 'the middle of the day is not quiet');
});

test('quiet hours: null or a zero-length window is never quiet', () => {
  assert.equal(inQuietHours(null, at(3, 0)), false);
  assert.equal(inQuietHours({ start: '09:00', end: '09:00' }, at(9, 0)), false);
});

function at(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/* -------------------------------------------------------- state round-trip */

test('rule state survives a save/load round trip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mw-'));
  const file = join(dir, 'state.json');
  const rules = [
    { id: 'a', wasMet: true, lastFiredAt: 1234, repeat: true, enabled: true },
    { id: 'b', wasMet: false, lastFiredAt: null, repeat: true, enabled: true },
  ];

  await saveState(file, captureState(rules, [{ symbol: 'BTC' }]));
  const loaded = await loadState(file);

  const fresh = [
    { id: 'a', wasMet: false, lastFiredAt: null, repeat: true, enabled: true },
    { id: 'b', wasMet: false, lastFiredAt: null, repeat: true, enabled: true },
  ];
  applyState(fresh, loaded);

  assert.equal(fresh[0].wasMet, true, 'an already-met rule stays met across a restart');
  assert.equal(fresh[0].lastFiredAt, 1234);
  assert.equal(fresh[1].wasMet, false);
  assert.equal(loaded.events.length, 1, 'the event feed is persisted too');
});

test('a one-shot rule that already fired stays disabled across a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mw-'));
  const file = join(dir, 'state.json');
  await saveState(file, captureState([{ id: 'once', wasMet: true, lastFiredAt: 99, repeat: false }]));

  const fresh = [{ id: 'once', wasMet: false, lastFiredAt: null, repeat: false, enabled: true }];
  applyState(fresh, await loadState(file));
  assert.equal(fresh[0].enabled, false);
});

test('a missing state file is not an error', async () => {
  const state = await loadState('/nonexistent/state.json');
  assert.deepEqual(state, { rules: {}, events: [] });
});

test('a corrupt state file degrades to fresh state instead of crashing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mw-'));
  const file = join(dir, 'state.json');
  await writeFile(file, 'not json at all');
  assert.deepEqual(await loadState(file), { rules: {}, events: [] });
});

test('appendLog writes one readable line per event', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mw-'));
  const file = join(dir, 'events.log');
  await appendLog(file, {
    firedAt: Date.UTC(2026, 0, 2, 3, 4, 5), severity: 'critical',
    symbol: 'BTC', message: 'fell below $90,000.00', note: 'stop loss',
  });
  await appendLog(file, {
    firedAt: Date.UTC(2026, 0, 2, 3, 5, 5), severity: 'info',
    symbol: 'ETH', message: 'RSI is 72.0', note: '',
  });
  const lines = (await readFile(file, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /2026-01-02T03:04:05\.000Z\s+\[CRITICAL\]\s+BTC\s+fell below \$90,000\.00\s+\(stop loss\)/);
  assert.match(lines[1], /\[INFO\]\s+ETH/);
  assert.ok(!lines[1].includes('()'), 'an empty note adds no empty parentheses');
});


/* ---------------------------------------------------------- webhook shapes */

const sampleEvent = {
  symbol: 'BTC', assetType: 'crypto', kind: 'price_above', severity: 'critical',
  message: 'BTC rose above $70,000.00 — now $71,204.10.', note: 'take profit',
  detail: { price: 71204.1, target: 70000 }, firedAt: Date.UTC(2026, 5, 1, 12, 0, 0),
};

test('discord payload uses the "content" field Discord requires', () => {
  const body = JSON.parse(webhookBody(sampleEvent, 'discord'));
  assert.ok(typeof body.content === 'string');
  assert.ok(body.content.includes('BTC'));
  assert.ok(body.content.includes('$70,000.00'));
  assert.ok(body.content.includes('take profit'));
});

test('slack payload uses the "text" field Slack requires', () => {
  const body = JSON.parse(webhookBody(sampleEvent, 'slack'));
  assert.ok(typeof body.text === 'string');
  assert.ok(body.text.includes('BTC'));
});

test('json payload carries structured fields and an ISO timestamp', () => {
  const body = JSON.parse(webhookBody(sampleEvent, 'json'));
  assert.equal(body.symbol, 'BTC');
  assert.equal(body.kind, 'price_above');
  assert.equal(body.severity, 'critical');
  assert.equal(body.detail.target, 70000);
  assert.equal(body.firedAt, '2026-06-01T12:00:00.000Z');
});

test('an unknown webhook format falls back to the structured payload', () => {
  assert.deepEqual(
    JSON.parse(webhookBody(sampleEvent, 'nonsense')),
    JSON.parse(webhookBody(sampleEvent, 'json')),
  );
});

test('an event with no note produces valid payloads in every format', () => {
  const bare = { ...sampleEvent, note: '' };
  for (const fmt of ['discord', 'slack', 'json']) {
    assert.doesNotThrow(() => JSON.parse(webhookBody(bare, fmt)), fmt);
  }
});
