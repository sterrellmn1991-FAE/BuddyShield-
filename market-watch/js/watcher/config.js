/**
 * Watcher configuration: load, validate, and fill in defaults.
 *
 * The config file is deliberately the same shape the browser app exports, so
 * you can build a watchlist and a set of alerts in the UI, hit Export, and
 * hand the file straight to the watcher.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const DEFAULT_WATCHER = {
  desktopNotifications: true,
  speak: false,
  webhooks: [],              // [{ url, format: 'discord'|'slack'|'json' }]
  command: null,             // optional external command; receives JSON on stdin
  logFile: 'watcher-events.log',
  stateFile: '.watcher-state.json',
  /**
   * Suppress non-critical alerts during these hours (local time, 24h "HH:MM").
   * Critical alerts always get through. Set to null to disable.
   */
  quietHours: null,
};

const DEFAULT_SETTINGS = {
  demoMode: false,
  refreshSeconds: 300,
  coinGeckoKey: '',
  alphaVantageKey: '',
  finnhubKey: '',
};

class ConfigError extends Error {}

/**
 * Read and validate a config file.
 * Throws ConfigError with an actionable message rather than a stack trace,
 * because the person hitting this is editing JSON by hand.
 */
export async function loadConfig(path) {
  const full = resolve(path);
  let raw;
  try {
    raw = await readFile(full, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ConfigError(
        `No config file at ${full}.\n` +
        'Copy watcher.config.example.json to watcher.config.json and edit it, ' +
        'or export one from the web app (Settings → Export for watcher).',
      );
    }
    throw new ConfigError(`Could not read ${full}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${full} is not valid JSON: ${err.message}`);
  }

  return validateConfig(parsed, full);
}

/** Normalise and sanity-check a parsed config object. */
export function validateConfig(parsed, source = 'config') {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConfigError(`${source}: expected a JSON object at the top level.`);
  }

  const watchlist = Array.isArray(parsed.watchlist) ? parsed.watchlist : [];
  if (!watchlist.length) {
    throw new ConfigError(`${source}: "watchlist" is empty — there is nothing to watch.`);
  }
  for (const [i, item] of watchlist.entries()) {
    if (!item?.symbol) throw new ConfigError(`${source}: watchlist[${i}] has no "symbol".`);
    if (!['stock', 'crypto'].includes(item.assetType)) {
      throw new ConfigError(`${source}: watchlist[${i}] ("${item.symbol}") needs "assetType" of "stock" or "crypto".`);
    }
    item.symbol = String(item.symbol).toUpperCase();
  }

  const rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  if (!rules.length) {
    throw new ConfigError(`${source}: "rules" is empty — the watcher would poll forever and never alert.`);
  }
  for (const [i, rule] of rules.entries()) {
    if (!rule?.symbol) throw new ConfigError(`${source}: rules[${i}] has no "symbol".`);
    if (!rule?.kind) throw new ConfigError(`${source}: rules[${i}] has no "kind".`);
    rule.symbol = String(rule.symbol).toUpperCase();
    rule.assetType = rule.assetType || 'crypto';
    rule.enabled = rule.enabled !== false;
    rule.params = rule.params || {};
    rule.id = rule.id || `rule_${i}`;
    if (rule.repeat === undefined) rule.repeat = true;
    if (rule.cooldownMinutes === undefined) rule.cooldownMinutes = 60;
    // wasMet/lastFiredAt are runtime state; the store overlays saved values.
    rule.wasMet = false;
    rule.lastFiredAt = rule.lastFiredAt ?? null;
  }

  // A rule pointing at a symbol nobody watches will never fire. Say so now,
  // at startup, rather than letting it sit silent for a week.
  const watched = new Set(watchlist.map((w) => `${w.assetType}:${w.symbol}`));
  const orphans = rules
    .filter((r) => !watched.has(`${r.assetType}:${r.symbol}`))
    .map((r) => `${r.symbol} (${r.assetType})`);
  if (orphans.length) {
    throw new ConfigError(
      `${source}: these rules reference symbols that are not on the watchlist, ` +
      `so they can never fire: ${[...new Set(orphans)].join(', ')}.`,
    );
  }

  const watcher = { ...DEFAULT_WATCHER, ...(parsed.watcher || {}) };
  if (watcher.quietHours) {
    const { start, end } = watcher.quietHours;
    if (!isHHMM(start) || !isHHMM(end)) {
      throw new ConfigError(`${source}: watcher.quietHours needs "start" and "end" as "HH:MM" (24-hour).`);
    }
  }
  for (const [i, hook] of (watcher.webhooks || []).entries()) {
    if (!hook?.url || !isAllowedWebhookUrl(hook.url)) {
      throw new ConfigError(
        `${source}: watcher.webhooks[${i}] needs an https:// "url" ` +
        '(plain http is permitted only for localhost, for a local relay).',
      );
    }
    hook.format = ['discord', 'slack', 'json'].includes(hook.format) ? hook.format : 'json';
  }

  const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
  settings.refreshSeconds = Math.max(30, Number(settings.refreshSeconds) || 300);

  return { settings, watchlist, rules, watcher };
}

/**
 * Webhooks must be https, because the payload names what you hold and what
 * it is doing. The one exception is a loopback address: a local relay to
 * something on your own machine cannot be intercepted on the wire.
 */
export function isAllowedWebhookUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
}

function isHHMM(v) {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/**
 * Is `date` inside the quiet window? Handles windows that wrap midnight,
 * which is the common case (e.g. 23:00 → 07:00).
 */
export function inQuietHours(quietHours, date = new Date()) {
  if (!quietHours) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  const toMins = (s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const start = toMins(quietHours.start);
  const end = toMins(quietHours.end);
  if (start === end) return false;
  return start < end
    ? mins >= start && mins < end          // same-day window
    : mins >= start || mins < end;         // wraps past midnight
}

export { ConfigError };
