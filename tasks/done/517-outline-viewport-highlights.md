# Task 517 — Highlight outline headings currently visible in the editor viewport

> **For agentic workers:** Use `superpowers:test-driven-development` for implementation and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmarkd-testing` skill. Keep this checklist current with actual evidence.

**Status:** ✅ DONE (2026-08-28) · **Impact:** 🟡 long-document orientation ·
**Origin:** user request, 2026-08-28

**Goal:** In the in-editor Vditor outline panel, continuously highlight every outline entry whose
rendered heading is currently visible in the active content viewport.

**Architecture:** A focused webview controller observes the active surface's rendered `h1`–`h6`
elements with one `IntersectionObserver`, maintains the set of visible heading IDs, and projects
that set onto Vditor's existing outline entries through their `data-target-id` attributes. A
coalesced outline-content observer rebinds after Vditor rebuilds the outline or changes mode; no
host protocol, Markdown parsing, or document mutation is added.

**Tech stack:** TypeScript, Vditor DOM, `IntersectionObserver`, `MutationObserver`, Vitest/jsdom,
Chromium Playwright, and real-VS-Code Playwright.

**Related:** [Task 13](13-outline-heading-flash.md) owns clicked-heading flash,
[Task 78](78-vscode-native-outline.md) owns the separate Explorer Markdown Outline tree, and
[Task 290](../290-heading-breadcrumb.md) proposes a caret-based breadcrumb. Task 517 is viewport-based
and affects only Vditor's in-editor outline.

## Approved product decisions

- Highlight the **in-editor Vditor outline panel** only. Do not change the Explorer Markdown Outline
  tree or add a host message.
- Highlight every heading with any visible portion inside the active content viewport. Multiple
  outline entries may be highlighted simultaneously.
- Use a small inset at the top and bottom of the viewport to prevent one-pixel edge flicker.
- Keep the behavior always enabled whenever the Vditor outline is open. Do not add a setting.
- Use a distinct passive multi-highlight style that does not override keyboard focus, hover,
  collapse controls, or Task 13's flash on the document heading.
- Do not auto-scroll or auto-expand the outline. A visible heading inside a collapsed outline
  branch may retain its class while its entry remains hidden; expanding the branch reveals the
  correct current state.

## Scope and surface rules

Track the same heading surface Vditor uses to render and navigate its outline:

- Full Preview or SV split Preview visible: observe `innerVditor().preview.previewElement`.
- IR or WYSIWYG editing: observe the current mode's active editor element.
- SV source has no rendered `h1`–`h6`; the outline corresponds to the rendered Preview pane, so
  observe that pane rather than raw source lines.

Resolve the actual scrolling ancestor for the selected heading surface and pass it as the
`IntersectionObserver` root. Verify this DOM relationship in both the Chromium harness and real VS
Code; do not assume the browser window is the viewport when Vditor owns an inner scroller.

Use these observer semantics:

```ts
const VIEWPORT_INSET_PX = 4
const options: IntersectionObserverInit = {
  root: resolvedScrollContainer,
  rootMargin: `-${VIEWPORT_INSET_PX}px 0px -${VIEWPORT_INSET_PX}px 0px`,
  threshold: 0,
}
```

An entry is visible only when `entry.isIntersecting` and its intersection has nonzero height. Ignore
callbacks from a stale observer generation, detached heading nodes, or headings outside the current
surface.

## Component and interface

Create `media-src/src/nav/outline-viewport-sync.ts` with one public installer and a disposer:

```ts
import type Vditor from 'vditor'

export const OUTLINE_VIEWPORT_CLASS =
  'vmarkd-outline-item--in-viewport'

