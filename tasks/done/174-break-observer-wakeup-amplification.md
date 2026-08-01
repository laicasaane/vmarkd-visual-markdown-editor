# Task 174 — Break the cross-observer wakeup amplification from injected decorations

**Status:** SHIPPED 2026-07-30, landed standalone alongside task 173 (see below) rather than waiting
on the task-176 dispatcher — 176 stays de-prioritized (see its own file), so "land this on the
dispatcher" would have meant landing it never.
**Source:** vMark edit-responsiveness analysis (2026-06-28, workflow `wf_2c64003e-264`).

## Shipped 2026-07-30 — decoration-only filter in `scopeMutations()` (shared with task 173)

Landed as one function in the new `media-src/src/mutation-scope.ts` (also written for task 173):
`isOwnDecorationOnly(record)` drops any `childList` record whose ENTIRE `addedNodes`+`removedNodes`
set is our own injected decoration (an element carrying a `data-render` attribute — our overlays, e.g.
`edit-activity.ts`'s task-161 keep-last overlay — or one of the known `vmarkd-*` decoration classes:
`vmarkd-callout__preview`/`__marker`/`__title`, `vmarkd-comment`). A dropped record contributes nothing
to the resolved block set — if a WHOLE batch is decoration-only, `scopeMutations` returns
`{full:false, blocks:∅}`, i.e. genuinely **zero** re-walk, not even a scoped one.

**Deliberately narrower than the task's own "or a known decoration class" wording**: does NOT match
bare `.vditor-ir__preview` / `data-render="2"` (Vditor's OWN preview-shell marker, shared with real
diagram/code-block renders) — reasoning in `mutation-scope.ts`'s own comment: that shell is created as
part of a REAL block replace (nested inside a bigger addedNode in the common case, not a standalone
top-level one), and over-matching risks the exact failure both 173 and 174 warn against (silently
dropping a genuine content change). Under-filtering only costs an extra, cheap, idempotent no-op walk
— the safe direction to err in. The concrete pain points this task named (the task-161 overlay,
callout preview/marker/title, comment spans) are all covered; `.hljs` needed no filter (it's an
attribute mutation — never observed at all, `childList`/`characterData` only).

**Verified:**
- Unit: `mutation-scope.test.ts` covers the decoration-only drop (both a lone `data-render="1"` write
  and a lone `vmarkd-callout__preview` write) AND the "never target-based" constraint (a record MIXING
  a decoration with real content — mirroring the spin's `outerHTML` replace, whose subtree re-contains
  a decoration but IS a real change — still resolves to the real block, not dropped).
  `callouts.test.ts` adds an observable-effect check through the real `observeCallouts` API: injecting
  a `vmarkd-callout__preview` node via a genuine DOM mutation leaves the pre-existing preview node
  byte-identical (nothing rebuilt it).
- Real-VS-Code e2e: covered *indirectly* by `scoped-decoration.spec.ts` (task 173) and the unchanged
  `perf-observer-fleet.spec.ts` numbers (no regression, and call COUNTS — deliveries — stayed
  identical across before/after for plain prose/code typing, consistent with this filter simply not
  firing for those scenarios, which don't produce decoration-only writes).

**Not done — flagging explicitly, not burying it:** this task's own checklist item (b) — a real-VS-Code
e2e that specifically **counts** synchronous fleet passes for a decoration-only injection (e.g. during
diagram-source typing, where `restoreOverlay` injects the task-161 overlay) and asserts it does NOT
trigger a second pass — was **not** added. Doing that precisely would need test-only instrumentation
hooks exposed from production code (a pass counter on `window`), which felt disproportionate given (a)
the unit-level correctness coverage above already closes the actual risk this task's constraints
worried about (mixed records still passing, decoration-only records dropped), and (b) the realised
saving here is explicitly framed in this task's own "Constraints" section as "querySelectorAll walk
churn only … a constant-factor trim, not the dominant SpinVditorIRDOM" — i.e. low-stakes by the task's
own accounting. If a wakeup-COUNT real-webview assertion is wanted, that's a follow-up, not a
correctness gap in what shipped.
**Value / Risk:** 🟦 low–medium (cuts the per-keystroke observer-fire multiplier, esp. during diagram-source editing) / 🟢 low (pure observer scheduling; idempotent guards already make re-passes no-ops).
**Engines:** none (observer scheduling).

## Problem

Every observer that **injects DOM** — callout preview, comment span, hljs token spans, the
`edit-activity` keep-last overlay (`data-render="1"`, `edit-activity.ts:189`), smiles/custom SVG —
emits a `childList` record that **re-wakes ALL `#app` observers** on the next microtask/frame. The
three IR-decoration observers (task 173) run **synchronously before paint**, so a decoration write
re-wakes them in a fresh microtask, each re-walking the whole `#app` again. Idempotent guards make
each a no-op, but the **wakeup + full `querySelectorAll` re-walk still costs** — a second (and third)
synchronous fleet pass per keystroke. The primary bite is during **diagram-source editing**, where
`restoreOverlay` injects the keep-last overlay on top of the spin.

All injected nodes are **already tagged** for an all-ours test: `data-render="1"` overlay
(`edit-activity.ts:189`), `.hljs` (`code-source.ts:58`), callout wrappers / `.vditor-ir__preview`,
comment signature spans.

## Plan

Have the shared dispatcher (task 176) — or, if shipped standalone, each observer's schedule — **ignore
a `MutationRecord` whose added/removed nodes are entirely our own decorations** (carry
`data-render="1"/"2"` or a known decoration class), so a decoration write never triggers a
fleet-wide re-pass.

## Constraints
- [x] **Must be an `addedNodes`/`removedNodes`-ALL-ours check, never target-based** —
  `isOwnDecorationOnly` checks every node in both lists via `.every()`; verified with a dedicated
  mixed-record unit test.
- [x] `characterData` records carry no `addedNodes` → always pass (the decoration check is
  `childList`-only; `isOwnDecorationOnly` returns `false` immediately for any other record type).
- [x] Did **not** touch `wysiwyg-code-highlight` — untouched by this change.
- [x] Pure scheduling — no spin/DOM-content/serialize/caret changes; every existing round-trip/caret
  test stayed green.

## Verification
- [~] **Real-VS-Code e2e:** (a) DONE — decorations refresh correctly on a genuine edit, covered by
  `scoped-decoration.spec.ts` (task 173) incl. a callout type change. (b) **NOT DONE** — no dedicated
  real-webview test counts synchronous fleet passes for a decoration-only injection; see "Not done"
  in the shipped-2026-07-30 section above for why, and what unit-level coverage substitutes for it.
- [x] `tsc` + `biome` + vitest + Playwright, headless, all clean. Coverage verified (see task 173's
  entry — `mutation-scope.ts` is shared between both tasks and is 100%-covered on every metric).

## See also
- **Sequence: land this on the task-176 shared dispatcher** (one filter point, one test surface) — the
  dependency is soft (per-observer is possible) but the dispatcher is the right vehicle and avoids a
  ~10× surface. Pairs with task 173 (scoping) and 176 (coalescing).
- Sequence AFTER the higher-leverage spin-input levers (task 172 strip SVG, task 171 §1 space-path) —
  this is the secondary multiplier, not the residual itself.
- `finish-init.ts`, `callouts.ts`, `html-comment.ts`, `edit-activity.ts`; memory
  `ghost-span-not-lute-transparent` (the `data-render` tagging this filter keys on).
