/**
 * Alert delivery: on-screen toast, desktop notification, sound, and speech.
 *
 * Speech is here because an alert you have to be looking at the screen to
 * notice is only half an alert. The Web Speech API is built into browsers,
 * needs no key, and works offline.
 */

import { escapeHtml } from '../util.js';

let toastHost = null;

function host() {
  if (!toastHost) toastHost = document.getElementById('toast-host');
  return toastHost;
}

/** Ask for desktop-notification permission. Returns the resulting state. */
export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function notificationState() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Short rising/falling tone. Built with WebAudio so there is no asset to ship. */
function playTone(severity) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const base = severity === 'critical' ? 660 : severity === 'warning' ? 520 : 440;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      severity === 'critical' ? base * 0.6 : base * 1.5,
      ctx.currentTime + 0.18,
    );
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => ctx.close();
  } catch {
    /* audio is a nicety, never a failure path */
  }
}

/** Read text aloud. Cancels any queued utterance so alerts do not pile up. */
export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return false;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.pitch = 1;
    utter.volume = 1;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** On-screen toast. Always shown — it is the one channel that cannot fail. */
export function toast(message, severity = 'info', timeoutMs = 9000) {
  const el = host();
  if (!el) return;
  const node = document.createElement('div');
  node.className = `toast toast--${severity}`;
  node.setAttribute('role', severity === 'critical' ? 'alert' : 'status');
  node.innerHTML = `
    <span class="toast__mark" aria-hidden="true">${severity === 'critical' ? '!!' : severity === 'warning' ? '!' : 'i'}</span>
    <span class="toast__body">${escapeHtml(message)}</span>
    <button class="toast__close" aria-label="Dismiss">×</button>`;
  node.querySelector('.toast__close').addEventListener('click', () => node.remove());
  el.appendChild(node);
  setTimeout(() => node.remove(), timeoutMs);
}

/**
 * Deliver one fired alert through every channel the user has enabled.
 * @param {object} event  from evaluateAll()
 * @param {object} settings
 */
export function deliver(event, settings) {
  const text = event.note ? `${event.message} (${event.note})` : event.message;

  toast(text, event.severity);

  if (settings.notificationsEnabled && notificationState() === 'granted') {
    try {
      const n = new Notification(`${event.symbol} alert`, {
        body: text,
        tag: event.ruleId,           // collapse repeats for the same rule
        requireInteraction: event.severity === 'critical',
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {
      /* some browsers block constructing Notification outside a SW */
    }
  }

  if (settings.soundEnabled) playTone(event.severity);
  if (settings.speakAlerts) speak(text);
}
