/**
 * Durable watcher state.
 *
 * Edge triggering only works if the watcher remembers what was already true
 * when it last looked. Without this, restarting the process would re-fire
 * every alert whose condition currently holds — which is exactly the flood
 * the edge trigger exists to prevent.
 *
 * State is written separately from the config file so that hand-edits to the
 * config are never clobbered by the process.
 */

import { readFile, writeFile, rename, appendFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';

export async function loadState(stateFile) {
  try {
    return JSON.parse(await readFile(resolve(stateFile), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`  ! Could not read ${stateFile} (${err.message}); starting with fresh state.`);
    }
    return { rules: {}, events: [] };
  }
}

/**
 * Write atomically: a crash mid-write would otherwise leave truncated JSON,
 * and the next start would silently lose every rule's fired history.
 */
export async function saveState(stateFile, state) {
  const full = resolve(stateFile);
  const tmp = `${dirname(full)}/.${basename(full)}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await rename(tmp, full);
  } catch (err) {
    console.warn(`  ! Could not persist state to ${stateFile}: ${err.message}`);
  }
}

/** Overlay saved per-rule state (wasMet, lastFiredAt) onto freshly loaded rules. */
export function applyState(rules, saved) {
  for (const rule of rules) {
    const prev = saved?.rules?.[rule.id];
    if (!prev) continue;
    rule.wasMet = Boolean(prev.wasMet);
    rule.lastFiredAt = prev.lastFiredAt ?? null;
    // A one-shot rule that already fired stays fired across restarts.
    if (rule.repeat === false && prev.fired) rule.enabled = false;
  }
  return rules;
}

/** Extract the persistable slice of rule state. */
export function captureState(rules, events = []) {
  const out = { rules: {}, events: events.slice(0, 200), savedAt: Date.now() };
  for (const rule of rules) {
    out.rules[rule.id] = {
      wasMet: Boolean(rule.wasMet),
      lastFiredAt: rule.lastFiredAt ?? null,
      fired: Boolean(rule.lastFiredAt),
    };
  }
  return out;
}

/** Append one line per event to a human-readable log. */
export async function appendLog(logFile, event) {
  if (!logFile) return;
  const line = `${new Date(event.firedAt).toISOString()}  [${event.severity.toUpperCase()}]  ${event.symbol}  ${event.message}${event.note ? `  (${event.note})` : ''}\n`;
  try {
    await appendFile(resolve(logFile), line, 'utf8');
  } catch (err) {
    console.warn(`  ! Could not write ${logFile}: ${err.message}`);
  }
}
