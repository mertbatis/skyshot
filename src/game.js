/**
 * SKYSHOT: a 60-second, mouse-only aim trial for event booths.
 * States: attract -> (card -> play) x 3 drills -> results (initials) -> saved -> attract.
 */
import { DRILL_SECONDS, decidePoints, flickPoints, summarize, tier, tip, ALLY_HIT, MISS_CLICK, TRACK_TICK } from './score.js';
import { percentile, qualifies, rankOf, top, toCsv } from './board.js';
import { addRun, announce, clearAll, clearDay, load, onChange, setSettings, settings, today } from './store.js';
import { setSound, sfx, unlock } from './audio.js';

const DRILLS = [
  { id: 'flick', name: 'FLICK', how: 'Click each target as fast as you can.' },
  { id: 'track', name: 'TRACK', how: 'Hold the mouse button and stay on the moving target.' },
  { id: 'decide', name: 'DECIDE', how: 'Hit the red diamonds. Never hit the blue allies.' },
];
const CARD_MS = 2600;
const IDLE_ABORT_MS = 12000; // nobody touching the mouse mid-run: the player walked away
const RESULTS_IDLE_MS = 30000;

const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const g = canvas.getContext('2d');
let W = 0;
let H = 0;
let S = 1; // size unit: 1% of the short side

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = Math.min(W, H) / 100;
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ state
let state = 'attract';
let drill = 0;
let phaseStart = 0;
let events = [];
let score = 0;
let mouse = { x: W / 2, y: H / 2, down: false, moved: performance.now() };
let targets = [];
let pops = [];
let sparks = [];
let lastTick = 0;
let nextSpawn = 0;
let lastFlick = null;
let resultsTimer = 0;
let current = null; // { summary, tier, entry }
let initials = '';
const rnd = (a, b) => a + Math.random() * (b - a);

function applySettings() { setSound(settings().sound); $('#eventName').textContent = settings().eventName; }
applySettings();

// ------------------------------------------------------------------ screens
function show(id) { for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id; document.body.classList.toggle('playing', id === null); }

function renderAttract() {
  const d = today();
  const list = load();
  const best = top(list, 5, d);
  $('#attractTop').innerHTML = best.length
    ? best.map((e, i) => `<li><span class="r">${i + 1}</span><span class="n">${e.name}</span><span class="s">${e.score}</span></li>`).join('')
    : '<li class="empty">No runs yet today. Be the first.</li>';
  $('#plays').textContent = `${list.filter((e) => e.day === d).length} runs today`;
}

function toAttract() {
  state = 'attract';
  targets = [];
  show('attract');
  renderAttract();
  announce({ type: 'idle' });
}

function startRun() {
  unlock();
  sfx.click();
  events = [];
  score = 0;
  drill = 0;
  show(null);
  announce({ type: 'playing' });
  startCard();
}

function startCard() {
  state = 'card';
  phaseStart = performance.now();
  targets = [];
  let n = 3;
  const beat = () => { if (state !== 'card') return; sfx.count(n === 0); n--; if (n >= 0) setTimeout(beat, 700); };
  setTimeout(beat, 500);
}

function startDrill() {
  state = 'play';
  phaseStart = performance.now();
  lastTick = phaseStart;
  nextSpawn = phaseStart;
  lastFlick = null;
  targets = [];
  const id = DRILLS[drill].id;
  if (id === 'flick') spawnFlick();
  if (id === 'track') targets.push({ kind: 'track', x: W / 2, y: H / 2, r: 4.6 * S, a: rnd(0, Math.PI * 2), born: phaseStart });
}

function endRun() {
  state = 'results';
  sfx.end();
  const summary = summarize(events);
  const t = tier(summary.score);
  current = { summary, tier: t, entry: null };
  initials = '';
  const d = today();
  const list = load();
  $('#rScore').textContent = summary.score;
  $('#rTier').textContent = t;
  $('#rFlick').textContent = summary.flick.hits ? `${summary.flick.medianMs} ms` : '—';
  $('#rFlickSub').textContent = `${summary.flick.hits} hits · best ${summary.flick.bestMs || '—'} ms`;
  $('#rTrack').textContent = `${summary.track.onPercent}%`;
  $('#rDecide').textContent = `${summary.decide.enemies}`;
  $('#rDecideSub').textContent = `${summary.decide.allies} friendly fire · ${summary.decide.timeouts} missed`;
  $('#rAcc').textContent = `${summary.accuracy}%`;
  $('#rTip').textContent = tip(summary);
  $('#rTop').hidden = !qualifies(list, summary.score, d, 10);
  $('#rBeat').textContent = `Better than ${percentile([...list, { score: summary.score, day: d }], summary.score, d)}% of today's runs`;
  renderInitials();
  show('results');
  $('#saved').hidden = true;
  $('#entry').hidden = false;
  resultsTimer = performance.now();
  announce({ type: 'finished', score: summary.score });
}

