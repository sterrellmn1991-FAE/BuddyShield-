/**
 * Alert delivery for the headless watcher.
 *
 * Channels, in order of how reliably they reach you when you are away from
 * the machine:
 *   webhook  → Discord/Slack/any JSON endpoint. This is the one that reaches
 *              a phone, and the only one that works when you are not at the
 *              computer at all.
 *   desktop  → OS notification, if the machine has a session attached.
 *   speech   → spoken aloud on the local machine.
 *   command  → an external program, handed the event as JSON on stdin.
 *   console  → always, and the log file alongside it.
 *
 * SECURITY NOTE: alert text contains data fetched from third-party APIs
 * (asset names, for instance). Every OS command below is invoked with
 * execFile and an argument array, never a shell string, so that text can
 * never be interpreted as shell syntax.
 */

import { execFile } from 'node:child_process';
import { platform } from 'node:os';

const SEVERITY_MARK = { info: 'i', warning: '!', critical: '!!' };
const SEVERITY_COLOR = { info: '\x1b[36m', warning: '\x1b[33m', critical: '\x1b[31m' };
const RESET = '\x1b[0m';

/** Promisified execFile that never rejects — a failed channel is not fatal. */
function run(cmd, args, input) {
  return new Promise((done) => {
    let child;
    try {
      child = execFile(cmd, args, { timeout: 8000 }, (err) => done(err ? err.message : null));
    } catch (err) {
      return done(err.message);
    }
    if (input !== undefined && child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

/* ------------------------------------------------------------------ console */

export function logToConsole(event) {
  const color = SEVERITY_COLOR[event.severity] || '';
  const time = new Date(event.firedAt).toLocaleTimeString();
  const mark = SEVERITY_MARK[event.severity] || '·';
  console.log(`${color}[${time}] ${mark} ${event.message}${RESET}${event.note ? `\n         note: ${event.note}` : ''}`);
}

/* ------------------------------------------------------------------ desktop */

/**
 * OS notification. Returns a reason string on failure, null on success, so
 * the caller can report which channels actually worked.
 */
export async function desktopNotify(event) {
  const title = `${event.symbol} — Market Watch`;
  const body = event.note ? `${event.message} (${event.note})` : event.message;

  switch (platform()) {
    case 'linux':
      return run('notify-send', [
        '--app-name=Market Watch',
        `--urgency=${event.severity === 'critical' ? 'critical' : 'normal'}`,
        title, body,
      ]);

    case 'darwin':
      // osascript takes the script as one argv entry; passing title/body as
      // separate argv items keeps them out of the script text entirely.
      return run('osascript', [
        '-e', 'on run {t, b}\ndisplay notification b with title t\nend run',
        title, body,
      ]);

    case 'win32':
      return run('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        // Args arrive via $args, so the text is data, never script.
        '$t=$args[0];$b=$args[1];' +
        '[void][Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime];' +
        '$x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(1);' +
        '$n=$x.GetElementsByTagName("text");$n[0].AppendChild($x.CreateTextNode($t))|Out-Null;' +
        '$n[1].AppendChild($x.CreateTextNode($b))|Out-Null;' +
        '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Market Watch").Show($x)',
        title, body,
      ]);

    default:
      return `desktop notifications are not implemented for ${platform()}`;
  }
}

/* ------------------------------------------------------------------- speech */

export async function speakAloud(event) {
  const text = event.message;
  switch (platform()) {
    case 'darwin': return run('say', [text]);
    case 'linux': {
      const err = await run('spd-say', ['--', text]);
      return err ? run('espeak', ['--', text]) : null;
    }
    case 'win32':
      return run('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Add-Type -AssemblyName System.Speech;' +
        '(New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($args[0])',
        text,
      ]);
    default: return `speech is not implemented for ${platform()}`;
  }
}

/* ------------------------------------------------------------------ webhook */

export function webhookBody(event, format) {
  const text = event.note ? `${event.message}\n_${event.note}_` : event.message;
  const icon = event.severity === 'critical' ? '🔴' : event.severity === 'warning' ? '🟠' : '🔵';

  switch (format) {
    case 'discord':
      return JSON.stringify({ content: `${icon} **${event.symbol}** — ${text}` });
    case 'slack':
      return JSON.stringify({ text: `${icon} *${event.symbol}* — ${text}` });
    default:
      return JSON.stringify({
        symbol: event.symbol,
        assetType: event.assetType,
        kind: event.kind,
        severity: event.severity,
        message: event.message,
        note: event.note || null,
        detail: event.detail,
        firedAt: new Date(event.firedAt).toISOString(),
      });
  }
}

export async function postWebhook(hook, event) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: webhookBody(event, hook.format),
      signal: controller.signal,
    });
    if (!res.ok) return `webhook responded ${res.status}`;
    return null;
  } catch (err) {
    return err.name === 'AbortError' ? 'webhook timed out' : err.message;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ command */

export async function runCommand(command, event) {
  if (!command) return null;
  const [cmd, ...args] = Array.isArray(command) ? command : [command];
  return run(cmd, args, JSON.stringify(event));
}

/* ------------------------------------------------------------------ combine */

/**
 * Deliver one event through every configured channel.
 * @returns {Promise<{delivered:string[], failed:string[]}>}
 */
export async function deliverEvent(event, watcherCfg, { quiet = false } = {}) {
  const delivered = [];
  const failed = [];

  logToConsole(event);
  delivered.push('console');

  // Quiet hours mute the attention-grabbing channels but never the durable
  // ones — the alert is still logged and still posted to your webhook, it
  // just does not make a noise at 3am. Critical alerts ignore quiet hours.
  const noisy = !quiet || event.severity === 'critical';

  const jobs = [];

  if (watcherCfg.desktopNotifications && noisy) {
    jobs.push(desktopNotify(event).then((e) => (e ? failed.push(`desktop (${e})`) : delivered.push('desktop'))));
  }
  if (watcherCfg.speak && noisy) {
    jobs.push(speakAloud(event).then((e) => (e ? failed.push(`speech (${e})`) : delivered.push('speech'))));
  }
  for (const hook of watcherCfg.webhooks || []) {
    jobs.push(postWebhook(hook, event).then((e) => (e ? failed.push(`webhook (${e})`) : delivered.push(`webhook:${hook.format}`))));
  }
  if (watcherCfg.command) {
    jobs.push(runCommand(watcherCfg.command, event).then((e) => (e ? failed.push(`command (${e})`) : delivered.push('command'))));
  }

  await Promise.all(jobs);
  return { delivered, failed };
}
