# Task 486 — repeated Enter below a callout/code-block at EOF snaps the caret back instead of descending

**Status:** ✅ DONE 2026-08-11 · **Impact:** 🟡 medium — user-reported, IR mode, any document ending in
a callout or code block (and possibly other shapes — list case still under investigation) ·
**Origin:** user report, 2026-08-01 ("jest błąd że jak zjadę enterami pod ostatnim akapitem to
karetka wraca do ostatniej linii z tekstem" — pressing Enter repeatedly below the last paragraph,
the caret returns to the last line that has text).

## Report

User presses Enter repeatedly to add blank lines below the last block of the document. Instead of
the caret descending one visual line per keypress, it snaps back — feels like it "returns to the
last line with text". Follow-up: "na koncu jak jest lista to tez to sie dzieje" (also happens when
the document ends in a list).

## Investigation

Reproduced deterministically in the `media-src/e2e/gap.html` harness (real Vditor IR + the exact
`observeGapParagraphs` / `observeTrailingParagraph` / `setupTrailingNav` wiring `main.ts` installs),
driving real keyboard `Enter` presses (not synthetic DOM mutation) via `playwright-cli`.

**Confirmed mechanism — document ending in a callout (also applies to a code block, same
`isGapNeighbour` check):**

1. Document ends `...<blockquote data-callout>...</blockquote><p data-vmarkd-trailing>​</p>` (the
   maintained trailing-paragraph invariant, `trailing-paragraph.ts`). Caret at the end of the
   trailing paragraph.
2. Enter #1: Chromium's native paragraph split does **not** copy the `data-vmarkd-trailing`
   attribute onto the new paragraph. Result: `<p data-vmarkd-trailing>​</p><p></p>` (caret in the
   new, untagged one).
3. `ensureTrailingParagraph` (rAF-debounced MutationObserver, `trailing-paragraph.ts`) runs:
   `lastContentChild` no longer finds an empty TRAILING-tagged paragraph as the "skip" case (the new
   paragraph isn't tagged), so it stops at the callout — no, actually at the *new* untagged `<p>`
   (it's not tagged+empty, not a helper, so the walk-back stops immediately) — so `lastContent` =
   the new paragraph. The *old* tagged paragraph now fails `p.previousElementSibling !== lastContent`
   and gets removed. Since the new `lastContent` is a plain `<p>` (`TEXT_BLOCKS`), `endsWithBlock`
   is false, so **no replacement trailing paragraph is created**. Net: paragraph count stays at 1,
   pinned immediately after the callout.
4. Enter #2 (caret currently in that plain `<p>`, sitting right after the callout): splits again
   into two plain `<p>`s. Once the caret leaves the first one (now sitting between the callout and
   the new empty `<p>`), `cleanupGapParagraphs` (`gap-paragraph.ts`) reclaims it: it's an empty gap
   paragraph, `prev` = the callout blockquote → `isGapNeighbour(prev)` is true → removed. This is
   the code path meant to reclaim Vditor's own *transient arrow-navigation* splices (task-driven,
   `gap-paragraph.ts` header) — it cannot currently tell that apart from a paragraph the user just
   **split via Enter** (deliberately adding a blank line), because both look identical: an empty
   `<p>` whose neighbour is a code-block/callout, no longer holding the caret.
5. Every further Enter repeats step 4: paragraph count never grows past 1, so the caret visually
   never descends past the line right after the callout/code-block — reads as "snapping back".

Confirmed with real keys + live DOM dumps after each press (`pCount` pinned at 1, `caretIdx`
matching the single surviving paragraph, across 4 presses).

**List case — NOT yet reproduced.** Built `- item one/two/three` then a trailing paragraph
(list-exit via Enter, then repeated Enter in the resulting paragraph) in the same harness, with
observer wiring verified live (`window.__el() === iv.ir.element` and `.isConnected`, both true
throughout). Paragraph count grew correctly on every keypress (2 → 3 → 4 → 5), caret tracked the
newest paragraph each time — did not reproduce. `isGapNeighbour` only matches
`data-type="code-block"` or a callout blockquote — `UL`/`OL` match neither, so `cleanupGapParagraphs`
is provably not involved for a list-ending document. The list report is either a **separate**
mechanism (not yet found) or needs conditions this isolated harness doesn't have (full `main.ts`
wiring — edit-sync / message-router). Asked the user whether the jump is instant on keypress or a
beat later (~⅓s) — instant points to a keydown/keyup handler or the native split; delayed points to
an rAF/MutationObserver path — to narrow this down. Not answered yet as of writing.

