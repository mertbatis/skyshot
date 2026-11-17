/**
 * Local leaderboard logic: pure functions over a plain array of entries (unit-tested).
 * Storage (localStorage) and live sync (BroadcastChannel) live in store.js.
 *
 * Entry: { id, name, score, ts, day, tier, stats }
 */

/** Local calendar day (YYYY-MM-DD) of a timestamp: booths reset "today" at local midnight. */
export function dayOf(ts, tzOffsetMin = new Date(ts).getTimezoneOffset()) {
  return new Date(ts - tzOffsetMin * 60e3).toISOString().slice(0, 10);
}

/** Initials: 1-3 characters A-Z / 0-9; anything else becomes "???". */
export function cleanName(name) {
  const n = String(name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return n || '???';
}

const byScore = (a, b) => b.score - a.score || a.ts - b.ts; // ties: earlier run ranks higher

/** Top n entries, optionally for one day. */
export function top(entries, n = 10, day = null) {
  return entries.filter((e) => !day || e.day === day).sort(byScore).slice(0, n);
}

/** 1-based rank of an entry among a set (today's or all-time). */
export function rankOf(entries, entry, day = null) {
  const pool = entries.filter((e) => !day || e.day === day).sort(byScore);
  return pool.findIndex((e) => e.id === entry.id) + 1;
}

/** Share of runs (today) this score beat, 0-100. */
export function percentile(entries, score, day = null) {
  const pool = entries.filter((e) => !day || e.day === day);
  if (pool.length <= 1) return 100;
  const below = pool.filter((e) => e.score < score).length;
  return Math.round((below / (pool.length - 1)) * 100);
}

/** Would this score make today's top n? (Used to celebrate before the name is entered.) */
export function qualifies(entries, score, day, n = 10) {
  const t = top(entries, n, day);
  return t.length < n || score > t[t.length - 1].score;
}

/** Cap stored history so a multi-day event never fills localStorage: keep every day's top 50 and the last 2000 runs. */
export function prune(entries, perDay = 50, max = 2000) {
  const keep = new Set();
  const days = [...new Set(entries.map((e) => e.day))];
  for (const d of days) for (const e of top(entries, perDay, d)) keep.add(e.id);
  const recent = [...entries].sort((a, b) => b.ts - a.ts).slice(0, max);
  for (const e of recent) keep.add(e.id);
  return entries.filter((e) => keep.has(e.id));
}

/** CSV export for the booth operator (formula-safe). */
export function toCsv(entries) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['day', 'time', 'name', 'score', 'tier', 'flick_median_ms', 'track_on_percent', 'decide_correct', 'friendly_hits', 'accuracy'];
  const rows = [...entries].sort((a, b) => a.ts - b.ts).map((e) => [e.day, new Date(e.ts).toISOString(), e.name, e.score, e.tier, e.stats?.flick?.medianMs, e.stats?.track?.onPercent, e.stats?.decide?.enemies, e.stats?.decide?.allies, e.stats?.accuracy]);
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
