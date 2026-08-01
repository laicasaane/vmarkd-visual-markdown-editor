# Task 417 — `main.js` is at 95% of its CI bundle-size budget (awareness, not a bug)

**Status:** ⚪ awareness/watch-item — no fix needed now · **Impact:** informational · **Origin:** Codex performance audit (2026-07-27), finding #8

## Problem

`media/dist/main.js` measures 406.7 KB against the `check:bundle-size` CI gate's 430 KB ceiling
(task 145) — only ~23 KB of headroom left. This is **not a regression or a bug**: the gate is
working as designed (it already blocked D2/ELK/mermaid-ELK from landing eagerly, task 165/112/104),
and bundle-splitting discipline is otherwise confirmed clean by both audits (every heavy engine
other than the already-code-split D2/ELK — mermaid, echarts, vega, wavedrom, leaflet, three.js,
plantuml, graphviz — loads via `loadScript()` injection, not a static import into `main.js`).

This task exists purely to record the observation so it isn't silently re-discovered later: the
budget is close to its ceiling, which constrains how much MORE can be added to `main.js` eagerly
before the next feature trips the gate or forces a code-split decision under time pressure.

## Scope

- [ ] No code change. If/when a future feature needs to add meaningfully to `main.js`'s eager
      bundle, check `npm run check:bundle-size` EARLY in that work (not after implementation) and
      budget for a code-split (mirroring the D2/ELK precedent) if it would breach the ceiling.
- [ ] Optionally: if the 430 KB ceiling itself was set with headroom assumptions that no longer
      hold (check task 145's original reasoning), consider whether the ceiling should be raised —
      but only as a deliberate decision with the same rigor task 145 used, not as a reflex fix
      when the gate next trips.

## Out of scope

- Any pre-emptive bundle-shrinking work — nothing is currently broken; don't manufacture a
  refactor to buy back headroom nobody's asked for yet.

## Verification

- N/A — this is a recorded observation, not a change. Close by acknowledging future feature work
  should check the gate early; no test to write.
