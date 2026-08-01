# Task 462 — Move `list-backspace.ts` into a `fixList` source patch (and resolve the guard overlap)

**Status:** ✅ DONE (2026-07-31) — the guard-overlap question is answered (see below);
`patchFixListOutdent` is applied to `media-src/esbuild-shared.mjs` and chained into the
`fixBrowserBehavior.ts` registry entry; `list-backspace.ts` is rewritten to the seam-based module;
`node build.mjs`, `tsc --noEmit`, `npm test` and the full chromium harness (419 tests) are all green.

**The real-VS-Code confirmation ran and is green** (team lead, 2026-07-31):
`test/vscode-e2e/list-tight.spec.ts` **4/4** with `--retries=0` — outdent-not-merge in IR 12.3s and
in WYSIWYG 13.1s, loose-list-safety 11.0s, two-paragraph paste 11.1s — plus `media-src/e2e/list.spec.ts`
**8/8**.

**Correcting this file's earlier "blocked on the PAIRED run" claim, which [task 465](465-adr-0004-doctrine-gaps.md)
flagged as contradicting [461](461-list-tight-observer-retire.md). 461 is right and this file was
wrong.** The pair was meant to prove the spec does not pass merely *because* `list-tight.ts`'s
observer was still watching. Green **without** the observer proves exactly that; the
"observer still wired" leg is the uninformative half. The run above was made with the observer
already removed, so it IS the discriminating leg, and nothing further is owed. ADR-0004's 2026-07-31
amendment generalises this into a retirement rule: *a green test is not evidence a decorator is
load-bearing — the discriminating run is green with the decorator gone.*

**Impact:** 🟡 removes a capture-phase interceptor; the "one open behavioural question" below is now
closed · **Origin:** patch-vs-runtime audit 2026-07-30. **Related:** task 428 (`08599f7`, shipped the
module), [461](461-list-tight-observer-retire.md) (the other half of the same collision, retired),
[465](465-adr-0004-doctrine-gaps.md), ADR-0004.

## Guard-overlap question — ANSWERED (2026-07-31), measured not inferred

**No, `fixList:474-489` does NOT already handle a nested first item cleanly — it is the SOURCE of
task 391's original corruption, not a working case being needlessly overridden.**

Probed directly: pressed Backspace on a nested first item against completely UNMODIFIED Vditor (no
`list-backspace.ts` involved at all — `media-src/e2e/list.spec.ts`, "stock Vditor fixList — nested
first item Backspace" test, using the exact same list shape task 391 measured the bug against:
`1. Analysis of email threads` / `   * first entry` / `   * second entry`). Result — the resulting DOM
is byte-for-byte `list-tight.test.ts`'s `CORRUPTED` fixture:
`<li>Analysis of email threads<p data-block="0">first entry</p><ul data-tight="true">…second
entry…</ul></li>`. `fixList:474`'s condition is gated only on `!liElement.previousElementSibling`, not
on top-level-ness, so it fires for a nested first item too — and its
`liElement.parentElement.insertAdjacentHTML("beforebegin", …)` call (where `parentElement` is the
NESTED `<ul>`) inserts the lifted content as a stray `<p>` sibling inside the PARENT `<li>`, ahead of
the remaining sublist. That is exactly the "list still says `data-tight="true"` while one item is
block-wrapped" contradiction task 391 fixed — not a clean promotion.

