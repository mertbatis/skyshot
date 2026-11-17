/**
 * SKYSHOT scoring and statistics: pure functions, no DOM (unit-tested in test/score.test.mjs).
 *
 * A run has three drills, each testing a skill competitive players train:
 *   FLICK  - one target at a time; points for speed (reaction + movement time).
 *   TRACK  - a moving target; points for every 100 ms the crosshair is on it while the button is held.
 *   DECIDE - enemy (red) and ally (blue) targets pop up; hit red fast, never hit blue.
 */

export const DRILL_SECONDS = 20;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Points for a flick hit, from the time between the target appearing and the hit. */
export function flickPoints(ms) {
  // 150 ms or faster = full 150; 1000 ms or slower = 60.
  return Math.round(60 + 90 * clamp(1 - (ms - 150) / 850, 0, 1));
}

/** Points for a decide hit on an enemy (same curve, slightly steeper: the window is short). */
export function decidePoints(ms) {
  return Math.round(50 + 100 * clamp(1 - (ms - 180) / 620, 0, 1));
}

export const MISS_CLICK = -10; // clicking empty space
export const ALLY_HIT = -150; // hitting a friendly target
export const TRACK_TICK = 12; // per 100 ms on target

/** Median of a list (0 for an empty list). */
export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Summarise a run from its event log. Events:
 *   { drill:'flick', type:'hit', ms }   { drill:'flick'|'decide', type:'miss' }   (empty click)
 *   { drill:'track', type:'tick', on:boolean }  (every 100 ms while the drill runs)
 *   { drill:'decide', type:'enemy', ms } | { type:'ally' } | { type:'timeout' }
 */
export function summarize(events) {
  const f = events.filter((e) => e.drill === 'flick');
  const t = events.filter((e) => e.drill === 'track' && e.type === 'tick');
  const d = events.filter((e) => e.drill === 'decide');
  const flickHits = f.filter((e) => e.type === 'hit').map((e) => e.ms);
  const flickMiss = f.filter((e) => e.type === 'miss').length;
  const onTicks = t.filter((e) => e.on).length;
  const enemy = d.filter((e) => e.type === 'enemy').map((e) => e.ms);
  const ally = d.filter((e) => e.type === 'ally').length;
  const timeout = d.filter((e) => e.type === 'timeout').length;
  const decideMiss = d.filter((e) => e.type === 'miss').length;

  const parts = {
    flick: flickHits.reduce((s, ms) => s + flickPoints(ms), 0) + flickMiss * MISS_CLICK,
    track: onTicks * TRACK_TICK,
    decide: enemy.reduce((s, ms) => s + decidePoints(ms), 0) + ally * ALLY_HIT + decideMiss * MISS_CLICK,
  };
  for (const k of Object.keys(parts)) parts[k] = Math.max(0, parts[k]);
  const shots = flickHits.length + flickMiss + enemy.length + ally + decideMiss;
  return {
    score: parts.flick + parts.track + parts.decide,
    parts,
    flick: { hits: flickHits.length, misses: flickMiss, medianMs: median(flickHits), bestMs: flickHits.length ? Math.min(...flickHits) : 0 },
    track: { onPercent: t.length ? Math.round((onTicks / t.length) * 100) : 0 },
    decide: { enemies: enemy.length, allies: ally, timeouts: timeout, medianMs: median(enemy) },
    accuracy: shots ? Math.round(((flickHits.length + enemy.length) / shots) * 100) : 0,
  };
}

/** Title for a score: cloud layers, low to high. */
export const TIERS = [
  [0, 'Fog'],
  [2000, 'Stratus'],
  [3500, 'Cumulus'],
  [5000, 'Nimbus'],
  [6500, 'Cirrus'],
  [8000, 'Cloud Nine'],
];
export function tier(score) {
  let t = TIERS[0][1];
  for (const [min, name] of TIERS) if (score >= min) t = name;
  return t;
}

/** The single coaching tip that would help this player most. */
export function tip(s) {
  if (s.decide.allies >= 2) return 'Check the colour before you click: friendly fire cost you the most points.';
  if (s.track.onPercent < 45) return 'Tracking: move with the target and keep the button held; small, smooth corrections beat big jumps.';
  if (s.flick.medianMs > 650) return 'Flicks: commit to one fast motion to the target, then correct. Hesitation adds hundreds of milliseconds.';
  if (s.accuracy < 75) return 'Accuracy: slow down slightly. Missed clicks cost points and break your rhythm.';
  if (s.decide.timeouts >= 3) return 'Decide drill: enemies vanish after a second. React first, aim second.';
  return 'Strong all-round run. Try to beat your flick median next time.';
}
