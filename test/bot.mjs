// Play-test: a bot plays a full run in a real browser and screenshots each phase.
//   node test/bot.mjs [url] [skill 0..1]   (needs Chrome with CDP on 9334)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('file:///C:/Users/burak/Desktop/faith-channels/pipeline/package.json');
const { chromium } = require('playwright-core');
const URL = process.argv[2] ?? 'http://127.0.0.1:4890/index.html?debug';
const skill = Number(process.argv[3] ?? 0.8);
import { fileURLToPath } from 'node:url';
const OUT = fileURLToPath(new globalThis.URL('../kare/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9334');
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(URL, { waitUntil: 'load' });
await p.waitForTimeout(1500);
await p.screenshot({ path: OUT + '1-attract.png' });
await p.mouse.click(700, 700);
const sky = () => p.evaluate(() => window.__sky());
let shots = { card: false, flick: false, track: false, decide: false };
const t0 = Date.now();
let down = false;
while (Date.now() - t0 < 90000) {
  const s = await sky();
  if (s.state === 'results') break;
  if (s.state === 'card' && !shots.card && s.drill === 2) { await p.screenshot({ path: OUT + '2-card.png' }); shots.card = true; }
  if (s.state === 'play') {
    const id = ['flick', 'track', 'decide'][s.drill];
    if (id === 'track') {
      const t = s.targets[0];
      if (t) {
        const jx = (1 - skill) * t.r * 1.5 * (Math.random() - 0.5) * 2;
        await p.mouse.move(t.x + jx, t.y + jx, { steps: 2 });
        if (!down) { await p.mouse.down(); down = true; }
      }
    } else {
      if (down) { await p.mouse.up(); down = false; }
      const t = s.targets.find((x) => x.kind !== 'ally');
      if (t) {
        await p.waitForTimeout(150 + (1 - skill) * 500);
        const off = Math.random() < (1 - skill) * 0.4 ? t.r * 2 : 0;
        await p.mouse.move(t.x + off, t.y, { steps: 4 });
        await p.mouse.down(); await p.mouse.up();
      } else if (s.drill === 2 && Math.random() < (1 - skill) * 0.05 && s.targets[0]) {
        await p.mouse.click(s.targets[0].x, s.targets[0].y); // the occasional friendly-fire mistake
      }
    }
    if (!shots[id] && Date.now() % 7 === 0) { await p.screenshot({ path: OUT + `3-${id}.png` }); shots[id] = true; }
  }
  await p.waitForTimeout(16);
}
if (down) await p.mouse.up();
await p.waitForTimeout(1200);
await p.screenshot({ path: OUT + '4-results.png' });
for (const c of 'BOT') { await p.getByRole('button', { name: c, exact: true }).click(); await p.waitForTimeout(120); }
await p.getByRole('button', { name: 'SAVE' }).click();
await p.waitForTimeout(800);
await p.screenshot({ path: OUT + '5-saved.png' });
const res = await p.evaluate(() => ({ score: document.getElementById('rScore').textContent, tier: document.getElementById('rTier').textContent, rank: document.getElementById('rRank').textContent, flick: document.getElementById('rFlick').textContent, track: document.getElementById('rTrack').textContent, decide: document.getElementById('rDecide').textContent }));
console.log(JSON.stringify(res), 'errors:', errors.length ? errors : 'none', 'secs:', ((Date.now() - t0) / 1000).toFixed(0));
await ctx.close();
await b.close();
