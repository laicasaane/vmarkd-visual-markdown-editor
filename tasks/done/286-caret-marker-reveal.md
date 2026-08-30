# Task 286 — BUG: caret navigation can land INSIDE hidden markers (Home/End) + reveal polish

**Status:** done — BUG, silent-corruption class · **Impact:** 🔴 high · **Origin:** task 192 §12 (WYSIWYG audit, code-verified)

## What it is & the effect

In IR mode, collapsed markdown markers (`**`, `[`, `` ` ``…) are **zero-width spans that
remain in the text flow** (`_ir.less:36-42` — width:0/overflow:hidden). Vditor reveals them
(`expandMarker`) ONLY on mouse click and Arrow-key keyup (`ir/index.ts:181/224-230`).
Every other caret motion — **Home, End, PageUp/Down, Ctrl+Home/End** — never triggers the
reveal, so the caret can silently land INSIDE an invisible `**` text node.

**Effect today:** press Home on a line starting with `**bold**`, type a character — it goes
*inside* the hidden marker, corrupting the syntax with no visual cue (the same
silent-desync family as 239/240, but keystroke-sized). Bonus annoyance: arrow-traversal
through a formatted line expands/collapses each node synchronously → per-node layout flash.
**After:** any caret movement reveals the node under the caret, exactly like Obsidian Live
Preview (CodeMirror decorations react to selection overlap, however it moved); traversal
stops flashing.

## Scope

- [x] Replace the key-whitelist trigger with a **selectionchange-driven** `expandMarker`
      (rAF-debounced; the function is exported from vendored source and importable) —
      covers Home/End/Page/Ctrl+Home, mouse drags, script-driven moves.
- [x] Flash polish: collapse the PREVIOUS node only after the caret has settled outside it
      (~100ms dwell) instead of on every keyup — kills the traversal flicker.
- [x] Keep the existing blur-collapse (`editorCommonEvent.ts:44-47`); guard with the
      composing lock (IME) and the mid-spin lock; never fire on the keystroke hot path
      beyond the debounce (perf memory applies).
- [x] Regression net for the corruption: Home-then-type on `**bold**`/`[link](u)` lines →
      syntax intact.

## Out of scope

- WYSIWYG mode (markers hidden by design there), changing marker CSS (width:0 stays —
  it is what makes triple-click marker-inclusive copy work, 191 P0-11).

## Verification

L1: none meaningful (DOM-driven). L2: the corruption matrix (Home/End/PageUp + type, per
inline node type) → `getValue()` intact + node expanded; traversal flash pinned via
mutation counts. L3 real-VS-Code (mandatory): same matrix under real key handling + a
long-line wrapped case.

## Completed (2026-08-31)

IR marker reveal now follows the live selection rather than Vditor's Arrow-only keyup branch. The
existing eager `editor-caret.ts` owns one frame-coalesced controller, so Home, End, PageUp/Down,
mouse selection, and programmatic moves all call the same stock `expandMarker` authority without a
new startup module. An anchor-asserted Vditor source patch removes only the redundant Arrow keyup
call; click expansion, Firefox Backspace repair, unidentified-IME repair, and blur collapse remain.

When navigation lands inside a previously hidden delimiter, the controller expands its inline node
and normalizes the caret to the corresponding logical boundary through the shared caret writer.
That prevents the next character from entering `**`, link brackets/parentheses, or backticks.
Pointer clicks inside a marker that was already expanded and visible remain editable. The prior
node is restored before the frame paints and collapses only after 100 ms of stable dwell; a changed
selection cancels that collapse. Task 294's shared composition state and Vditor's own composition
lock defer every marker class/caret write until composition and the synchronous spin have settled.

### Verification

- The pre-fix Chromium RED test reproduced Home landing in a zero-width `vditor-ir__marker--bi`.
  The final repository-configured coverage run passes 10/10 with `--retries=0`: Home and End across
  strong/link/code, PageUp plus delimiter-safe typing, exact 100 ms dwell with five bounded class
  mutations, intentional pointer marker editing, and composition deferral. E2E coverage reports
  `editor-caret.ts` at 90.94% lines / 92.26% bytes.
- Focused unit/source-patch coverage passes 268/268, including the anchored removal of only the
  Arrow expansion and the existing caret/focus/toolbar consumers. The full unit coverage gate
  passes 3,360/3,360 and the zero-coverage-module ratchet remains 15/15.
- After `node build.mjs`, the final single-boot real-VS-Code matrix passes 1/1 with `--retries=0` in
  8.6 seconds. It drives real Home/End handling for strong/link/code, a long wrapped line, PageUp
  into repeated formatted blocks, and exact Markdown assertions after every typed character.
- Build and all applicable type checks pass. The eager bundle is 520/520 KB under the unchanged
  Task 527 ceiling (measured 520.3 KB), and startup remains 275/275 eager modules.
- Aggregate `npm run quality` passes brand checks, lint, jscpd, dependency-cruiser, root/webview/
  vendor audits, full unit coverage, and the module ratchet. Its only failure is the unrelated
  pre-existing `knip` report for the direct `yazl` require in
  `test/backend/package-local-preview-core.test.ts`.

Retry history: the first real-VS-Code candidates exposed only test synchronization defects—missing
outer-iframe keyboard focus, reusing a mutated PageUp anchor, and a same-type stale expansion oracle
that could accept the previous strong node. The final spec gives the webview explicit keyboard
focus, scrolls each exact target into view, polls the target node's own text/type before pressing a
key, and passes without retries. Per the queue policy, no FAST, full Chromium, or full real-VS-Code
suite was run.