**Ruled out:** `caret-preserve.ts`'s `preserveCaretAndScroll` (host `update`-message round-trip).
Confirmed real latent defect on its own (`caretOffset()`/`resolveTextOffset()` are blind to
block-level boundaries — multiple empty trailing paragraphs are indistinguishable from each other
and from the end of the preceding real text, in both the offset-capture and offset-resolve halves),
but disqualified as the mechanism for *this* report: `vditor.getValue()` is byte-identical across
any number of trailing-blank-paragraph Enters (Lute's serializer collapses them to nothing), so
`message-router.ts`'s `vditor.getValue() !== msg.content` guard never opens purely from this
edit — `preserveCaretAndScroll` never runs. Worth its own task if it independently causes symptoms
(e.g. after a genuine external file change lands while blank trailing paragraphs are pending) — not
filed yet.

## Fix (shipped)

Two bugs, both in the same feature area, both needed:

1. **`cleanupGapParagraphs` (`gap-paragraph.ts`)** — added `gapChainReachesCaret(p, caretNode)`:
   walks forward through unbroken sibling `<p>` elements; if that walk reaches the caret, `p` is
   part of a deliberate blank-line chain the user is building via Enter, not a stale navigation
   splice, so it's kept. (First attempt keyed on "next sibling holds the caret" only — too narrow,
   only protected the immediately-preceding paragraph; the chain walk protects the whole run.)
2. **`ensureTrailingParagraph` (`trailing-paragraph.ts`)** — Chromium's native paragraph split does
   NOT copy `data-vmarkd-trailing` onto either half of a split trailing paragraph. Previously this
   made the OLD tagged half look "stale" (no longer immediately before the recomputed last-content)
   and it got deleted outright with no replacement (`endsWithBlock` is false for a plain `<p>`) —
   so the very FIRST Enter below a callout/code-block silently ate the new blank line. Fix: when
   the "stale" tagged paragraph's own next sibling is exactly the new last-content AND still empty,
   transfer the tag (`removeAttribute`/`setAttribute`) instead of deleting — the old half becomes a
   normal kept blank line, the new half becomes the trailing one.

Verified end-to-end (`gap-enter-chain.spec.ts`, real VS Code webview, real keyboard `Enter`): 4
consecutive presses below a callout now grow the paragraph count 2→3→4→5→6, one new line per
keypress, caret always in the new (trailing-tagged) paragraph. The same real-webview spec now also
covers the code-block-at-EOF variant (own fixture `gap-enter-chain-code.md`): the position "below"
the closing fence is Vditor's TRANSIENT `insertAfterBlock` splice, not a maintained trailing
paragraph (code blocks are excluded from `endsWithBlock`), so the test drives a real click on the
code block's preview layer (the render sits on top of the source; Vditor's own click handler
selects the source beneath), `End`, `ArrowDown`, then 4× `Enter` — one new paragraph per keypress,
caret never snapping back INTO the fence. Red-verified: with `gapChainReachesCaret` disabled the
new code-block test fails exactly on the task symptom (`Expected: 3, Received: 2` — the fresh
blank line reclaimed). All 10 pre-existing `gap.spec.ts` cases and `trailing.spec.ts` /
`callout-arrow-nav.spec.ts` still pass — the original transient-splice reclaim (arrowing past a gap
into unrelated content) is untouched, since that walk breaks on the first non-`<p>` or non-empty
sibling before reaching the caret.

## Checklist

- [x] Implement the `cleanupGapParagraphs` fix (`gapChainReachesCaret`)
- [x] Implement the `ensureTrailingParagraph` fix (tag transfer on same-tick split)
- [x] Unit tests: `gap-paragraph.test.ts` (chain survives / stale-gap-past-caret still reclaimed)
- [x] Verified existing `gap.spec.ts` (10/10), `trailing.spec.ts`, `callout-arrow-nav.spec.ts` still
      pass — no regression to the original transient-splice cleanup
- [x] Real-VS-Code e2e covering the callout-at-EOF repeated-Enter case (`gap-enter-chain.spec.ts`)
- [x] Code-block-at-EOF real-VS-Code e2e (`gap-enter-chain.spec.ts` code-block test +
      `fixtures/gap-enter-chain-code.md`; red-verified against the disabled fix — fails
      `Expected: 3, Received: 2` exactly on the task symptom). The whole spec is now in the
      real-VS-Code **FAST tier** (`test/vscode-e2e/playwright.config.ts`, same real-webview-only
      caret-regression rationale as `gap-cursor.spec.ts`) so the fix is guarded on every routine
      run, not just the full suite.
- [x] Resolve the list case — ROOT-CAUSED and fixed in
      [487](487-structural-caret-position-for-undo-restore.md). It was a SEPARATE mechanism, as
      suspected here: not `cleanupGapParagraphs` at all, but Vditor's undo checkpoint
      (`addToUndoStack` → `addCaret`, ~800 ms debounce) restoring the caret through a flat character
      offset that cannot address an empty block. This task's own `nextEmptyBlockSibling` heuristic in
      `resolveTextOffset` was the stop-gap; 487 replaced the representation itself
      (`{blockPath, offsetInBlock}`) and the heuristic now only serves `caret-preserve.ts`.
- [x] User verification: current implementation passes the focused real-VS-Code e2e
      (`gap-enter-chain.spec.ts`, 2/2) and the focused unit tests (33/33) on 2026-08-11.