function renderInitials() {
  const shown = [...initials.padEnd(3, ' ')].map((c) => (c === ' ' ? ' ' : c)).join('');
  $('#initials').innerHTML = [...shown].map((c) => `<span>${c}</span>`).join('');
}

function saveRun() {
  if (!current || current.entry) return;
  const entry = addRun(initials || '???', current.summary, current.tier);
  current.entry = entry;
  const list = load();
  const r = rankOf(list, entry, entry.day);
  $('#entry').hidden = true;
  $('#saved').hidden = false;
  $('#rRank').textContent = `#${r} today`;
  $('#rRankAll').textContent = `#${rankOf(list, entry)} all time`;
  resultsTimer = performance.now();
  sfx.click();
}

// letter pad (mouse-only) + keyboard
const PAD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
$('#pad').innerHTML = PAD.map((c) => `<button data-k="${c}">${c}</button>`).join('') + '<button data-k="DEL" class="del">DEL</button><button data-k="OK" class="ok">SAVE</button>';
$('#pad').addEventListener('click', (e) => {
  const k = e.target.dataset?.k;
  if (!k) return;
  resultsTimer = performance.now();
  if (k === 'DEL') initials = initials.slice(0, -1);
  else if (k === 'OK') return saveRun();
  else if (initials.length < 3) initials += k;
  sfx.click();
  renderInitials();
});
$('#next').addEventListener('click', () => { sfx.click(); toAttract(); });
addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openOperator(); return; }
  if (state !== 'results' || current?.entry) return;
  resultsTimer = performance.now();
  if (/^[a-z0-9]$/i.test(e.key) && initials.length < 3) initials += e.key.toUpperCase();
  else if (e.key === 'Backspace') initials = initials.slice(0, -1);
  else if (e.key === 'Enter') return saveRun();
  renderInitials();
});

$('#attract').addEventListener('pointerdown', (e) => { if (e.target.closest('#cornerHit')) return; startRun(); });

// ------------------------------------------------------------------ operator panel (Ctrl+Shift+O, or 5 quick clicks in the top-left corner)
let cornerClicks = [];
$('#cornerHit').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  const now = performance.now();
  cornerClicks = [...cornerClicks.filter((t) => now - t < 2500), now];
  if (cornerClicks.length >= 5) { cornerClicks = []; openOperator(); }
});
function openOperator() {
  $('#opSound').textContent = settings().sound ? 'Sound: on' : 'Sound: off';
  $('#opEvent').value = settings().eventName;
  $('#operator').hidden = false;
}
$('#opClose').addEventListener('click', () => { setSettings({ eventName: $('#opEvent').value.slice(0, 60) }); applySettings(); $('#operator').hidden = true; renderAttract(); });
$('#opBoard').addEventListener('click', () => window.open('board.html', 'skyshot-board', 'width=1280,height=800'));
$('#opSound').addEventListener('click', () => { setSettings({ sound: !settings().sound }); applySettings(); $('#opSound').textContent = settings().sound ? 'Sound: on' : 'Sound: off'; });
$('#opCsv').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCsv(load())], { type: 'text/csv' }));
  a.download = `skyshot-${today()}.csv`;
  a.click();
});
$('#opToday').addEventListener('click', () => { if (confirm("Clear today's leaderboard?")) { clearDay(today()); renderAttract(); } });
$('#opAll').addEventListener('click', () => { if (confirm('Delete every run on this machine?') && confirm('Really delete everything?')) { clearAll(); renderAttract(); } });
onChange(() => { if (state === 'attract') renderAttract(); applySettings(); });