export function installOutlineViewportSync(vditor: Vditor): () => void
```

The module owns:

- the current `IntersectionObserver`;
- the current observer generation and observed heading set;
- a `Set<string>` of visible heading IDs;
- one coalesced refresh function;
- mutation observation of `.vditor-outline__content` rebuilds and the outline panel's visibility;
- class removal, observer disconnection, and coalescer cancellation during refresh/disposal.

Do not export internal DOM-resolution helpers unless a pure helper materially improves unit tests.
Do not modify `media-src/src/nav/viewport-gate.ts`; it is a one-shot diagram-render gate with
different semantics, not a persistent visibility tracker.

## Data flow

1. `installOutlineViewportSync` resolves `.vditor-outline`, its content element, and the active
   rendered heading surface.
2. When the outline is hidden, disconnect heading observation and remove all viewport classes.
3. When visible, resolve the surface's real scroll container, create one observer with the approved
   inset, and observe every connected `h1`–`h6` carrying an ID.
4. Each observer callback updates visible IDs, then synchronizes all
   `.vditor-outline li > span[data-target-id]` entries:
   add `OUTLINE_VIEWPORT_CLASS` when `data-target-id` is visible, remove it otherwise.
5. Vditor replaces `.vditor-outline__content` wholesale on edits and mode/Preview changes. Its
   `MutationObserver` callback must coalesce to one refresh per animation frame, disconnect the old
   heading observer, clear stale state, resolve the new surface/root/headings, and reapply classes to
   the rebuilt entries.
6. Outline show/hide also triggers refresh. Reopening the panel must reconstruct current visibility
   without requiring another scroll event.

Use ID mapping, not heading text or ordinal-only matching. Vditor already emits matching heading IDs
and outline `data-target-id` values; duplicate heading labels therefore remain unambiguous.

## Styling and interaction precedence

Add the viewport class styling beside existing outline CSS in `media-src/src/main.css`:

- use `--vscode-list-inactiveSelectionBackground` with a transparent fallback for the passive row
  background;
- use a narrow inset accent based on `--vscode-focusBorder` or another existing VS Code list accent;
- preserve readable foreground colors from Vditor/VS Code instead of forcing text color;
- keep Vditor hover styling visible;
- keep `:focus-visible`/roving-tabindex focus indication visually stronger than viewport state;
- do not set `aria-current` or `aria-selected`, because several headings may be visible and viewport
  presence is not tree selection.

The class belongs on the clickable `span[data-target-id]`, not its bare `<li>` wrapper, matching
Task 458's treeitem and Vditor's own row hit target.

## Lifecycle integration

Wire the installer in `media-src/src/boot/finish-init.ts` beside the existing outline flash,
resize, and keyboard installers:

```ts
observers.set(
  'outline-viewport-sync',
  installOutlineViewportSync(window.vditor),
)
```

Add the import and update `finish-init.test.ts`'s mocks/assertions. Use the existing disposer registry
so re-init and editor disposal cannot leave observers attached to old DOM.

Do not merge the feature into `outline-keyboard.ts`: both modules react to outline rebuilds, but one
owns ARIA/focus state and the other owns viewport projection. Separate installers keep their
responsibilities and teardown independently testable.

## Test-first implementation sequence

### 1. Pure/controller unit coverage

Create `media-src/src/nav/outline-viewport-sync.test.ts` with controlled `IntersectionObserver`
instances. Build DOM with real heading IDs and outline `data-target-id` entries, then write failing
tests for:

- exact observer root, `rootMargin: '-4px 0px -4px 0px'`, and `threshold: 0`;
- one visible heading adds one class;
- two intersecting headings add two classes simultaneously;
- a heading leaving removes only its own class;
- zero-height or `isIntersecting:false` entries are not highlighted;
- partially visible nonzero entries are highlighted;
- stale-generation callbacks and detached headings are ignored;
- an outline-content rebuild remaps the retained visible-ID state onto new entry elements;
- a mode/Preview surface change disconnects the old observer and observes the new headings;
- hiding the outline clears classes and disconnects; reopening reconstructs state;
- disposal disconnects observers, cancels coalesced work, and removes classes;
- no `aria-current`/`aria-selected` attributes are introduced.

Use fake observers that record `root`, `rootMargin`, observed nodes, `disconnect`, and callback
entries. Do not test by manually calling internal implementation functions that production never
uses.

### 2. Implement controller and lifecycle

- [x] Implement the smallest controller satisfying the unit matrix.
- [x] Add `finish-init.ts` installation and disposer-registry coverage.
- [x] Run focused Vitest for the new module and `finish-init.test.ts`.
- [x] Inspect changed-line coverage for every callback, refresh, hide/reopen, stale-generation, and
      disposal branch.

### 3. Chromium outline behavior

Extend `media-src/e2e/outline-harness.ts` with enough real Markdown spacing that scrolling can show
one or several headings and can place a heading partially at an inset edge. Install
`installOutlineViewportSync` in the harness through the same lifecycle shape as production.

Extend `media-src/e2e/outline.spec.ts` to prove:

- the initial highlighted set matches headings actually intersecting the active IR scroller;
- scrolling changes the set without a document edit;
- two visible headings are highlighted together;
- a heading at the true edge but outside the 4 px inset is not highlighted;
- an outline rebuild after editing reapplies classes to replacement entry nodes;
- switching IR ↔ WYSIWYG and opening/closing Preview rebinds to the surface used by Vditor's outline;
- collapsed branches remain collapsed and document `getValue()` stays byte-identical.

Poll the class set and measured rectangles. Do not add fixed settle sleeps.

### 4. Real-VS-Code acceptance

Create `test/vscode-e2e/outline-viewport.spec.ts` and a realistic tracked fixture with adjacent and
widely separated headings. Through the real custom editor:

- open the Vditor outline panel and wait for editor readiness;
- measure the active scroller and rendered heading rectangles;
- assert every and only nonzero heading intersection inside the 4 px inset has a matching outline
  class, including a state with multiple visible headings;
- scroll and assert the class set changes without clicking the outline;
- cover IR and WYSIWYG plus Preview/SV's rendered Preview surface;
- trigger an outline rebuild with a real edit and verify remapping;
- assert keyboard focus styling/roving tabindex still works and outline branches are not expanded;
- assert exact Markdown bytes are unchanged by scrolling and observation.

Use structural DOM/geometry assertions rather than screenshots. A visual screenshot may aid review
but is not the regression oracle.

## Verification gates

Use current `DEVELOPMENT.md` as the command authority. At minimum run:

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
xvfb-run -a npm --prefix media-src run test:e2e
env -u ELECTRON_RUN_AS_NODE xvfb-run -a npm --prefix test/vscode-e2e test -- outline-viewport.spec.ts
npm run quality
git diff --check
```

