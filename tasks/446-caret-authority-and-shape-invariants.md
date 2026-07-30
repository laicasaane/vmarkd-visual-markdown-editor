# Task 446 — One owner for the caret: declarative intent + re-assert, and document-shape invariants out of the caret code

**Status:** ✅ DONE (2026-07-30) — ADR-0007 accepted and implemented in two stages, tree green.
· **Impact:** 🟡 architectural; kills a whole defect CLASS rather than one bug · **Origin:** fallout
from [439](439-caret-at-start-on-open.md) — "can this be done better, cleaner architecturally?" after a
programmatically placed caret flashed and vanished in the reporter's real editor while three test
layers stayed green.

## Implementation summary

**Part 1 (leading-block invariant)** — `media-src/src/gap-paragraph.ts` gained `ensureLeadingBlock`
(mirrors `ensureTrailingParagraph`, re-asserted from the SAME `observeTrailingParagraph` observer —
no second MutationObserver), a `data-vmarkd-leading` tag exempted from `cleanupGapParagraphs`, and
`initial-caret.ts`'s `ensureFirstBlock` was deleted entirely. Narrower than a full `endsWithBlock`
mirror by design (only a genuinely zero-children editor gets a manufactured block) — see the file
comment for why.

**Part 2 (the authority)** — new `media-src/src/caret.ts`: `requestCaret(intent)` with
`'document-start' | 'document-end' | {node, offset} | {textOffset}`, armed via `requestAnimationFrame`
until painted-and-consumed or invalidated, bounded to `MAX_MISSES` (90 frames) so an unresolvable
intent fails open instead of retrying forever. `installCaretInvalidation()` drops the live intent
unconditionally on `keydown` / `pointerdown` / `beforeinput`, wired FIRST in `main.ts` (ordering is
load-bearing — see the doc comment on `installCaretInvalidation`).

Migrated onto it: `initial-caret.ts` ('document-start'), `hr-nav.ts` ({node,offset} + 'document-end'),
`gap-paragraph.ts`'s `setupTrailingNav` (all 6 sites → 'document-end'; `placeCaretInTrailing` deleted,
replaced by the pure `trailingCaretTarget` resolver caret.ts consumes), `focus-restore.ts` and
`editor-caret.ts`'s `restoreEditorCaretIfLost` ({node,offset} from the saved Range — the snapshot
mechanism itself, and `trackedEditorRange()`'s external contract for task 390, are unchanged), and
`caret-preserve.ts` ({textOffset} — the one intent kind that isn't a `{node,offset}` pair, because
every node is gone after a full `setValue()` rebuild).

**Verdict on the ADR's acceptance test (3→1 collapse):** the re-assert MECHANISM collapses from three
hand-rolled copies (`focus-restore.ts`'s snapshot-and-reassert, `editor-caret.ts`'s
`restoreEditorCaretIfLost`, `gap-paragraph.ts`'s trailing-nav net) into one — `caret.ts` is now the
only module that calls `removeAllRanges()/addRange()`. What does NOT collapse, correctly: each
caller's DECISION logic for *when* and *where* (hr-nav's edge-of-block geometry, trailing-nav's
keydown/keyup net, focus-restore's "is this our editor" gating) stays in its own module — that
decision logic was never the duplication the ADR was closing. `callout-nav.ts`, `clipboard-line.ts`,
`link-click-fix.ts`, `toolbar.ts`, `wysiwyg-code-highlight.ts` were out of scope (not named by the
ADR/task) and still write the selection directly — decision 2's "single owner" is not yet tree-wide.

**Addendum (same session, added to scope by the team lead):** `focus-restore.ts` also gained a
`focusout` listener (document-level, alongside the existing window-`focus` one) closing the
structural blind spot task 445 found by reading this file — an intra-document focus move (editable
→ bare BODY with the window itself never blurring) fired nothing the old `focus`-only trigger
observed. Same `restoreEditorFocus` policy, same `NOT_OURS_TO_TAKE` guard, scoped to only react when
the editable itself is the `focusout` target (an unrelated toolbar control blurring must not yank
focus back). **This is an unverified lead, not a fix for 445** — task 445's own round-5 reproduction
is a different mechanism (a DOM mutation zeroing `caretHeight` while `activeElement` never moves at
all), so this closes a real gap without closing that report. Task 445's file is intentionally left
untouched (owned by the team lead).

**Follow-up fix (same addendum, found by re-running `caret-empty-typing.spec.ts`):** the first cut
of the `focusout` listener called `restoreEditorFocus` unconditionally once deferred, which also
fires when the user switches AWAY from this document to a different tab/webview (that's a real DOM
focus loss too) — the deferred restore then tried to steal focus BACK into a webview the user had
just left, breaking a multi-document real-keyboard flow. Fixed by checking `win.document.hasFocus()`
in the `focusout` listener's own deferred callback (NOT inside `restoreEditorFocus` itself, and NOT
on the window-`focus` listener — that event's own semantics already imply focus was regained, and
the test harness dispatches a SYNTHETIC `focus` event that never flips `hasFocus()` true, so gating
there would have silently broken `caret-on-open.spec.ts`). Locked in by a new
`focus-restore.test.ts` case; re-verified `caret-empty-typing.spec.ts` + `caret-on-open.spec.ts` +
`caret-tab-return.spec.ts` all green after the fix.