// ------------------------------------------------------------------ input during play
addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = performance.now(); });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointerup', () => { mouse.down = false; });
canvas.addEventListener('pointerdown', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.down = true; mouse.moved = performance.now();
  if (state !== 'play') return;
  const now = performance.now();
  const id = DRILLS[drill].id;
  if (id === 'track') return;
  const hit = targets.find((t) => Math.hypot(t.x - mouse.x, t.y - mouse.y) <= t.r * 1.08);
  if (!hit) { record({ drill: id, type: 'miss' }, MISS_CLICK, mouse.x, mouse.y); sfx.miss(); return; }
  targets = targets.filter((t) => t !== hit);
  const ms = Math.round(now - hit.born);
  if (id === 'flick') {
    const p = flickPoints(ms);
    record({ drill: 'flick', type: 'hit', ms }, p, hit.x, hit.y, `${ms} ms`);
    burst(hit.x, hit.y, '#5ce1ff');
    sfx.hit(p / 150);
    lastFlick = hit;
    spawnFlick();
  } else if (hit.kind === 'enemy') {
    const p = decidePoints(ms);
    record({ drill: 'decide', type: 'enemy', ms }, p, hit.x, hit.y, `${ms} ms`);
    burst(hit.x, hit.y, '#ff5a6e');
    sfx.hit(p / 150);
  } else {
    record({ drill: 'decide', type: 'ally' }, ALLY_HIT, hit.x, hit.y, 'FRIENDLY FIRE');
    burst(hit.x, hit.y, '#ffd34d');
    sfx.ally();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 300);
  }
});

function record(ev, points, x, y, label) {
  events.push(ev);
  score = Math.max(0, score + points);
  pops.push({ x, y, text: label ? `${points > 0 ? '+' : ''}${points}  ${label}` : `${points > 0 ? '+' : ''}${points}`, bad: points < 0, born: performance.now() });
}
function burst(x, y, color) {
  for (let i = 0; i < 14; i++) { const a = rnd(0, Math.PI * 2); const v = rnd(0.15, 0.55) * S; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, born: performance.now() }); }
}

// ------------------------------------------------------------------ spawning
function spawnFlick() {
  const r = 3.2 * S;
  const m = r + 6 * S;
  let x;
  let y;
  for (let i = 0; i < 20; i++) {
    x = rnd(m, W - m);
    y = rnd(m + 8 * S, H - m);
    if (!lastFlick || Math.hypot(x - lastFlick.x, y - lastFlick.y) > 22 * S) break;
  }
  targets.push({ kind: 'flick', x, y, r, born: performance.now() });
}
function spawnDecide(now) {
  const r = 3.6 * S;
  const m = r + 6 * S;
  const enemy = Math.random() < 0.68;
  let x;
  let y;
  for (let i = 0; i < 20; i++) {
    x = rnd(m, W - m);
    y = rnd(m + 8 * S, H - m);
    if (targets.every((t) => Math.hypot(t.x - x, t.y - y) > 12 * S)) break;
  }
  targets.push({ kind: enemy ? 'enemy' : 'ally', x, y, r, born: now, life: enemy ? 1000 : 1150 });
  // Later in the drill, decisions come faster.
  const t = (now - phaseStart) / (DRILL_SECONDS * 1000);
  nextSpawn = now + rnd(560, 820) * (1 - 0.3 * t);
}

// ------------------------------------------------------------------ update + draw
function update(now) {
  if (state === 'card' && now - phaseStart >= CARD_MS) startDrill();
  if (state !== 'play') return;
  if (now - mouse.moved > IDLE_ABORT_MS) { toAttract(); return; }
  const id = DRILLS[drill].id;
  const elapsed = now - phaseStart;
  if (id === 'track') {
    const t = targets[0];
    const k = elapsed / (DRILL_SECONDS * 1000);
    const speed = (0.22 + 0.28 * k) * S; // per frame-ish at 60 fps
    t.a += rnd(-0.09, 0.09) + Math.sin(now / 700) * 0.02;
    t.x += Math.cos(t.a) * speed * 1.6;
    t.y += Math.sin(t.a) * speed * 1.6;
    const m = t.r + 4 * S;
    if (t.x < m || t.x > W - m) { t.a = Math.PI - t.a; t.x = Math.max(m, Math.min(W - m, t.x)); }
    if (t.y < m + 8 * S || t.y > H - m) { t.a = -t.a; t.y = Math.max(m + 8 * S, Math.min(H - m, t.y)); }
    t.r = (4.6 - 1.4 * k) * S;
    while (now - lastTick >= 100) {
      lastTick += 100;
      const on = mouse.down && Math.hypot(t.x - mouse.x, t.y - mouse.y) <= t.r;
      t.on = on;
      events.push({ drill: 'track', type: 'tick', on });
      if (on) { score += TRACK_TICK; sfx.track(); }
    }
  }
  if (id === 'decide') {
    if (now >= nextSpawn) spawnDecide(now);
    for (const t of [...targets]) {
      if (now - t.born > t.life) {
        targets = targets.filter((x) => x !== t);
        if (t.kind === 'enemy') { events.push({ drill: 'decide', type: 'timeout' }); pops.push({ x: t.x, y: t.y, text: 'too slow', bad: true, born: now }); }
      }
    }
  }
  if (elapsed >= DRILL_SECONDS * 1000) {
    drill++;
    if (drill >= DRILLS.length) endRun();
    else startCard();
  }
}

