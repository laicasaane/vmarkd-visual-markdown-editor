# Task 265 — Screen-reader semantics (a11y batch 2: roles, labels, live region)

**Status:** ✅ completed 2026-09-01 · **Impact:** 🟡 med (SR users) · **Pairs with:** 244 (keyboard) · **Origin:** task 192 §10

## Problem

Partial semantics, audited: GOOD — Vditor toolbar items are labeled `<button>`s, table
panel has aria-labels, hint menus arrow-navigate, offscreen sandbox correctly aria-hidden.
MISSING — the contenteditable itself has no role/label (bare `<pre contenteditable>`);
NO aria-live region anywhere (saves, diagram errors, mode switches are silent); wiki chips
are bare spans; **17 of 18 engines emit unlabeled SVG/canvas** that screen readers skip or
read as garbage; callout popover controls have no accessible name.

## Scope

- [x] Editable surface: `role="textbox"` + `aria-multiline="true"` + a doc-name label,
      set post-init from main.ts (no Vditor patch).
- [x] One polite `aria-live` region fed by existing events: save state, diagram render
      errors (diagram-error.ts), mode switches, copy confirmations.
- [x] Diagrams: stamp `role="img"` + `aria-label="<lang> diagram: <first source line>"` on
      every rendered wrapper in the SHARED render path (custom-diagrams.ts) so all 18
      engines inherit it.
- [x] Chips + injected controls: labels on wiki chips (and the 205/228/234 chip family via
      one shared helper), zoom buttons. Task 527 owns accessible names and keyboard behavior for
      its callout `<select>/<input>` controls; verify their landed semantics here rather than
      implementing a competing callout-control patch.

## Out of scope

- Keyboard operability (244), authored-content alt lint (55), full SR walkthrough script
  (do one manual NVDA/Orca pass, record findings here).

## Verification

L1: label-helper unit. L2: attribute assertions across surfaces + a render → live-region
text assertions on save/error events. L3 real-VS-Code (mandatory): same attribute sweep
under the real pipeline (injected CSS/ARIA interplay).

## Completion evidence

- Every IR/WYSIWYG/Split editable surface is now a named multiline textbox using the active
  document basename delivered in the init payload. One idempotent, visually hidden, polite atomic
  status region lives outside Vditor's serializer-owned DOM and receives host save/copy completion,
  explicit mode changes, and shared native/custom diagram errors.
- One link-like observer gives every generated wiki-chip template and both code-reference shapes a
  real `link` role plus a target/line/column accessible name without adding mid-prose tab stops or
  changing the established caret-targeted keyboard model. Task 527's callout type/title labels,
  semantic table markup, the outline tree, Vditor toolbar, and Task 531's labeled diagram buttons
  were verified rather than patched a second time.
- Registry-derived diagram semantics cover all 17 descriptors marked `diagram: true`; the Math
  descriptor remains excluded by its existing formula-not-diagram contract. Each language wrapper
  is a named `figure`, while its SVG/canvas/map visual is the labeled `img` using the first nonempty
  source line. The figure split is deliberate: putting `role="img"` on the wrapper itself made the
  nested Pan/Zoom/Fullscreen/Reset toolbar presentational and invisible to Orca. Unit and real
  AT-SPI evidence now show the Mermaid image and Diagram viewport controls as sibling children of
  the named panel.
- RED unit evidence began with all three missing helpers. The final focused unit set passes 120/120
  across editor/live-region, wiki/code-ref labels, every registry diagram, mode announcements,
  host message dispatch, save/copy events, callout labels, controls, and module boundaries. Focused
  Chromium coverage passes 1/1 through real Vditor DOM; it reports `screen-reader.ts` at 90.70%
  lines while the repository unit report records 100% lines, `link-like-semantics.ts` at 95.45%
  lines, and `diagram-semantics.ts` at 79.48% lines.
- The one-boot real-VS-Code journey covers editor, toolbar, outline, table, wiki/code-ref chips,
  valid Mermaid image plus controls, invalid Vega error, callout select/input labels, WYSIWYG mode,
  copy/save live announcements, and exact source fidelity. Its first version opened outside the
  launch workspace so wiki rendering correctly stayed disabled; moving the generated fixture into
  the harness workspace fixed that test defect. Final normal and Orca-backed runs each pass 1/1
  with retries disabled.
- The required manual pass used Orca 50.2 on the same real VS Code journey under an isolated
  D-Bus/AT-SPI/Xvfb session. Orca's debug stream recorded spoken `Markdown editor for
  screen-reader.md`, link roles/names for Home and `src/app/extension.ts:1`, the Mermaid image,
  the still-exposed Diagram viewport toolbar, and status events for Vega error, WYSIWYG mode,
  copied code, and saved document. XDG portal/FUSE warnings were environmental and did not affect
  the AT-SPI registry or the passing walkthrough.
- Build, all typechecks, module boundaries, lint, and deliberate 605 KB / 292 eager-module / 29.5
  KB largest-module budgets pass; the measured eager bundle is 603.8 decimal KB and adds only the
  three accessibility glue modules. The final `npm run quality` run passes brand checks, lint,
  duplication, dependency rules, audits, 257 coverage files / 3,710 tests, and the 13-module
  ratchet at 77.07% statements / 69.32% branches / 79.95% functions / 79.16% lines. Its sole
  residual remains the pre-existing Knip report for unlisted `yazl` in
  `test/backend/package-local-preview-core.test.ts`, owned by Task 541.
