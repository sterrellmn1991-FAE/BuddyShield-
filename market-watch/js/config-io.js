/**
 * Config interchange between the browser app and the background watcher.
 *
 * The watcher reads exactly this shape, so a watchlist and set of alerts built
 * in the UI can be handed straight to a process that keeps running after the
 * tab is closed. Keys are deliberately excluded from the export — see below.
 */

import { DEFAULT_SETTINGS } from './state.js';

/**
 * Build a watcher config from live app state.
 *
 * API keys are NOT exported. An exported file is the kind of thing that ends
 * up in a chat message or a git repo, and a key that leaks that way is worse
 * than the two minutes it takes to paste it into the config by hand.
 */
export function buildWatcherConfig(state) {
  return {
    _comment: 'Exported from the Market Watch web app. Run with: npm run watch',
    _note: 'API keys are not exported. Add them under "settings" if you need live stock data.',

    settings: {
      // Live data is the point of a background watcher, so demo mode is off
      // in the export regardless of how the browser app is currently set.
      demoMode: false,
      // Poll more gently than the UI: this runs unattended for days.
      refreshSeconds: Math.max(300, Number(state.settings.refreshSeconds) || 300),
      coinGeckoKey: '',
      alphaVantageKey: '',
      finnhubKey: '',
    },

    watchlist: state.watchlist.map(({ symbol, assetType }) => ({ symbol, assetType })),

    rules: state.rules.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      assetType: r.assetType,
      kind: r.kind,
      params: r.params,
      enabled: r.enabled,
      repeat: r.repeat,
      cooldownMinutes: r.cooldownMinutes,
      note: r.note || '',
    })),

    watcher: {
      desktopNotifications: true,
      speak: Boolean(state.settings.speakAlerts),
      webhooks: [],
      command: null,
      logFile: 'watcher-events.log',
      stateFile: '.watcher-state.json',
      quietHours: null,
    },
  };
}

/**
 * Apply an imported config file to app state. Validates enough to refuse
 * obvious rubbish, and never imports keys or watcher-only fields.
 *
 * @returns {{watchlist:number, rules:number}} counts, for the confirmation
 */
export function applyImportedConfig(state, parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('not a JSON object');

  const watchlist = Array.isArray(parsed.watchlist) ? parsed.watchlist : null;
  if (!watchlist) throw new Error('no "watchlist" array');

  const clean = [];
  for (const item of watchlist) {
    if (!item?.symbol || !['stock', 'crypto'].includes(item.assetType)) continue;
    clean.push({
      id: `w_${clean.length}_${Date.now().toString(36)}`,
      symbol: String(item.symbol).toUpperCase().slice(0, 12),
      assetType: item.assetType,
    });
  }
  if (!clean.length) throw new Error('the watchlist has no usable entries');

  const rules = [];
  for (const r of Array.isArray(parsed.rules) ? parsed.rules : []) {
    if (!r?.symbol || !r?.kind) continue;
    rules.push({
      id: r.id || `rule_${rules.length}_${Date.now().toString(36)}`,
      symbol: String(r.symbol).toUpperCase(),
      assetType: r.assetType === 'stock' ? 'stock' : 'crypto',
      kind: r.kind,
      params: r.params && typeof r.params === 'object' ? r.params : {},
      enabled: r.enabled !== false,
      repeat: r.repeat !== false,
      cooldownMinutes: Number(r.cooldownMinutes) || 0,
      note: String(r.note || '').slice(0, 140),
      // Fired history belongs to whichever process produced it; a fresh
      // import starts un-armed so nothing back-fires on the first poll.
      wasMet: false,
      lastFiredAt: null,
      createdAt: Date.now(),
    });
  }

  state.watchlist = clean;
  state.rules = rules;
  if (parsed.settings && typeof parsed.settings === 'object') {
    // Only the harmless display settings come across; never keys.
    state.settings = {
      ...state.settings,
      refreshSeconds: Number(parsed.settings.refreshSeconds) || DEFAULT_SETTINGS.refreshSeconds,
    };
  }
  state.selected = null;

  return { watchlist: clean.length, rules: rules.length };
}
