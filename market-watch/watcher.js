#!/usr/bin/env node
/**
 * Market Watch — background watcher.
 *
 * Polls your watchlist and fires alerts with no browser involved, so alerts
 * keep arriving after you close the tab. Run it on a machine that stays on
 * (a spare laptop, a Raspberry Pi, a small VPS) and point it at a webhook if
 * you want the alerts to reach your phone.
 *
 *   node watcher.js                            # uses ./watcher.config.json
 *   node watcher.js --config path/to.json
 *   node watcher.js --once                     # single pass, then exit (cron)
 *   node watcher.js --dry-run                  # evaluate, print, deliver nothing
 *   node watcher.js --test-alert               # prove the delivery channels work
 *
 * It reuses the exact analysis and alert modules the browser app runs, so a
 * rule behaves identically in both places. Two things are genuinely better
 * here: there is no CORS, so Yahoo stock data works with no key and no proxy;
 * and rule state is persisted, so a restart does not re-fire everything that
 * happens to be true at that moment.
 */

import { fetchAsset } from './js/providers/index.js';
import { analyseSeries } from './js/analysis/signals.js';
import { evaluateAll, assetKey, describeRule } from './js/alerts/rules.js';
import { loadConfig, inQuietHours, ConfigError } from './js/watcher/config.js';
import { loadState, saveState, applyState, captureState, appendLog } from './js/watcher/store.js';
import { deliverEvent } from './js/watcher/deliver.js';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/* -------------------------------------------------------------------- args */

