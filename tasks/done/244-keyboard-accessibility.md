# Task 244 — FIX: keyboard trap + keyboard-only operability (a11y batch 1)

**Status:** ✅ **CLOSED (2026-08-28, Project Owner-directed reconciliation)** — every original
requirement has a shipped or explicitly accepted residual disposition below. · **Impact:** 🔴 high
(keyboard/motor-impaired + power users) ·
**Origin:** [task 192 §10](../192-feature-gap-audit.md)

## Closure reconciliation

The 2026-07-30 diagnosis and source locations below were accurate when this task was split, but they
are historical context now: the four children changed the source and, for link-like content, replaced
the proposed interaction after a real-webview measurement disproved it. The acceptance authority is
the final mapping here, not those old line numbers.

| Original parent requirement | Final disposition | Evidence owner |
|---|---|---|
| Escape the contenteditable without losing ordinary Tab indentation; make the toolbar a navigable roving-tabindex toolbar | **Complete.** Escape arms a one-shot gesture and the following Tab moves to the toolbar; any other key disarms it. The toolbar has `role="toolbar"`, one roving tab stop, and arrow traversal. Escape returns focus and the captured caret. The parent allowed Escape→Tab **or** Shift+Tab from document start; task 456 implemented and verified the former, so the unimplemented alternative is not a missing acceptance item. | [456 — Escape the editor by keyboard](456-a11y-escape-the-editor.md) |
| Operate wiki chips and the future chip family by keyboard | **Complete for every shipped surface, with the literal mechanism superseded.** Forty real-VS-Code Tab presses proved that inline `tabindex="0"` targets remain unreachable while Vditor owns Tab indentation; task 457 therefore removed that experiment and shipped the editor-native model: move the caret into link-like content and press discoverable/rebindable `Ctrl/Cmd+Enter`. It covers wiki chips, plain/local links, and task 229's shipped code-reference chips through the shared caret-gesture path, without mutating `getValue()`. Tasks 205, 228, and 234 do not yet ship a chip surface; when implemented, they retain responsibility for registering their new shape with the shared activation/decorating path rather than reopening this closed parent. | [457 — Keyboard activation for link-like chips](457-a11y-focusable-chips.md) and [459's shared dispatcher](459-a11y-diagram-zoom-and-callout.md) |
| Operate outline items and the resize separator by keyboard | **Operability delivered; end-to-end keyboard-only reachability accepted as a closure residual.** The outline is a roving tree with ArrowUp/Down, nested-tree ArrowLeft/Right, and Enter/Space activation. Its resize handle is a focusable `role="separator"` with ArrowLeft/Right and Home/End resizing through the persisted-width path. Task 458's real-webview walk focuses the outline programmatically; the shipped Escape→Tab chain stops at the toolbar, so a keyboard-only route onward into the outline does not exist. The Project Owner's 2026-08-28 closure direction accepts that gap rather than representing it as shipped. | [458 — Outline panel keyboard operability](458-a11y-outline-keyboard.md) |
| Zoom a focused diagram wrapper with `+`/`−`/`0`, respecting the existing interaction gate and each engine's zoom authority | **Delivered and verified for static SVG, Markmap, and Leaflet; ECharts mindmap remains an accepted closure exception.** The verified paths use their existing transform/engine APIs and preserve source bytes. Mindmap `+`/`−` is implemented through its gated wheel pipeline but lacks focused real-webview evidence, and `0` is intentionally a no-op because no retained engine instance exposes a known reset state. The Project Owner's 2026-08-28 closure direction accepts that narrower shipped matrix. | [459 — Diagram zoom and callout popover](459-a11y-diagram-zoom-and-callout.md) |
| Reach the callout popover controls by keyboard once the callout has focus | **Complete to the original entry requirement.** `Ctrl/Cmd+Enter` at a callout focuses the popover's type control through the same caret dispatcher as links, and the real-VS-Code spec proves focus entry plus unchanged `getValue()`. The implementation also provides native sibling-control Tab behavior and Escape return, but this parent does not claim those extra paths as real-webview-verified. | [459 — Diagram zoom and callout popover](459-a11y-diagram-zoom-and-callout.md) |

## Verification disposition

- Task 456 records unit, Chromium, and real-VS-Code coverage for ordinary Tab, Escape→Tab, toolbar
  traversal, exact caret return, source fidelity, and VS Code chord interaction; its final focused
  result was 4/4, followed by 40/40 in the FAST tier.
- Task 457 records unit and real-VS-Code coverage for caret decoration and activation through both
  the webview chord and the VS Code command, with `getValue()` and host document bytes unchanged.
- Task 458 records unit, Chromium, coverage, and a 5/5 real-VS-Code outline walk. Its historical
  "post-simplifier verification pending" paragraph is superseded by the later complete-suite
  evidence: the outline spec passed in the 2026-08-01 full run, and again in task 512's current-tree
  complete run.
- Task 459 records unit and focused real-VS-Code coverage for the shared caret dispatcher, callout
  focus, static-SVG/Markmap/Leaflet keyboard zoom/reset, and unchanged source. It does not supply
  focused mindmap keyboard-zoom evidence or a mindmap reset.
- The latest integration evidence is [task 512](512-e2e-residual-settle-sleeps.md):
  243 real-VS-Code tests exercised, 237 passed with 2 expected skips; every configured-retry
  recovery was diagnosed and its affected surface then passed without retries. No shipped product
  code changed after that complete run.

No runtime suite was repeated solely for this parent-file move: the child-specific L1/L2/L3 records
and the newer complete current-tree run already cover the shipped behavior, while this closure changes
documentation only.

## Preserved residuals and out-of-scope work

These do not reopen an original task-244 checklist item, but remain explicit rather than disappearing
at parent closure:

- Tasks 456 and 458 record queued focus-visible improvements for the toolbar, outline items, and
  resize handle. They are WCAG 2.4.7 follow-up debt, distinct from this parent's keyboard-trap and
  operability checklist.
- Task 458 makes the outline operable once focused, but the original parent's end-to-end
  keyboard-only walk cannot reach it from the toolbar. This is an accepted closure exception, not a
  claim that reachability shipped.
- ECharts mindmap keyboard reset and focused real-webview keyboard-zoom evidence remain absent. The
  static-SVG, Markmap, and Leaflet matrix is the verified task-459 delivery.
- The original accessibility follow-ups are now complete: [265 — screen-reader
  semantics](265-screen-reader-semantics.md), [266 — reduced motion](266-reduced-motion.md), and
  [267 — high-contrast support](267-high-contrast-support.md).

## Historical diagnosis (2026-07-30)

At split time, `tab: '\t'` caused Vditor to prevent default on every editor Tab, no source-created
tab stops made wiki chips focusable, outline items and its splitter were mouse-only, diagram zoom was
mouse-gated, and callout popover controls could only be reached after mouse focus. That diagnosis
justified splitting the six independent surfaces into tasks 456–459; the reconciliation above records
what ultimately shipped and where the original mechanism changed on evidence.
