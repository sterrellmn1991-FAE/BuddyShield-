/**
 * Application controller: bootstrap, polling loop, event wiring.
 */

import { state, load, save, addToWatchlist, removeFromWatchlist,
  addRule, removeRule, toggleRule, recordEvents, clearEvents,
  updateSettings, resetAll } from './state.js';
import { fetchAsset } from './providers/index.js';
import { analyseSeries } from './analysis/signals.js';
import { createRule, evaluateAll, assetKey } from './alerts/rules.js';
import { deliver, toast, requestPermission, notificationState, speechSupported, speak } from './alerts/notify.js';
import * as render from './ui/render.js';
import { escapeHtml } from './util.js';

const $ = (sel) => document.querySelector(sel);
let pollTimer = null;
let inFlight = null;            // AbortController for the current refresh

/* ------------------------------------------------------------------ render */

function paint() {
  $('#breadth').innerHTML = render.renderBreadth();
  $('#watchlist').innerHTML = render.renderWatchlist();
  $('#detail').innerHTML = render.renderDetail();
  $('#rules-list').innerHTML = render.renderRules();
  $('#events').innerHTML = render.renderEvents();
  $('#rule-symbol').innerHTML = render.watchOptions();
}

/* ------------------------------------------------------------- data refresh */

async function refresh({ silent = false } = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  if (!silent) paint();

  inFlight?.abort();
  inFlight = new AbortController();

  for (const item of state.watchlist) {
    const key = assetKey(item.assetType, item.symbol);
    try {
      const raw = await fetchAsset(item, state.settings, inFlight.signal);
      const analysis = analyseSeries(raw.series, item.assetType);

      // Carry the previous regime forward so regime-change rules have
      // something to compare against on the very next evaluation.
      const previous = state.assets.get(key);
      state.assets.set(key, {
        ...raw,
        analysis,
        previousRegime: previous?.analysis?.regime?.regime ?? null,
      });
      state.errors.delete(key);
    } catch (err) {
      if (err?.name === 'AbortError') { state.refreshing = false; return; }
      state.errors.set(key, err.message);
      state.assets.delete(key);
    }
    // Public APIs tolerate steady polling far better than parallel bursts.
    if (!state.settings.demoMode) await new Promise((r) => setTimeout(r, 250));
  }

  state.lastRefresh = Date.now();
  state.refreshing = false;

  // On a cold start, open the first asset so the panel that explains the
  // regime call is showing something rather than an empty band.
  if (!state.selected && state.assets.size) {
    state.selected = state.assets.keys().next().value;
  }

  const fired = evaluateAll(state.rules, state.assets, Date.now());
  if (fired.length) {
    recordEvents(fired);
    for (const event of fired) deliver(event, state.settings);
  }
  save();
  paint();
}

function restartPolling() {
  if (pollTimer) clearInterval(pollTimer);
  const seconds = Math.max(15, Number(state.settings.refreshSeconds) || 60);
  pollTimer = setInterval(() => refresh({ silent: true }), seconds * 1000);
}

/* ------------------------------------------------------------ event wiring */

