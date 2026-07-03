# Task 326 — Fresh ink + writing sprints (session-aware writing) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Two riders on one diff engine — decide together.

## What it is & the effect

**Fresh ink:** a toggle that tints the words you wrote THIS session (or today) with a
subtle "wet ink" highlight that fades as text ages across sessions. After a two-hour
session you SEE what you produced and where you were; reopening a draft, today's ink shows
you instantly where you left off thinking.

**Sprint HUD:** start a 15-minute sprint from the status bar — a live words-per-minute
gauge paced against your own rolling average, quiet end summary; session ink doubles as
the sprint's visible output.

## Why novel

GitLens has line-age heatmaps for CODE; no prose editor colors words by when they were
written (Word's track-changes is per-author bureaucracy, not ambient age). Sprint timers
live in dedicated writing apps; no code-editor markdown surface has one.

## Feasibility on our assets

Mostly assembled: git-diff.ts + diff-lines.ts + diff-markers.ts SHIP the session-vs-HEAD
diff today (line-level v1 nearly free); word-level tint = data-render-safe spans;
multi-day fade = a small age journal in workspaceState. Sprint counters ride
reading-time's wordCount + the status-bar pipeline + 261's session-delta data.

## Honest value

Quiet, genuine daily value for daily-prose writers (word-war culture); low flash, high
retention. V1 in days. Distinct from 261 (goals) and the stats panel — this is IN-DOCUMENT
provenance shading + a live gauge.

## Decision

- [ ] **ADOPT** (natural bundle with 261)
- [ ] **PARK** — reason: _______
