# Task 521 — Keep the outline highlight active for visible section content

> **Status:** 📋 READY — approved 2026-08-29; implementation has not started.
> **Impact:** 🟡 long-document orientation and outline navigation accuracy.
> **Depends on:** task 518 must be closed first so this focused behavior correction does not overlap
> its atomic dependency/vendor working tree.

**Goal:** Rectify Task 517 so an in-editor outline entry remains highlighted while the viewport
shows content belonging to that heading, even after the heading element itself has scrolled above
the viewport.

**Architecture:** Keep Task 517's focused webview controller and lifecycle, but project section
ranges rather than only intersecting heading boxes. In rendered document order, each heading owns
the range from its top edge to the next rendered heading's top edge; the last heading owns the range
through the end of the active surface. Coalesce scroll, geometry, and rebuild invalidations, measure
against the actual Vditor scroll root, and apply the existing passive outline class to every section
whose range has a nonzero intersection with the inset viewport.

**Tech stack:** TypeScript, Vditor DOM, browser geometry and observers, Vitest/jsdom, Chromium
Playwright, and real-VS-Code Playwright.

**Related:** [Task 517](done/517-outline-viewport-highlights.md) introduced heading-box viewport
highlighting. [Task 13](done/13-outline-heading-flash.md) owns clicked-heading flash, and
[Task 78](done/78-vscode-native-outline.md) owns the separate Explorer Markdown Outline tree.

## 1. Product contract.

- Change only the in-editor Vditor outline panel. Do not alter the Explorer outline tree, heading
  flash, document selection, caret, or host protocol.
- A heading remains highlighted when its heading box is above the inset viewport but any nonzero
  portion of its owned section content remains inside the viewport.
- Define section ownership in flat rendered-heading order: a heading's section starts at that
  heading's top edge and ends at the next `h1`-`h6` top edge, regardless of heading level. The last
  heading's section extends through the active surface's scrollable end.
- Nested outline ancestors do not remain highlighted merely because a descendant section is active.
  The nearest preceding rendered heading owns the content until the next heading.
- Content before the first rendered heading has no owning outline entry and therefore produces no
  highlight unless the first heading's own section intersects the viewport.
- Preserve Task 517's multi-highlight behavior. When the viewport spans a section boundary, both
  section ranges may intersect and both corresponding outline entries are highlighted.
- Preserve the existing 4 px top and bottom viewport inset and use strict nonzero range
  intersection. A section that only touches an inset boundary is not active.
- Keep the behavior always enabled while the outline is open. Do not add a setting, auto-scroll or
  auto-expand the outline, or add `aria-current`/`aria-selected`.
- Preserve passive highlight precedence: keyboard focus, hover, collapse controls, and Task 13's
  document-heading flash remain visually and semantically distinct.

## 2. Scope and implementation shape.

Modify the existing Task 517 controller rather than adding a second outline tracker:

- `media-src/src/nav/outline-viewport-sync.ts`
- `media-src/src/nav/outline-viewport-sync.test.ts`
- `media-src/e2e/outline-harness.ts`
- `media-src/e2e/outline.spec.ts`
- `test/vscode-e2e/fixtures/outline-viewport.md`
- `test/vscode-e2e/outline-viewport.spec.ts`

Use the canonical class and identifier names present when implementation begins. If Task 519 has
already completed, follow its renamed product/CSS authorities rather than restoring an older
prefix.

The controller must:

1. Resolve the same active IR, WYSIWYG, Preview, or SV rendered-Preview surface and actual scroll
   root that Task 517 uses.
2. Collect connected rendered headings with IDs in document order and map them to Vditor outline
   rows through `data-target-id`.
3. On a coalesced projection pass, derive each heading's section range from heading geometry and the
   following heading, using the active surface's scrollable end for the final range.
4. Compare those ranges with the root's 4 px inset viewport and project the complete active-ID set
   onto outline rows in one pass.
5. Recompute after scrolling, root/surface resize, outline rebuild, mode or Preview surface change,
   outline hide/reopen, and any existing observer signal needed for initial geometry.
6. Disconnect every listener and observer, invalidate stale scheduled work, and remove passive
   classes during refresh or disposal.

Geometry reads and class writes must be coalesced to at most one projection per animation frame for
a burst of scroll or observer events. Do not add a per-heading scroll listener, continuously poll,
wrap authored content in section elements, mutate Markdown, or use heading text as identity. Retain
generation guards so callbacks from detached or replaced surfaces cannot project stale state.

The implementation may retain `IntersectionObserver` as an invalidation source, but heading-box
intersection alone is no longer the state authority. The acceptance oracle is section-range
intersection with the real scrolling viewport.

## 3. Test-first implementation sequence.

