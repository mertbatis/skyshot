/**
 * Local storage + live sync between the game screen and the leaderboard screen.
 * Everything stays on the booth machine: no network, works with Wi-Fi off.
 * BroadcastChannel updates another window instantly; the "storage" event is the fallback.
 */
import { cleanName, dayOf, prune } from './board.js';

const KEY = 'skyshot.entries.v1';
const SET = 'skyshot.settings.v1';
const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('skyshot') : null;
let memEntries = [];
let memSettings = { sound: true, eventName: 'Cloud9 x JetBrains booth' };

export function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return memEntries;
  }
}

function save(list) {
  memEntries = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode or full: keep in memory */ }
  chan?.postMessage({ type: 'update' });
}

export function settings() {
  try { return { ...memSettings, ...JSON.parse(localStorage.getItem(SET) ?? '{}') }; } catch { return memSettings; }
}
export function setSettings(patch) {
  memSettings = { ...settings(), ...patch };
  try { localStorage.setItem(SET, JSON.stringify(memSettings)); } catch { /* ignore */ }
  chan?.postMessage({ type: 'settings' });
}

/** Store a finished run and tell the leaderboard screen. */
export function addRun(name, summary, tierName) {
  const ts = Date.now();
  const entry = { id: (crypto.randomUUID?.() ?? `${ts}-${Math.random()}`), name: cleanName(name), score: summary.score, ts, day: dayOf(ts), tier: tierName, stats: summary };
  save(prune([...load(), entry]));
  chan?.postMessage({ type: 'run', id: entry.id });
  return entry;
}

/** A player is on stage right now (the board shows "now playing"). */
export function announce(msg) { chan?.postMessage(msg); }

export function onChange(fn) {
  chan?.addEventListener('message', (e) => fn(e.data ?? {}));
  addEventListener('storage', (e) => { if (e.key === KEY || e.key === SET) fn({ type: 'update' }); });
}

export function clearDay(day) { save(load().filter((e) => e.day !== day)); }
export function clearAll() { save([]); }
export const today = () => dayOf(Date.now());