const SKY = '#5ce1ff';
function drawBackground(now) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#071528');
  grd.addColorStop(1, '#0d2a4a');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(92,225,255,0.05)';
  g.lineWidth = 1;
  const step = 8 * S;
  const off = (now / 60) % step;
  for (let x = -step + off; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
}

function drawTarget(t, now) {
  const age = now - t.born;
  const pop = Math.min(1, age / 90);
  const r = t.r * (0.6 + 0.4 * pop);
  g.save();
  g.translate(t.x, t.y);
  if (t.kind === 'enemy') {
    const left = 1 - age / t.life;
    g.rotate(Math.PI / 4);
    g.fillStyle = '#ff4d63';
    g.shadowColor = '#ff4d63';
    g.shadowBlur = 18;
    g.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
    g.shadowBlur = 0;
    g.fillStyle = '#2a0710';
    g.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    g.rotate(-Math.PI / 4);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 0.5 * S;
    g.beginPath();
    g.arc(0, 0, r * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left));
    g.stroke();
  } else if (t.kind === 'ally') {
    g.fillStyle = '#3d7bff';
    g.shadowColor = '#3d7bff';
    g.shadowBlur = 14;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#e8f0ff';
    g.beginPath(); // shield
    g.moveTo(0, -r * 0.55); g.lineTo(r * 0.45, -r * 0.35); g.lineTo(r * 0.38, r * 0.2); g.lineTo(0, r * 0.6); g.lineTo(-r * 0.38, r * 0.2); g.lineTo(-r * 0.45, -r * 0.35); g.closePath(); g.fill();
  } else {
    const on = t.kind === 'track' && t.on;
    for (const [k, c] of [[1, on ? '#7dffb2' : SKY], [0.66, '#071528'], [0.36, on ? '#7dffb2' : SKY]]) {
      g.fillStyle = c;
      g.beginPath(); g.arc(0, 0, r * k, 0, Math.PI * 2); g.fill();
    }
    if (on) { g.strokeStyle = 'rgba(125,255,178,0.5)'; g.lineWidth = 0.6 * S; g.beginPath(); g.arc(0, 0, r * 1.3, 0, Math.PI * 2); g.stroke(); }
  }
  g.restore();
}

function drawHud(now) {
  const d = DRILLS[drill];
  const elapsed = now - phaseStart;
  const left = Math.max(0, DRILL_SECONDS - elapsed / 1000);
  g.fillStyle = 'rgba(7,21,40,0.75)';
  g.fillRect(0, 0, W, 7 * S);
  g.fillStyle = SKY;
  g.fillRect(0, 7 * S - 0.6 * S, W * (left / DRILL_SECONDS), 0.6 * S);
  g.font = `800 ${3.2 * S}px system-ui, Segoe UI, sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#fff';
  g.fillText(`${drill + 1}/3  ${d.name}`, 2.5 * S, 3.4 * S);
  g.textAlign = 'center';
  g.fillText(left.toFixed(1), W / 2, 3.4 * S);
  g.textAlign = 'right';
  g.fillText(String(score), W - 2.5 * S, 3.4 * S);
  if (d.id === 'track') {
    const ticks = events.filter((e) => e.type === 'tick');
    const pct = ticks.length ? Math.round((ticks.filter((e) => e.on).length / ticks.length) * 100) : 0;
    g.font = `700 ${2.2 * S}px system-ui, Segoe UI, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.textAlign = 'center';
    g.fillText(`ON TARGET ${pct}%`, W / 2, 10 * S);
  }
}

