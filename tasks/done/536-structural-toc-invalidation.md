# Task 536 — Refresh ToC only for structural heading impact

**Status:** ✅ complete · **Impact:** 🟡 medium-high on heading-rich documents ·
**Origin:** Task 534 source-map attribution · **Depends on:** Task 535

## Goal

Skip Vditor's document-wide `renderToc`/`outlineRender` spin when an edit cannot change headings,
heading indices, or an embedded ToC block. Preserve exactly one coalesced refresh for edits that can.

## Confirmed problem

Task 171 improved the original path by deferring `renderToc(vditor)` from every keystroke to one
edit-settle callback in `media-src/src/editing/edit-activity.ts`. That removed N duplicate spins but
still runs one global heading pass after every burst.

Source-map attribution on the private 129-heading document resolved the extra settle work as:

`edit-activity.ts deferUntilSettle('renderToc')` → Vditor `renderToc()` → `outline.render()` →
`outlineRender()` → `SpinVditorIRDOM()`.

Each ordinary insertion/Backspace journey added one approximately 42 KB spin costing about 24–46 ms.
The edited content was not a heading and did not change top-level block order, so the result could
not change.

## Product contract

| Edit impact | ToC action |
|---|---|
| text insertion/deletion inside an existing non-heading block | none |
| inline formatting inside a non-heading block | none |
| heading text/level add/edit/remove | one coalesced refresh |
| embedded ToC block add/remove or settings affecting it | one refresh |
| top-level split/merge/insert/delete/reorder before headings | one refresh |
| paste/cut/undo/redo/mode switch/external replacement with ambiguous impact | one refresh |
| document with no outline/ToC consumer and no heading-id requirement | no work unless Vditor needs IDs for another proven consumer |

Vditor heading IDs include the global top-level block index. A non-heading structural insertion
before a heading can therefore require a refresh even when heading text is unchanged. The gate must
track structure, not only “did the edited block contain `<h1>`”.

## Architecture

Consume Task 535's mutation impact and maintain a small ToC/heading revision authority. A revision is
invalidated when:

- a changed block is/contains a heading or ToC block;
- top-level block order/count changes;
- current mode/surface identity changes;
- outline/ToC render-affecting configuration changes; or
- impact is ambiguous/full.

The existing `__vmdeDeferRenderToc` hook stays the coalescing boundary, but it schedules only when the
revision is invalid. “No invalidation” means no timer/callback and no Lute call. After a successful
refresh, commit the current revision. Repeated invalidations in one burst still produce one refresh.

If mutation impact arrives after Vditor's patched `ir/input.ts` asks to defer ToC, the hook may mark a
pending request and decide at settle from the final impact. Do not serialize Markdown or scan the
whole surface merely to decide freshness.

## Error and fallback behavior

- Detached or replaced surfaces discard pending identity and refresh the new surface once.
- Unknown input/mutation shapes refresh once; they do not silently retain stale heading IDs.
- A failed `renderToc` leaves the revision invalid and reports through the existing webview error
  path; the next valid trigger may retry.
- IME composition defers the decision until committed impact, matching existing composition guards.

## Test-first acceptance

### Unit/source patch

- Pure invalidation matrix for ordinary text, heading text/level, ToC, top-level count/order,
  mode/config/external replacement, composition, repeated burst changes, failure, and disposal.
- Anchor-drift coverage for any `ir/input.ts` patch change; missing/duplicate anchors fail build tests.
- Prove N ordinary non-heading inputs request/execute zero ToC refreshes and N heading-affecting inputs
  execute one at settle.

### Chromium

With real Vditor:

- insert/delete ordinary list/table/inline-code text and assert zero `outlineRender` /
  `SpinVditorIRDOM` ToC calls;
- edit/promote/demote/remove a heading and assert updated embedded/native outline labels/targets after
  one refresh;
- split/merge/insert a non-heading block before headings and assert the global heading IDs/targets
  remain correct; and
- cover undo/redo, paste, mode switch, IME, no-outline/no-ToC, focus/scroll, exact Markdown, and
  disposal.

### Real VS Code

One focused single-boot spec on a generated >2,000-line heading-rich mixed document:

1. run ordinary insertion and eight Backspaces in non-heading list/table/inline content — zero ToC
   spins;
2. edit one heading and insert/delete one block before later headings — one refresh per burst and
   correct outline navigation;
3. switch IR ↔ WYSIWYG, enter and exit full Preview, then undo/redo, save/reopen, and prove exact
   bytes/targets.

The local private-file comparison must show the approximately 42 KB settle spin is absent from
ordinary text journeys while its hash remains unchanged. Durable fixtures stay generic/sanitized.

Run focused coverage, Chromium, no-retry real VS Code, typechecks, build/budgets, and final quality
per current `DEVELOPMENT.md`.

## Out of scope

- Rewriting Vditor's outline UI, section viewport highlighting, folding, or host Markdown Outline.
- Mutation-local helper work (Task 535), serialization admission (Task 537), or host writeback
  (Task 538).
- Changing heading slug/index semantics or introducing a persistent Markdown AST.

## Completion checklist

- [x] Ordinary non-heading text bursts run zero ToC/outline spins.
- [x] Heading/ToC/structural/ambiguous impact runs exactly one coalesced refresh.
- [x] Heading IDs, embedded ToC, native outline, navigation, modes, undo, and bytes remain correct.
- [x] Local private measurement removes the documented settle spin without source changes.
- [x] Unit/patch, Chromium, coverage, focused real-VS-Code, and final gates pass.

## Completion evidence

- `media-src/src/editing/toc-invalidation.ts` consumes Task 535 mutation impact and maintains a
  request/attempt revision authority. Ordinary prose/list/table/inline-code edits do not arm a
  settle callback; heading, embedded-ToC, and top-level structural impact coalesce to one attempt.
  Pre-request lifecycle noise, render-owned ToC writes, post-render caret mutations, IME, disposal,
  no-consumer documents, failed attempts, and WYSIWYG panel chrome have explicit tested behavior.
- Anchor-counted source patches route IR and WYSIWYG input through the authority, notify successful
  central `renderToc` calls, and make `insertMD`/`setValue` refresh native and embedded ToCs together.
  Missing or duplicate source anchors fail the patch tests.
- Focused unit/source-patch coverage passed 243/243; the final combined run reports
  `toc-invalidation.ts` at 91.50% statements / 82.60% branches / 100% functions / 96.66% lines.
  The final Chromium pair passed 3/3, including ordinary IR/WYSIWYG zero-work, structural refresh,
  no-consumer, and Task 535 mutation-local regression paths.
- The generated 2,000+ line / 130-section no-retry real-VS-Code journey passed 1/1 in 40.4 seconds.
  It covers first-action external heading replacement, embedded target resolution, ordinary edits,
  heading text, top-level insertion, undo/redo, IR/WYSIWYG/full Preview, save/reopen, and exact host
  and disk bytes. The existing Task 171 real regression passed 2/2 with retries disabled.
- The disposable private-file probe passed with `outlineCalls=0`, `tocInvalidations=0`,
  `tocRefreshes=0`, nine ordinary block spins, and `maxSpinBytes=199` instead of the documented
  approximately 42 KB settle spin. Both ignored copies remained 94,711 bytes / 2,252 lines and
  SHA-256 `9c61ca00cdf084677766a4203c27d25bb5ef38dadeadc390f64bc7ef4455e80f`;
  the probe was removed.
- Build reports 588.8 decimal KB; the explicit budgets pass at 589 KB main bundle, 287 eager
  modules, and 29.4/34 KB largest module. Lint, all typechecks, module boundaries, audits, and the
  final frozen quality run pass 248 files / 3,616 tests with 76.40% statements, 68.88% branches,
  79.28% functions, and 78.39% lines. The sole quality failure is the pre-existing Knip report for
  unlisted `yazl` in `test/backend/package-local-preview-core.test.ts`.
- Independent review found no remaining Critical or Important issues. Earlier quality attempts that
  overlapped real-VS-Code work were discarded; the evidence above is from the final uncontended run.
  Broad routine real-VS-Code tiers remain deferred to Task 534's final combined candidate.