**Consequence for the patch's shape:** `list-backspace.ts:111`'s guard
(`!li.previousElementSibling && !parentLi`) — which does NOT skip a nested first item — was already
correct and must be PRESERVED, not narrowed to "non-first item with text" as this file's "Why this
exists" section (below) originally framed the missing branch. The patch therefore does two things,
not one: (1) adds the missing "non-first item with text" branch (task 428's originally-described gap)
AND (2) gates `fixList:474` itself to top-level-only, so nested items — first included — route to
`list-backspace.ts` instead of Vditor's own corrupting branch. Doing only (1) and deleting the
capture-phase interceptor without (2) would silently REINTRODUCE task 391's bug in the same change
that retires task 461's repair for it — caught before implementation via a second opinion (advisor),
not discovered by testing after the fact.

## Why this exists

`list-backspace.ts` is a **capture-phase `document` listener** whose whole job is to stop Vditor's own
handler from running:

> *"We intercept exactly that unhandled case in a document CAPTURE-phase listener — Vditor binds its
> keydown on the editor element (bubble), so stopping propagation in capture keeps its merge from
> running."*

The wrong behaviour lives in `util/fixBrowserBehavior.ts` → `fixList` (line 456), whose Backspace
branches are at **474** (first item → paragraph) and **492** (empty item → align to previous). A
non-first item **with text** falls through to the browser default, which merges.

**That file is already in `VDITOR_TS_PATCHES` with four chained transforms** — `patchListToggle`,
`patchCalloutArrowNav`, `patchPasteTransform`, `patchPasteUrlAsLink`. We own the file and fight it
from outside anyway.

## Why this is a maintenance argument, not an aesthetic one

ADR-0004's own rule, transposed from CSS to behaviour: *an override leaves Vditor's wrong branch in
place **plus** a workaround to maintain.* The failure modes are asymmetric:

- **Patch:** a Vditor bump that moves the branch → the anchor assert **fails the build loudly**.
- **Capture-phase interceptor:** a Vditor bump that changes the branch conditions → the interceptor
  **silently** stops matching, or worse keeps blocking a branch Vditor has since fixed.

## ⚠️ Resolve this FIRST — it may change the shape of the fix

`list-backspace.ts:111` reads `if (!li.previousElementSibling && !parentLi) return` — so a **nested
first item** (no previous sibling, but has a `parentLi`) is *not* returned early and gets our
`listOutdent` treatment. But `fixList:474-489`'s existing branch is gated only on
`!previousElementSibling`, **not** on top-level-ness — it looks like it already handles that case by
inserting/replacing around the list rather than merging.

Either the task-428 probe measured a real discrepancy with that source read, or we are silently
overriding a Vditor branch that already worked. **This is a live behavioural question about code that
shipped 2026-07-30, and it is worth answering independently of whether the patch conversion happens.**

**RESOLVED 2026-07-31 — see "Guard-overlap question" above.** The task-428 probe measured a real
discrepancy: `fixList:474-489` does NOT already handle the nested-first-item case; it produces task
391's original corruption. `list-backspace.ts`'s broader guard is correct and load-bearing.

- [x] Probe nested-first-item Backspace with our interceptor disabled — done in the chromium harness
      (not the real webview; see task 461's "What was NOT run" for why, and why the harness is
      faithful for this specific pure-DOM-logic question). Record what Vditor alone does — recorded:
      reproduces `list-tight.test.ts`'s `CORRUPTED` fixture exactly.
- [x] Write the finding into task 428 as a one-line note either way — done (task 428, "Correction
      (2026-07-31, task 462's guard-overlap question)").

## Steps

- [x] Resolve the guard overlap above.
- [x] Write `patchFixListOutdent` (anchor-asserted, per ADR-0004) adding the missing branch to
      `fixList`, chained into the existing `fixBrowserBehavior.ts` registry entry. APPLIED (2 anchors:
      gate `:474` to top-level-only, insert a new Backspace branch before the Tab branch), via targeted
      `Edit` calls (never `Write`, per team-lead — the file has hunks from other agents this session).
      `node build.mjs` succeeds (anchor asserts didn't throw — no drift, no collision with the other
      agents' unrelated hunks). Also added the ADR-0004 red-proof as a unit test
      (`test/backend/vditor-source-patches.test.ts`): pre-patch anchor confirmed present in the
      shipped source, patched output confirmed correct, throws on unrelated source.
- [x] Consider the **seam pattern** instead of inlining logic — used it:
      `window.__vmarkdListBackspaceOutdent`, set by `list-backspace.ts`'s (renamed-in-place)
      `installListBackspace()`, matching the other ~20 `window.__vmarkd*` hooks. The implementation
      (`outdentOrLiftListItemOnBackspace` + the pure decision helper `backspaceOutdentTarget`) stays
      in `list-backspace.ts`, now unit-tested (`list-backspace.test.ts`, 9 cases — the decision logic
      only; the DOM-mutating half needs a working Lute/IVditor and is covered by the harness + e2e
      instead, see that test file's header for why).
- [x] Delete the capture-phase listener once the patch covers it — done in `list-backspace.ts`
      (rewritten; `document.addEventListener` is gone). `installListBackspace()`'s NAME, SIGNATURE,
      and disposer CONTRACT are unchanged on purpose, so `finish-init.ts` (on this session's
      do-not-touch list) needs zero edits for this half of the change.
- [ ] Keep task 428's unit + e2e coverage green; it is the regression net for the behaviour.
      `list-backspace.spec.ts`'s assertions are UNCHANGED (still valid post-patch — verified via the
      harness, same mechanism); `list-tight.spec.ts` rewritten (see task 461). Real-VS-Code confirmation
      pending — handed to the team lead (see task 461's "What was NOT run"), running as a PAIR
      (patch-in/observer-wired baseline, then observer removed, re-run) per team-lead's protocol.

## Verification

`node build.mjs` — green, anchor asserts didn't throw (confirmed against the real, currently-checked-out
Vditor source; the version-drift throw itself is exercised by the unit test above, not by corrupting
the live source file). `npm test` — green (2387 tests, incl. the 9 `list-backspace.test.ts` cases + the
3 new `patchFixListOutdent` cases). `tsc --noEmit` — clean. Full chromium harness (419 tests) — green,
including as a blast-radius check on `fixBrowserBehavior.ts` (bundled by many other harnesses, not
just `list.html`); 8 unrelated pre-existing failures elsewhere in the suite, none touching list/Backspace
code. The task-428 real-VS-Code spec green with the
interceptor removed — pending, handed to the team lead.