## Implementation and verification evidence

- `media-src/src/nav/outline-viewport-sync.ts` owns one current heading observer, generation-guarded
  callbacks, visible-ID projection, the approved 4 px inset, coalesced outline rebuilds, independent
  outline-panel visibility observation, and complete teardown. Branch collapse styles are excluded
  from rebuild observation so collapsing a long outline does not recreate the heading observer.
- `runFinishInit` registers the controller through `Disposables`; passive/hover/focus-visible CSS is
  applied to Vditor's clickable outline row without adding selection ARIA or changing foregrounds.
- TDD RED evidence: the missing controller module failed import resolution; the API shell then failed
  all 7 controller behavior tests; finish-init registration failed 1/2; the first Chromium viewport
  assertion failed while the harness lacked the installer; the real-VS-Code acceptance failed on the
  old bundle in both configured attempts. A mutation check also proved the no-outline disposer test
  fails when that disposer throws. Every RED was followed by a focused GREEN run.
- Focused Vitest: controller, lifecycle, and module-boundary tests passed 18/18. Fresh full unit
  coverage passed 3,009/3,009; `outline-viewport-sync.ts` reports 100% line coverage and the
  zero-coverage-module ratchet remains 16/16.
- Chromium: `outline.spec.ts` passed 17/17, focused e2e coverage exercised the controller through real
  Vditor, and the final full suite passed 491 with 5 intentional skips. The SV leg explicitly reopens
  Vditor's outline after mode entry (Vditor intentionally hides it) before asserting the rendered
  Preview surface.
- Real VS Code: after `node build.mjs`, `outline-viewport.spec.ts --retries=0` passed 1/1 across IR,
  WYSIWYG, full Preview, and reopened-outline SV; it verifies real scroll-root geometry, the inset,
  multiple highlights, scrolling, rebuild after a real edit, collapse preservation, ArrowDown roving
  focus, focus-visible styling, ARIA non-selection, and webview/host byte fidelity.
- `node build.mjs`, bundle-size (483/484 KB), startup-cost (273/273 eager modules; 28.1/34 KB largest),
  all three typechecks, host/webview/real-VS-Code audits (0 vulnerabilities), visual goldens (6/6),
  `git diff --check`, and `npm run quality` passed. The budget increases are documented measured glue:
  the new controller contributes 1.5 KB and one module, with no renderer or engine moving eager.
- Retry/flake record: the first real-VS-Code RED ran its configured retry and failed deterministically
  both times because the built bundle lacked the feature. Diagnostic failures while refining the
  WYSIWYG/SV test oracle were reproduced with `--retries=0` and fixed at their test setup/root cause.
  The final acceptance passed with `--retries=0`; no green result relied on retry recovery.
- Independent code review found no Critical issues. Its SV setup, collapse-observer overhead, and
  keyboard-roving findings were incorporated before the final focused and whole-suite runs.

Inspect changed-line coverage for the controller and lifecycle wiring. Report retries separately
from clean passes. The task is incomplete without focused real-VS-Code evidence across the approved
surfaces.

## Out of scope

- Highlighting or revealing items in the Explorer Markdown Outline tree.
- A caret-current heading, sticky breadcrumb, or active-section path; Task 290 owns that concept.
- Auto-scrolling or auto-expanding the outline panel.
- Changing Task 13's document-heading flash.
- A user setting, color picker, or configurable intersection threshold/inset.
- Reusing the diagram viewport gate or introducing a host/webview visibility protocol.

## Completion checklist

- [x] Any nonzero heading portion inside the 4 px inset highlights its Vditor outline entry.
- [x] Multiple visible headings are highlighted simultaneously; leaving headings clear independently.
- [x] IR, WYSIWYG, full Preview, and SV rendered Preview surfaces use the correct scroll root.
- [x] Outline rebuilds, mode changes, Preview changes, hide/reopen, re-init, and disposal are safe.
- [x] Passive viewport styling preserves hover, keyboard focus, ARIA tree semantics, and collapse state.
- [x] Scrolling/observation never changes Markdown bytes or sends host edits.
- [x] Unit, Chromium, focused real-VS-Code, coverage, build, budget, typecheck, audit, and quality
      gates pass.
- [x] Task record is marked complete, moved to `tasks/done/`, and indexed in `tasks/README.md` only
      after implementation and verification are genuinely complete.