function wire() {
  // --- add to watchlist
  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      addToWatchlist(form.get('symbol'), form.get('assetType'));
      e.target.reset();
      paint();
      refresh({ silent: true });
    } catch (err) {
      toast(err.message, 'warning');
    }
  });

  // --- watchlist clicks (delegated, so re-rendering never orphans handlers)
  $('#watchlist').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-action="remove-watch"]');
    if (removeBtn) {
      e.stopPropagation();
      removeFromWatchlist(removeBtn.dataset.id);
      paint();
      return;
    }
    const card = e.target.closest('[data-action="select"]');
    if (card) {
      state.selected = state.selected === card.dataset.key ? null : card.dataset.key;
      paint();
    }
  });

  // Keyboard parity: cards are focusable, so they must activate on Enter/Space.
  $('#watchlist').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-action="select"]');
    if (!card) return;
    e.preventDefault();
    state.selected = state.selected === card.dataset.key ? null : card.dataset.key;
    paint();
  });

  // --- rule form: swap inputs when the alert type changes
  const kindSelect = $('#rule-kind');
  kindSelect.innerHTML = render.ruleKindOptions();
  const syncParams = () => { $('#rule-params').innerHTML = render.renderRuleParams(kindSelect.value); };
  kindSelect.addEventListener('change', syncParams);
  syncParams();

  $('#rule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const target = String(form.get('symbol') || '');
    if (!target) return toast('Add a symbol to your watchlist first.', 'warning');

    const [assetType, symbol] = target.split(':');
    const params = {};
    for (const [k, v] of form.entries()) {
      if (['symbol', 'kind', 'cooldown', 'repeat', 'note'].includes(k)) continue;
      params[k] = Number.isNaN(Number(v)) || v === '' ? v : Number(v);
    }

    addRule(createRule({
      symbol, assetType,
      kind: form.get('kind'),
      params,
      cooldownMinutes: Number(form.get('cooldown')) || 0,
      repeat: form.get('repeat') === 'on',
      note: String(form.get('note') || '').slice(0, 140),
    }));
    e.target.reset();
    syncParams();
    paint();
    toast('Alert created.', 'info', 3500);
  });

  // --- rules list
  $('#rules-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-action="remove-rule"]');
    if (del) { removeRule(del.dataset.id); paint(); }
  });
  $('#rules-list').addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-action="toggle-rule"]');
    if (toggle) { toggleRule(toggle.dataset.id); paint(); }
  });

  $('#clear-events').addEventListener('click', () => { clearEvents(); paint(); });
  $('#refresh-now').addEventListener('click', () => refresh());

  // --- settings
  $('#settings-form').addEventListener('change', async (e) => {
    const el = e.target;
    const patch = {};

    if (el.name === 'notificationsEnabled' && el.checked) {
      const perm = await requestPermission();
      if (perm !== 'granted') {
        el.checked = false;
        toast(perm === 'unsupported'
          ? 'This browser does not support desktop notifications. On-screen alerts still work.'
          : 'Desktop notifications are blocked. Allow them in your browser settings to switch this on.', 'warning');
        return;
      }
    }

    if (el.name === 'speakAlerts' && el.checked && !speechSupported()) {
      el.checked = false;
      toast('This browser has no speech synthesis available.', 'warning');
      return;
    }

    patch[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    updateSettings(patch);

    if (el.name === 'refreshSeconds') restartPolling();
    if (el.name === 'demoMode') {
      state.assets.clear();
      state.errors.clear();
      refresh();
    }
    if (el.name === 'speakAlerts' && el.checked) speak('Spoken alerts are on.');
    paint();
  });

  $('#test-alert').addEventListener('click', () => {
    deliver({
      id: 'test', ruleId: 'test', symbol: 'TEST', severity: 'warning', note: '',
      message: 'This is a test alert. If you can see, hear, or were notified by this, that channel is working.',
      firedAt: Date.now(),
    }, state.settings);
  });

  $('#reset-all').addEventListener('click', () => {
    if (!confirm('Reset the watchlist, alerts and settings back to defaults? This cannot be undone.')) return;
    resetAll();
    hydrateSettings();
    paint();
    refresh();
  });

  // Pause polling in a hidden tab; catch up immediately on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    } else {
      restartPolling();
      refresh({ silent: true });
    }
  });
}

/** Push saved settings into the form controls on load. */
function hydrateSettings() {
  const form = $('#settings-form');
  for (const [key, value] of Object.entries(state.settings)) {
    const el = form.elements[key];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  const note = $('#notif-state');
  const perm = notificationState();
  note.textContent = perm === 'granted' ? 'Desktop notifications are allowed.'
    : perm === 'denied' ? 'Desktop notifications are blocked in your browser settings.'
      : perm === 'unsupported' ? 'This browser does not support desktop notifications.'
        : 'Permission will be requested when you switch this on.';
  if (!speechSupported()) {
    const speakEl = form.elements.speakAlerts;
    if (speakEl) { speakEl.disabled = true; speakEl.checked = false; }
  }
}

/* ---------------------------------------------------------------- bootstrap */

function boot() {
  load();
  wire();
  hydrateSettings();
  paint();
  refresh();
  restartPolling();

  // Keep relative timestamps ("3m ago") honest without a full refetch.
  setInterval(() => {
    if (!state.refreshing) $('#breadth').innerHTML = render.renderBreadth();
  }, 30_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Surface unexpected failures instead of leaving a silently dead page.
window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  toast(`Something went wrong: ${escapeHtml(e.message)}`, 'critical');
});