function drawCard(now) {
  const d = DRILLS[drill];
  const t = (now - phaseStart) / CARD_MS;
  const n = Math.max(1, 3 - Math.floor((now - phaseStart - 500) / 700));
  g.fillStyle = 'rgba(7,21,40,0.55)';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = SKY;
  g.font = `800 ${2.4 * S}px system-ui, Segoe UI, sans-serif`;
  g.fillText(`DRILL ${drill + 1} OF 3`, W / 2, H / 2 - 16 * S);
  g.fillStyle = '#fff';
  g.font = `900 ${13 * S}px system-ui, Segoe UI, sans-serif`;
  g.fillText(d.name, W / 2, H / 2 - 4 * S);
  g.font = `600 ${3 * S}px system-ui, Segoe UI, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(d.how, W / 2, H / 2 + 8 * S);
  if (t > 0.19) { g.font = `900 ${9 * S}px system-ui, Segoe UI, sans-serif`; g.fillStyle = SKY; g.fillText(String(n), W / 2, H / 2 + 22 * S); }
  // Show what the targets look like in the decide drill.
  if (d.id === 'decide') {
    drawTarget({ kind: 'enemy', x: W / 2 - 22 * S, y: H / 2 + 22 * S, r: 3.6 * S, born: 0, life: 1e12 }, now);
    drawTarget({ kind: 'ally', x: W / 2 + 22 * S, y: H / 2 + 22 * S, r: 3.6 * S, born: 0 }, now);
    g.font = `700 ${2 * S}px system-ui, Segoe UI, sans-serif`;
    g.fillStyle = '#ff8090'; g.fillText('HIT', W / 2 - 22 * S, H / 2 + 28.5 * S);
    g.fillStyle = '#9fc0ff'; g.fillText('DON\'T', W / 2 + 22 * S, H / 2 + 28.5 * S);
  }
}

function drawCrosshair() {
  const x = mouse.x;
  const y = mouse.y;
  const a = 1.6 * S;
  const gap = 0.7 * S;
  g.strokeStyle = '#000';
  g.lineWidth = 0.55 * S;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(x + dx * gap, y + dy * gap); g.lineTo(x + dx * (gap + a), y + dy * (gap + a)); g.stroke(); }
  g.strokeStyle = '#7dffb2';
  g.lineWidth = 0.25 * S;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.beginPath(); g.moveTo(x + dx * gap, y + dy * gap); g.lineTo(x + dx * (gap + a), y + dy * (gap + a)); g.stroke(); }
  g.fillStyle = '#7dffb2';
  g.fillRect(x - 0.15 * S, y - 0.15 * S, 0.3 * S, 0.3 * S);
}

function drawEffects(now) {
  sparks = sparks.filter((p) => now - p.born < 450);
  for (const p of sparks) { const k = (now - p.born) / 450; p.x += p.vx; p.y += p.vy; g.globalAlpha = 1 - k; g.fillStyle = p.color; g.fillRect(p.x, p.y, 0.6 * S, 0.6 * S); }
  g.globalAlpha = 1;
  pops = pops.filter((p) => now - p.born < 750);
  g.textAlign = 'center';
  g.font = `800 ${2.2 * S}px system-ui, Segoe UI, sans-serif`;
  for (const p of pops) { const k = (now - p.born) / 750; g.globalAlpha = 1 - k; g.fillStyle = p.bad ? '#ff8090' : '#ffffff'; g.fillText(p.text, p.x, p.y - 5 * S - k * 5 * S); }
  g.globalAlpha = 1;
}

// Attract screen background: slow drifting targets.
const drift = Array.from({ length: 9 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(0.00005, 0.00015), r: rnd(2, 5) }));
function drawAttract(now) {
  for (const d of drift) {
    d.y -= d.v * 16;
    if (d.y < -0.1) { d.y = 1.1; d.x = Math.random(); }
    g.globalAlpha = 0.25;
    drawTarget({ kind: 'flick', x: d.x * W, y: d.y * H, r: d.r * S, born: 0 }, now);
  }
  g.globalAlpha = 1;
}

function frame(now) {
  update(now);
  drawBackground(now);
  if (state === 'attract' || state === 'results') drawAttract(now);
  if (state === 'play' || state === 'card') {
    for (const t of targets) drawTarget(t, now);
    drawEffects(now);
    drawHud(now);
    if (state === 'card') drawCard(now);
    drawCrosshair();
  }
  if (state === 'results' && now - resultsTimer > RESULTS_IDLE_MS) {
    if (current && !current.entry) saveRun(); // walked away without initials: keep the run as "???"
    toAttract();
  }
  requestAnimationFrame(frame);
}

// Read-only hook for automated play-tests (only with ?debug in the URL).
if (new URLSearchParams(location.search).has('debug')) window.__sky = () => ({ state, drill, score, targets: targets.map((t) => ({ kind: t.kind, x: t.x, y: t.y, r: t.r })) });

toAttract();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