> **For agentic workers:** Use `superpowers:test-driven-development` before implementation,
> `superpowers:systematic-debugging` for unexpected failures or behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-testing` skill and keep this task's evidence current.

### 3.1. Controller unit coverage.

Extend `outline-viewport-sync.test.ts` with controlled root, surface, heading, and section geometry.
Write failing tests proving:

- a heading initially visible is highlighted;
- after its heading box scrolls above the inset, it remains highlighted while its section content
  intersects the viewport;
- it clears only when the viewport no longer intersects its section;
- entering a following section can highlight the preceding and following entries together when the
  viewport spans their boundary;
- after the preceding range leaves, only the following entry remains;
- the final heading remains highlighted through a long tail to the surface end;
- content before the first heading produces no highlight;
- exact and one-pixel-inside 4 px inset boundaries follow strict nonzero intersection;
- nested heading levels still use the next rendered heading as the boundary;
- a burst of scroll/resize signals schedules one geometry projection per frame;
- rebuild, mode/surface replacement, hide/reopen, stale callbacks, and disposal preserve Task 517's
  lifecycle guarantees and do not leak scroll or resize listeners; and
- no selection ARIA is introduced and no outline branch state changes.

Do not unit-test private helpers directly when the installed controller can exercise the same path.
Inspect changed-line coverage for every new geometry, boundary, scheduling, and teardown branch.

### 3.2. Chromium behavior.

Extend the outline harness with realistic long prose between adjacent and nested headings. Through
real browser geometry, prove:

- scrolling the first heading fully above the true IR viewport retains its outline highlight while
  middle-of-section prose remains visible;
- crossing the next heading transfers the steady-state highlight and preserves the approved
  boundary state where two sections are visible;
- the final section remains highlighted near the document bottom;
- preamble content before the first heading has no owner;
- IR, WYSIWYG, full Preview, and SV's rendered Preview bind to their actual scroll roots;
- an outline rebuild and hide/reopen reconstruct the section projection without an extra user
  scroll; and
- collapse state, focus semantics, and `getValue()` bytes remain unchanged.

Use rectangle and class-set polling. Do not add fixed settle sleeps or screenshot-only assertions.

### 3.3. Real-VS-Code acceptance.

Extend `outline-viewport.spec.ts` and its tracked fixture with at least one section whose prose is
taller than the viewport. In the real custom editor:

- open the in-editor outline and establish the exact active root and 4 px inset;
- scroll until the owning heading is measurably above the viewport while its section prose remains
  visible, then assert its outline entry is still highlighted;
- scroll across the next-heading boundary and assert the complete active class set before, during,
  and after the boundary;
- cover IR, WYSIWYG, full Preview, and reopened-outline SV Preview;
- trigger a real edit that rebuilds heading/outline DOM and verify the section state remaps;
- preserve collapsed branches, roving keyboard focus, focus-visible styling, and ARIA non-selection;
  and
- assert exact webview, extension-host, and on-disk Markdown bytes are unchanged by observation and
  scrolling.

Chromium evidence does not replace this real-VS-Code acceptance because scroll-root and webview
geometry are part of the defect.

## 4. Completion and verification.

Use current `DEVELOPMENT.md` as the exact command authority. At minimum run the focused unit,
Chromium, and real-VS-Code specs for this surface, then the applicable implementation gates:

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/nav/outline-viewport-sync.test.ts \
  media-src/src/boot/finish-init.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
npm run test:coverage
npm run check:coverage-modules
xvfb-run -a npm --prefix media-src run test:e2e -- outline.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- outline-viewport.spec.ts
npm run quality
git diff --check
```

- [ ] Section-range projection replaces heading-box-only state without adding a second controller.
- [ ] Long-section, boundary, final-section, preamble, and nested-heading semantics match section 1.
- [ ] IR, WYSIWYG, Preview, and SV use their real scroll roots and rebuild cleanly.
- [ ] Focus, hover, collapse, ARIA, lifecycle, performance, and Markdown fidelity remain intact.
- [ ] Focused unit coverage, Chromium, and real-VS-Code acceptance pass without relying on retries.
- [ ] Applicable type, build, bundle/startup, coverage, quality, and diff gates pass, with any retry
      recovery or residual risk recorded honestly.
- [ ] The final diff excludes generated artifacts, `LOCAL_AGENT_TASK.md`, and unrelated Task 518
      work.
- [ ] Move this file to `tasks/done/`, update `tasks/README.md`, and create a focused local commit
      only after every acceptance item is complete. Do not push.

## 5. Out of scope.

- Explorer/native outline behavior, breadcrumbs, scroll-following the outline panel, or automatic
  expansion of collapsed branches.
- Caret-based current-section selection or retaining every ancestor heading in a nested hierarchy.
- A user setting, host message, Markdown parser, document mutation, or authored section wrapper.
- Changes to Task 13's clicked-heading flash, outline keyboard navigation, or resize behavior.
- Broad observer-framework refactors or unrelated performance work.
