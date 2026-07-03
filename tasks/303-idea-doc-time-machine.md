# Task 303 — Doc Time Machine: git scrubber over the RENDERED document [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative-audit proposal
(192 §13); NOT scheduled.

## What it is & the effect

A slider above the editor that scrubs through the file's git history — but instead of
red/green line soup you watch the fully RENDERED document (headings, tables, diagrams,
math) morph from revision to revision, changed blocks flash-highlighted at each step. To
see how a spec evolved you drag a slider and literally watch the pricing table gain a
column in May.

## Why novel

Nobody ships this. GitLens/Git History show source diffs; Notion/Confluence show static
text version compares. A WYSIWYG time-lapse with offline-rendered diagrams morphing across
history is only possible inside an IDE with a git API + a full offline render stack —
i.e., here.

## Feasibility on our assets

`repo.show(ref)` for blobs; `lute-host.ts` renders markdown WITHOUT the webview (or feed
revision text to the preview surface); the 184 diagram cache makes back-and-forth
scrubbing pure cache hits; `diff-lines.ts` computes changed-block highlights; the task-187
preview-morph work is the animation substrate.

## Honest value

THE conference-demo feature — wow off the charts. Daily value moderate: doc reviews,
onboarding onto a long-lived spec, "when did this requirement change". Wow-led,
value-backed. Consider adopting AFTER 301 proves the render-history plumbing.

## Decision

- [ ] **ADOPT** (sequenced after 301/302's shared plumbing)
- [ ] **PARK** — reason: _______
