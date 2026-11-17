# SKYSHOT

A 60-second, mouse-only aim trial built for esports event booths. Category 3 (Event Mini Game) entry for the Cloud9 x JetBrains "Sky's The Limit" Hackathon 2026.

**Play:** https://mertbatis.github.io/skyshot/ · **Leaderboard screen:** https://mertbatis.github.io/skyshot/board.html

## The game
Three 20-second drills, each one a skill competitive players actually train:

| Drill | What you do | What it measures |
|---|---|---|
| **FLICK** | Click each target as fast as you can | Reaction + flick time (median ms) |
| **TRACK** | Hold the button and stay on a moving target that speeds up and shrinks | Time on target (%) |
| **DECIDE** | Hit the red diamonds, never the blue allies; enemies vanish after 1 s | Target discrimination under pressure |

Every run ends on a results screen with:
- the score, a tier (Fog → Stratus → Cumulus → Nimbus → Cirrus → Cloud Nine) and your percentile against today's runs;
- four stats: flick median, time on target, enemies hit, accuracy;
- one coaching tip chosen from your weakest area.

Players enter their initials with the mouse; a keyboard works too.

## Built for a booth
- **Mouse only, no tutorial.** Each drill shows a 2.6-second card with one sentence of instruction. The decide card also shows what an enemy and an ally look like. Red diamonds and blue circles with a shield differ in shape as well as colour.
- **Under 75 seconds per player**, from click to results.
- **Resets cleanly.**
  - If a player walks away mid-run (no mouse movement for 12 s), the game returns to the attract screen.
  - The results screen saves the run and resets after 30 s idle.
  - "Next player" resets at once.
- **Live local leaderboard on a second monitor.** `board.html` shows:
  - today's top 10 and all-time top 5;
  - the fastest flick of the day and the run count;
  - "now playing" status.

  It updates instantly through `BroadcastChannel`, with the `storage` event as a fallback. No server and no Wi-Fi needed.
- **Offline.** A service worker caches everything after the first load. Runs are stored in `localStorage` and pruned to each day's top 50 plus the last 2,000 runs.
- **Operator panel.** Open it with Ctrl+Shift+O or five quick clicks in the top-left corner. It has the event name, sound on/off, "open leaderboard screen", CSV export of all runs, and clear today / clear all (with confirmation).

## Run it
No build step: plain ES modules, canvas and WebAudio. Nothing is downloaded or licensed: every visual is drawn and every sound is synthesised.

```
node serve.mjs 4890          # http://127.0.0.1:4890/  (any static server works)
npm test                     # scoring + leaderboard unit tests
node test/bot.mjs            # a bot plays a full run in Chrome (CDP on 9334) and saves screenshots
```

## Code
- `src/score.js`: points curves, run summary, tiers and the coaching tip (pure, tested).
- `src/board.js`: ranking, ties, percentiles, daily boards, pruning and formula-safe CSV (pure, tested).
- `src/store.js`: localStorage plus BroadcastChannel sync.
- `src/game.js`: state machine, drills and canvas rendering.
- `src/audio.js`: WebAudio synth.

## JetBrains tools
Built in **WebStorm**. Code inspections and formatting ran through WebStorm's inspection profile, and the `.idea` project folder is committed. See [JETBRAINS.md](JETBRAINS.md).

## License
MIT
