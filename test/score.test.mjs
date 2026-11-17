import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePoints, flickPoints, median, summarize, tier, tip } from '../src/score.js';
import { cleanName, dayOf, percentile, prune, qualifies, rankOf, toCsv, top } from '../src/board.js';

test('flick and decide points reward speed and stay in range', () => {
  assert.equal(flickPoints(100), 150);
  assert.equal(flickPoints(150), 150);
  assert.equal(flickPoints(1000), 60);
  assert.equal(flickPoints(5000), 60);
  assert.ok(flickPoints(400) > flickPoints(600));
  assert.equal(decidePoints(180), 150);
  assert.equal(decidePoints(2000), 50);
  assert.equal(median([300, 100, 200]), 200);
  assert.equal(median([]), 0);
});

test('summarize: parts, penalties, accuracy, never negative', () => {
  const ev = [
    { drill: 'flick', type: 'hit', ms: 150 },
    { drill: 'flick', type: 'hit', ms: 1000 },
    { drill: 'flick', type: 'miss' },
    ...Array.from({ length: 10 }, (_, i) => ({ drill: 'track', type: 'tick', on: i < 7 })),
    { drill: 'decide', type: 'enemy', ms: 180 },
    { drill: 'decide', type: 'ally' },
    { drill: 'decide', type: 'timeout' },
  ];
  const s = summarize(ev);
  assert.equal(s.parts.flick, 150 + 60 - 10);
  assert.equal(s.parts.track, 7 * 12);
  assert.equal(s.parts.decide, 0); // 150 - 150
  assert.equal(s.score, 200 + 84);
  assert.equal(s.track.onPercent, 70);
  assert.equal(s.accuracy, 60); // 3 good of 5 shots
  assert.equal(s.flick.bestMs, 150);
  assert.equal(summarize([{ drill: 'decide', type: 'ally' }]).parts.decide, 0);
  assert.equal(tier(0), 'Fog');
  assert.equal(tier(6000), 'Nimbus');
  assert.equal(tier(9000), 'Cloud Nine');
  assert.match(tip({ ...s, decide: { ...s.decide, allies: 2 } }), /friendly fire/);
});

test('leaderboard: names, ranking, ties, percentile, qualification', () => {
  assert.equal(cleanName('ab!c9'), 'ABC');
  assert.equal(cleanName(''), '???');
  const d = '2026-11-17';
  const e = [
    { id: 'a', name: 'AAA', score: 3000, ts: 1, day: d },
    { id: 'b', name: 'BBB', score: 4000, ts: 2, day: d },
    { id: 'c', name: 'CCC', score: 3000, ts: 3, day: d },
    { id: 'z', name: 'ZZZ', score: 9000, ts: 0, day: '2026-11-16' },
  ];
  assert.deepEqual(top(e, 3, d).map((x) => x.id), ['b', 'a', 'c']);
  assert.equal(rankOf(e, e[2], d), 3);
  assert.equal(rankOf(e, e[3]), 1);
  assert.equal(percentile(e, 4000, d), 100);
  assert.equal(percentile(e, 3000, d), 0);
  assert.equal(qualifies(e, 100, d, 10), true);
  assert.equal(qualifies(e, 2000, d, 3), false);
  assert.equal(dayOf(Date.UTC(2026, 10, 17, 23, 30), -180), '2026-11-18'); // UTC+3
});

test('prune keeps each day top and recent runs; csv is formula-safe', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: String(i), name: 'X', score: i, ts: i, day: i < 150 ? 'd1' : 'd2' }));
  const kept = prune(many, 10, 50);
  assert.ok(kept.find((x) => x.id === '149')); // d1 best
  assert.ok(kept.find((x) => x.id === '299')); // d2 best and recent
  assert.ok(!kept.find((x) => x.id === '5'));
  assert.equal(kept.length, 10 + 50); // d1 top10 + last 50 (which include d2's top)
  const csv = toCsv([{ id: '1', name: '=1+1', score: 10, ts: 0, day: 'd', tier: 'Fog', stats: {} }]);
  assert.match(csv, /'=1\+1/);
});
