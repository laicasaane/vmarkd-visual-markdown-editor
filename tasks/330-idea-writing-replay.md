# Task 330 — Writing replay: time-lapse of your draft [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Honest rating: peak demo-wow, modest daily value.

## What it is & the effect

Watch your document write itself: a scrubber replays the session (or the file's whole
history) as an animated time-lapse in the RENDERED view — paragraphs appearing, dying,
moving. Scrub to any moment, see the draft as it was, and jump the editor back to recover
a lost phrasing — undo-beyond-undo.

## Why novel

Draftback did this for Google Docs and people share the videos to this day; no markdown
editor or VS Code extension records and replays prose evolution. The
recover-from-any-frame twist turns the toy into a tool.

## Feasibility on our assets

The host already sees every content sync (writeback-controller pipeline); journaling
block-level deltas (diff-lines + splitBlocks) into globalStorage is compact; replay
renders frames per-changed-block through lute-host. The one real cost: a storage
cap/compaction policy. Ship as OPT-IN recording.

## Honest value

Highest demo-wow of the writer lens; daily value honestly modest (phrase recovery,
teaching, process nerds). A great "launch video" feature if 310/311/312 ship as a writer
release.

## Decision

- [ ] **ADOPT** (opt-in, bundled with the writer suite)
- [ ] **PARK** — reason: _______
