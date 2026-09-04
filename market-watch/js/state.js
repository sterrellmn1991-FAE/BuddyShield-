/**
 * Application state and persistence.
 *
 * Everything lives in localStorage: watchlist, alert rules, settings and the
 * fired-alert log. No account, no server, no data leaving the browser except
 * the price requests themselves. API keys are stored locally too — which is
 * why the UI says plainly that this is browser-local storage, not a vault.
 */

import { makeId } from './util.js';

const STORAGE_KEY = 'market-watch:v1';

export const DEFAULT_SETTINGS = {
  demoMode: true,             // start in demo so the app works before setup
  refreshSeconds: 60,
  notificationsEnabled: false,
  speakAlerts: false,         // read alerts aloud via the Web Speech API
  soundEnabled: true,
  coinGeckoKey: '',
  alphaVantageKey: '',
  finnhubKey: '',
  theme: 'dark',
};

const DEFAULT_WATCHLIST = [
  { id: makeId('w'), symbol: 'BTC', assetType: 'crypto' },
  { id: makeId('w'), symbol: 'ETH', assetType: 'crypto' },
  { id: makeId('w'), symbol: 'SOL', assetType: 'crypto' },
  { id: makeId('w'), symbol: 'SPY', assetType: 'stock' },
  { id: makeId('w'), symbol: 'NVDA', assetType: 'stock' },
  { id: makeId('w'), symbol: 'TSLA', assetType: 'stock' },
];

/** In-memory state. `assets` and `errors` are runtime-only, never persisted. */
export const state = {
  settings: { ...DEFAULT_SETTINGS },
  watchlist: [...DEFAULT_WATCHLIST],
  rules: [],
  events: [],                 // fired alerts, newest first
  assets: new Map(),          // assetKey -> analysed asset
  errors: new Map(),          // assetKey -> error string
  selected: null,             // assetKey of the open detail panel
  lastRefresh: null,
  refreshing: false,
};

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.settings) state.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
    if (Array.isArray(saved.watchlist)) state.watchlist = saved.watchlist;
    if (Array.isArray(saved.rules)) state.rules = saved.rules;
    if (Array.isArray(saved.events)) state.events = saved.events.slice(0, 200);
  } catch (err) {
    // A corrupt or unreadable store must not brick the app; fall back to
    // defaults rather than leaving the user on a blank screen.
    console.warn('Could not restore saved state, starting fresh:', err);
  }
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: state.settings,
      watchlist: state.watchlist,
      rules: state.rules,
      events: state.events.slice(0, 200),
    }));
  } catch (err) {
    console.warn('Could not save state (storage may be full or blocked):', err);
  }
}

export function addToWatchlist(symbol, assetType) {
  const sym = String(symbol).trim().toUpperCase();
  if (!sym) throw new Error('Enter a symbol.');
  const exists = state.watchlist.some(
    (w) => w.symbol === sym && w.assetType === assetType,
  );
  if (exists) throw new Error(`${sym} is already on your watchlist.`);
  const item = { id: makeId('w'), symbol: sym, assetType };
  state.watchlist.push(item);
  save();
  return item;
}

export function removeFromWatchlist(id) {
  const item = state.watchlist.find((w) => w.id === id);
  state.watchlist = state.watchlist.filter((w) => w.id !== id);
  if (item) {
    // Rules pointing at a symbol nobody watches any more are dead weight.
    state.rules = state.rules.filter(
      (r) => !(r.symbol === item.symbol && r.assetType === item.assetType),
    );
    // Drop the cached analysis too, and close the detail panel if it was
    // showing this asset — otherwise the selection dangles at a stale key.
    const key = `${item.assetType}:${item.symbol.toUpperCase()}`;
    state.assets.delete(key);
    state.errors.delete(key);
    if (state.selected === key) state.selected = null;
  }
  save();
}

export function addRule(rule) {
  state.rules.push(rule);
  save();
  return rule;
}

export function removeRule(id) {
  state.rules = state.rules.filter((r) => r.id !== id);
  save();
}

export function toggleRule(id) {
  const rule = state.rules.find((r) => r.id === id);
  if (rule) {
    rule.enabled = !rule.enabled;
    // Re-arm on re-enable, so an already-true condition fires once more
    // rather than staying silent because it was true while switched off.
    if (rule.enabled) rule.wasMet = false;
    save();
  }
}

export function recordEvents(events) {
  if (!events.length) return;
  state.events = [...events, ...state.events].slice(0, 200);
  save();
}

export function clearEvents() {
  state.events = [];
  save();
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

export function resetAll() {
  state.settings = { ...DEFAULT_SETTINGS };
  state.watchlist = [...DEFAULT_WATCHLIST];
  state.rules = [];
  state.events = [];
  state.assets.clear();
  state.errors.clear();
  save();
}
