/** Tiny WebAudio synth: no audio files, so nothing to load or license. */
let ctx = null;
let enabled = true;

export function setSound(on) { enabled = on; }
export function unlock() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; } }
  if (ctx?.state === 'suspended') ctx.resume();
}

function tone(freq, dur, { type = 'sine', gain = 0.18, slide = 0, delay = 0 } = {}) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  hit: (quality = 1) => tone(520 + 380 * quality, 0.09, { type: 'triangle', slide: 240 }),
  miss: () => tone(170, 0.08, { type: 'square', gain: 0.06 }),
  ally: () => { tone(220, 0.18, { type: 'sawtooth', gain: 0.12, slide: -120 }); tone(150, 0.22, { type: 'sawtooth', gain: 0.1, delay: 0.08 }); },
  track: () => tone(880, 0.025, { gain: 0.03 }),
  count: (last) => tone(last ? 990 : 660, last ? 0.22 : 0.12, { type: 'triangle' }),
  end: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.09 })),
  click: () => tone(740, 0.04, { gain: 0.08 }),
};
