# Task 328 — Read-aloud proofing with follow-highlight [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

The editor reads your document aloud while softly highlighting the sentence being spoken —
you HEAR the clunky rhythm and doubled words your eyes skip (a classic professional
proofing technique with no home in the markdown world). Click any paragraph to start
there; the caret follows the voice, so you stop and fix instantly — hear-it-fix-it.

## Why novel

Read-aloud exists (Word, Edge Immersive Reader) but no markdown editor has it, and none
anywhere binds the follow-highlight to the EDITABLE surface via a source map, making the
voice position a caret position.

## Feasibility on our assets — with an honest caveat

`window.speechSynthesis` exists in the Electron webview with native voices on
Windows/macOS (genuinely zero deps); **on Linux voices are frequently EMPTY unless
speech-dispatcher is installed** — ship with a runtime probe and a clear fallback message,
not a promise. Sentence→block highlight rides source-map; highlight spans use the
data-render pattern; per-block chunking dodges speechSynthesis's known long-utterance
bugs (its pause/resume is also flaky — engineer honestly).

## Honest value

Real proofing value + an accessibility win; medium wow. The platform caveats mean honest
engineering, not a weekend hack.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