function parseArgs(argv) {
  const args = { config: 'watcher.config.json', once: false, dryRun: false, testAlert: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config' || a === '-c') args.config = argv[++i];
    else if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--test-alert') args.testAlert = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--config=')) args.config = a.slice('--config='.length);
    else {
      console.error(`Unknown option: ${a}\nRun with --help to see the options.`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Market Watch background watcher

  node watcher.js [options]

  --config, -c <path>   Config file (default: watcher.config.json)
  --once                Run a single pass and exit — use this from cron
  --dry-run             Evaluate and print, but deliver nothing
  --test-alert          Send a test alert through every configured channel
  --help, -h            This message

Create a config by copying watcher.config.example.json, or export one from
the web app: Settings -> Export for watcher.
`);
}

/* ------------------------------------------------------------------- state */

const runtime = {
  assets: new Map(),
  events: [],
  polls: 0,
  fired: 0,
  failures: new Map(),   // assetKey -> consecutive failure count
};

/* -------------------------------------------------------------------- pass */

/**
 * One polling pass: refresh every asset, then evaluate every rule.
 * A fetch failure for one asset never aborts the pass — the rest still get
 * checked, and repeated failures are reported once rather than every minute.
 */
async function pass(config, args) {
  const { settings, watchlist, rules, watcher } = config;
  runtime.polls++;

  for (const item of watchlist) {
    const key = assetKey(item.assetType, item.symbol);
    try {
      const raw = await fetchAsset(item, settings);
      const analysis = analyseSeries(raw.series, item.assetType);
      const previous = runtime.assets.get(key);

      runtime.assets.set(key, {
        ...raw,
        analysis,
        previousRegime: previous?.analysis?.regime?.regime ?? null,
      });

      // Recovered after a run of failures — worth saying so.
      if (runtime.failures.get(key)) {
        console.log(`${DIM}  ${item.symbol}: recovered after ${runtime.failures.get(key)} failed attempt(s)${RESET}`);
        runtime.failures.delete(key);
      }
    } catch (err) {
      const count = (runtime.failures.get(key) || 0) + 1;
      runtime.failures.set(key, count);
      // Report the first failure and then every tenth, so a persistent
      // outage does not bury the useful output.
      if (count === 1 || count % 10 === 0) {
        console.error(`  ! ${item.symbol}: ${err.message.split('\n')[0]}${count > 1 ? ` (${count} in a row)` : ''}`);
      }
    }
    if (!settings.demoMode) await new Promise((r) => setTimeout(r, 250));
  }

  const now = Date.now();
  const fired = evaluateAll(rules, runtime.assets, now);

  if (fired.length) {
    const quiet = inQuietHours(watcher.quietHours, new Date(now));
    for (const event of fired) {
      runtime.fired++;
      runtime.events.unshift(event);
      if (args.dryRun) {
        console.log(`${DIM}[dry-run, not delivered]${RESET}`);
        const { logToConsole } = await import('./js/watcher/deliver.js');
        logToConsole(event);
        continue;
      }
      const { failed } = await deliverEvent(event, watcher, { quiet });
      if (failed.length) console.warn(`${DIM}  channels that failed: ${failed.join(', ')}${RESET}`);
      await appendLog(watcher.logFile, event);
    }
    runtime.events = runtime.events.slice(0, 200);
  }

  if (!args.dryRun) {
    await saveState(watcher.stateFile, captureState(rules, runtime.events));
  }

  return fired.length;
}

/** One-line status after each pass, so a long-running watcher shows a pulse. */
function printStatus(config) {
  const parts = [];
  for (const item of config.watchlist) {
    const a = runtime.assets.get(assetKey(item.assetType, item.symbol));
    if (!a) { parts.push(`${item.symbol} —`); continue; }
    const chg = a.analysis.dayChangePct;
    const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '·';
    parts.push(`${item.symbol} ${arrow}${Math.abs(chg ?? 0).toFixed(1)}% ${a.analysis.regime.label.toLowerCase()}`);
  }
  console.log(`${DIM}  ${new Date().toLocaleTimeString()}  ${parts.join('  ·  ')}${RESET}`);
}

/* -------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  let config;
  try {
    config = await loadConfig(args.config);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const { settings, watchlist, rules, watcher } = config;

  // A test alert exercises every channel without waiting for the market.
  if (args.testAlert) {
    console.log('\nSending a test alert through every configured channel…\n');
    const { delivered, failed } = await deliverEvent({
      id: 'test', ruleId: 'test', symbol: 'TEST', assetType: 'crypto', kind: 'test',
      severity: 'warning', detail: {}, note: 'this is only a test',
      message: 'Market Watch test alert — if you received this, the channel works.',
      firedAt: Date.now(),
    }, watcher, { quiet: false });
    console.log(`\n  delivered via: ${delivered.join(', ') || 'nothing'}`);
    if (failed.length) console.log(`  failed:        ${failed.join(', ')}`);
    console.log('');
    return;
  }

  const saved = await loadState(watcher.stateFile);
  applyState(rules, saved);
  // Seed the in-memory feed from disk. Without this, the first save of a new
  // process would overwrite the stored history with an empty list, quietly
  // wiping every alert the watcher had recorded before the restart.
  runtime.events = Array.isArray(saved.events) ? saved.events : [];

  console.log(`\n${BOLD}Market Watch — background watcher${RESET}`);
  console.log(`  watching ${watchlist.length} asset(s), ${rules.filter((r) => r.enabled).length} active rule(s)`);
  console.log(`  data:    ${settings.demoMode ? 'DEMO (simulated prices)' : 'live'}`);
  console.log(`  poll:    every ${settings.refreshSeconds}s`);
  const channels = [
    watcher.desktopNotifications && 'desktop',
    watcher.speak && 'speech',
    ...(watcher.webhooks || []).map((h) => `webhook:${h.format}`),
    watcher.command && 'command',
    watcher.logFile && `log:${watcher.logFile}`,
  ].filter(Boolean);
  console.log(`  alerts:  ${channels.join(', ') || 'console only'}`);
  if (watcher.quietHours) {
    console.log(`  quiet:   ${watcher.quietHours.start}–${watcher.quietHours.end} (critical alerts still get through)`);
  }
  if (args.dryRun) console.log(`  ${DIM}dry run — nothing will be delivered${RESET}`);
  console.log('');
  for (const rule of rules.filter((r) => r.enabled)) {
    console.log(`${DIM}  • ${describeRule(rule)}${RESET}`);
  }
  console.log('');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n\n  ${signal} received — saving state and stopping.`);
    if (!args.dryRun) await saveState(watcher.stateFile, captureState(rules, runtime.events));
    console.log(`  ${runtime.polls} poll(s), ${runtime.fired} alert(s) fired this session.\n`);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A thrown error anywhere in a pass must not take down a watcher that is
  // meant to run for weeks.
  const safePass = async () => {
    try {
      await pass(config, args);
      printStatus(config);
    } catch (err) {
      console.error(`  ! pass failed: ${err.message}`);
    }
  };

  await safePass();
  if (args.once) {
    console.log(`\n  Single pass complete — ${runtime.fired} alert(s) fired.\n`);
    return;
  }

  setInterval(safePass, settings.refreshSeconds * 1000);
}

main().catch((err) => {
  console.error('\nWatcher stopped unexpectedly:', err);
  process.exit(1);
});