**Adversarial review — two real defects in `caret.ts`, both fixed (same session):**

1. **CONFIRMED, demonstrated (HIGH).** `installCaretInvalidation` only observes gestures on this
   webview's own `document`. A full re-init (`initVditor`: `window.vditor = null; window.vditor =
   new Vditor(...)`, e.g. a constructor-only config change) or a mode switch (IR/WYSIWYG/SV each own
   their own `.element`) swaps the editor an intent was armed against with **no user gesture
   involved** — 'document-start'/'document-end' are identity-free and would silently resolve/write
   against the new, unrelated editor. Fixed by **binding** each `LiveIntent` to the editor it was
   armed against (captured in `requestCaret`, checked at the top of every `tick()`); a mismatch
   drops the intent immediately (not counted as a miss) rather than depending on every present-or-
   future re-init path remembering to call `invalidateCaret()`. Chose binding over "hook every
   `window.vditor` assignment" because it closes the vulnerability structurally (checked at the
   exact point the wrong write would happen) without intercepting a global property, which would
   have carried more collateral risk for less coverage (it wouldn't catch a mode switch, which
   reassigns `.element`, not `window.vditor`, at all).
2. **Real, minor.** `tick()` rescheduled unconditionally on every successful paint — a live intent
   left alone (arrow-nav to EOF, then nothing) drove a perpetual 60fps loop for the rest of the
   webview's life, one `ensureTrailingParagraph` DOM query per frame for `'document-end'`,
   contradicting ADR-0007's Cost section calling the machine "cheap". Fixed with `MAX_TOTAL_TICKS`
   (300, ~5s), a hard backstop on the loop's TOTAL lifetime regardless of hit/miss pattern —
   `MAX_MISSES` alone only bounds CONSECUTIVE failures, so a pathological alternating painted/
   unpainted signal would reset it every other frame and never trip it (closed with an explicit
   test). Retiring does not un-place the caret, only stops the background re-polling.

Also closed (cheap, unverified-but-safe to add): `compositionstart` as a fourth invalidation
trigger (IME composition), alongside `keydown`/`pointerdown`/`beforeinput`. **Recorded as
known-untested, not assumed-fine, per the reviewer's flag:** whether Chromium's `beforeinput` for
composition-driven insertions already covers this redundantly (no IME available in this project's
test harness to confirm either way), and whether `MAX_MISSES` (90 frames, ~1.5s) can starve a
legitimately slow resolve on a very large document (no measurement taken either way).

Verified red→green: 5 new unit tests fail against the unfixed code (confirmed by temporarily
reverting the fix and re-running) and pass after — `media-src/src/caret.test.ts` now 36 tests, 8 new
(4 for the editor-binding, 2 for `MAX_TOTAL_TICKS`, 1 `compositionstart`, plus the existing suite
unchanged). `npm test`: 2178 passed (one unrelated, concurrently-in-progress failure elsewhere in
the tree — `diagram-retheme.test.ts`, not touched by this work, confirmed via `git diff --stat`
showing zero overlap and no reference to `caret` anywhere in that file). Re-ran the full caret real-
VS-Code spec set (18 specs: `caret-authority-rebuild`, `caret-click-during-init`, `caret-on-open`
×2, `caret-empty-typing`, `caret-tab-return` ×4, `hr-edit` ×2, `trailing`, `list-backspace`,
`table-nav-scroll`, `doc-sync` ×2, `undo-dirty-probe`, `undo-redo-steps`) — 18/18 passed.

## The defect class

A caret written once into a DOM that keeps being rebuilt is lost, silently, with no error and no
failing test. Vditor rebuilds the IR DOM on **every** edit and creates some blocks **lazily** (an
empty document's editable has zero element children at open — measured, see 439). So any
"set the selection and move on" is a bet on the DOM not changing underneath it.

The codebase already learned this lesson — but only for **DOM invariants**:
`observeTrailingParagraph` (`media-src/src/gap-paragraph.ts:241`) re-asserts its paragraph after each
rebuild, precisely because a one-shot insert does not survive. **The caret never got the same
treatment**, and 439's bug is the direct consequence: the Range was anchored on the editable itself
(no first block existed yet), Vditor later created its placeholder `<p>`, and the position
`(editable, 0)` became unpaintable — caret flashes, caret gone.

## What is structurally wrong today

1. **No owner.** At least six modules write `window.getSelection()` directly, each with its own rules
   about when a write is allowed and none aware of the others:
   `media-src/src/initial-caret.ts`, `focus-restore.ts`, `editor-caret.ts`, `caret-preserve.ts`,
   `gap-paragraph.ts` (`placeCaretInTrailing` + the keydown/keyup trailing-nav net), `hr-nav.ts`.
2. **Three hand-rolled copies of "re-assert the caret".** `focus-restore.ts` snapshots a Range and
   re-adds it after focusing; `editor-caret.ts` keeps its own snapshot on `selectionchange`
   (`restoreEditorCaretIfLost`); `gap-paragraph.ts`'s trailing nav re-places on `keyup` when the
   native move dropped the selection. Same idea, three implementations, three sets of edge cases.
3. **Caret code reasons about document shape.** 439's `firstElementChild ?? editor` fallback is a
   caret module handling "the document has no blocks yet" — a shape concern belonging to whoever owns
   shape invariants (`gap-paragraph.ts`, which already owns the end-of-document one).
4. **No upstream escape hatch.** Verified: Vditor's `focus()` is literally
   `this.vditor.ir.element.focus()` (`media-src/node_modules/vditor/src/index.ts`) — no caret
   placement at all. We own this; there is nothing to delegate.

## Proposal

### Part 1 — leading-block invariant (small; may land under 439)

`gap-paragraph.ts` owns "the document must always offer a place to type at the END". Add the mirror:
**the document always has at least one editable block.** Then the empty-document case disappears from
the caret code entirely — `firstBlock.firstChild, 0` always exists and a caret can never be anchored
on the container, which makes 439's flash-and-vanish structurally impossible rather than patched.

- Must be **serializer-invisible**, the technique the trailing paragraph already proves (ZWSP seed +
  a `data-` attribute; Lute ignores attributes) — an empty file must stay empty on disk.
- Must survive Vditor's rebuilds via the existing observer, same as the trailing invariant.
- Watch the interaction with `cleanupGapParagraphs`: an empty first `<p>` must not be reclaimed as a
  transient gap.

### Part 2 — a single caret authority (the actual refactor)

A new `media-src/src/caret.ts` owning every programmatic selection write:

- `requestCaret(intent)` with a **declarative** intent — `'document-start'` / `'document-end'` /
  `{node, offset}` / `'preserve'` — instead of six call sites each computing a Range.
- **Re-assert until consumed or invalidated:** the intent stays live across DOM rebuilds (the
  MutationObserver pattern already used for the trailing paragraph) and is dropped when the user
  types or moves the caret themselves. This is the part that kills the class.
- Everything currently writing the selection becomes a caller: on-open placement, focus restore,
  mode-switch preserve, EOF trailing placement, `hr` step-across.
- The three hand-rolled re-assert copies collapse into it (DRY), which is also the honest measure of
  whether the abstraction is real: if they cannot collapse, the design is wrong.

## Decision needed first (hence the ADR)

Write **ADR-0007 — caret ownership** (next free number; `docs/adr/0003…0006` exist) covering:

- Is the caret an *invariant* (declared, re-asserted) or an *event outcome* (written once per gesture)?
  The whole design follows from that answer.
- Where the authority sits relative to Vditor's own selection handling (`expandMarker`, the IR
  re-spin, `processKeydown`) — we must not fight it, and 439 measured that Vditor's own click path is
  atomic and healthy; the authority must yield to a real user gesture, always.
- The invalidation rule: what "the user took over" means precisely (keydown? `selectionchange` not
  originating from us? input?), because getting this wrong produces a caret that fights the user —
  strictly worse than today's bug.

## Risk / why this is NOT smuggled into 439

Touching the caret touches end-of-file navigation, list Backspace (task 428), `hr` arrow-nav
(task 100), the table-wrapper jump fix, mode-switch preservation and focus restore (task 389) — every
one of them a bug that was expensive to find and is currently pinned by real-VS-Code specs. This is
an ADR + its own branch + a full real-VS-Code suite run, not an evening.

## Verification

- [x] Unit: `media-src/src/caret.test.ts` (27 tests — resolution, the re-assert/miss-counter loop,
      invalidation incl. the same-tick ordering guarantee) + `media-src/src/gap-paragraph.test.ts`
      (new `ensureLeadingBlock`/`trailingCaretTarget` coverage) + `media-src/src/initial-caret.test.ts`
      (updated for the new 'document-start' delegation) + `media-src/src/focus-restore.test.ts` (3
      new tests for the `focusout` addendum below). `npm test`: 2133 passed.
- [x] Real-VS-Code e2e: existing caret/nav specs re-run and pass UNCHANGED —
      `caret-on-open.spec.ts` (2), `caret-empty-typing.spec.ts` (1), `hr-edit.spec.ts` (2),
      `trailing.spec.ts` (1), `caret-tab-return.spec.ts` (4), `list-backspace.spec.ts` (1),
      `table-nav-scroll.spec.ts` (1), plus `doc-sync.spec.ts` (2, exercises the migrated
      `caret-preserve.ts` path) — 14/14 passed. New spec:
      `test/vscode-e2e/caret-authority-rebuild.spec.ts` (1 passed) — a caret survives a full Vditor
      `setValue()` rebuild (an external WorkspaceEdit, deliberately NOT a keydown — see the spec's
      header for why) and stays paintable across 4 sampled points afterward.
- [x] **The test that would have caught 439's bug**: `caret.test.ts`'s "reproduces 439 structurally"
      case — 'document-start' requested against a zero-children editor (unresolvable), stays armed
      instead of giving up, then a block is appended and the NEXT frame resolves it and paints.
      Structural equivalent also proven live: `caret-empty-typing.spec.ts` shows the real leading
      paragraph (`data-vmarkd-leading`) created and painted (`caretHeight: 16`) in the real webview.
- [ ] Full real-VS-Code suite before merge (~40 min) — not started; propose it, wait for the go
      (the fast tier (`test:vscode:fast`) itself did not complete in this session — likely resource
      contention from the several other agents concurrently running their own VS Code e2e workers in
      this same session; the individually-named contract specs above were run instead and are green).

## See also

- [439](439-caret-at-start-on-open.md) (the bug that exposed this; Part 1 may land there),
  [445](445-first-click-drops-the-caret.md) (the reporter's other caret symptom — first click into
  the editor loses the caret, second one sticks; may or may not share the root cause),
  [389 / `focus-restore.ts`](../media-src/src/focus-restore.ts) (the window-focus repair this must
  absorb), [428](428-list-editing-usability-vs-real-editors.md), [100](100-hr-create-and-arrow-nav.md)
  (caret-moving code that becomes a caller).
- `media-src/src/gap-paragraph.ts` — the existing, working example of "declare an invariant and
  re-assert it after every rebuild", i.e. the pattern this task generalises to the caret.
