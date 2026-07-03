# Task 290 — Sticky heading breadcrumb (the caret's H1›H2›H3 path)

**Status:** planned · **Impact:** 🟡 med (long-doc orientation) · **Origin:** task 192 §12 (SiYuan pattern)

## What it is & the effect

A thin persistent bar above the editing surface showing the heading path of the block the
caret is in (`Architecture › Rendering › Cache`), each crumb clickable to jump — SiYuan's
protyle breadcrumb.

**Why it matters MORE for us than for text editors:** VS Code's native breadcrumbs will
NEVER work here — task 78 verified that DocumentSymbolProvider is not queried for custom
editors (microsoft/vscode#97095), so our users have permanently empty native breadcrumbs.
**Today:** in a long doc you constantly lose track of "which section am I in" — the
outline panel helps but costs a glance-and-scan; **after:** the answer is always one line
above the text, and one click jumps anywhere up the path.

## Scope

- [ ] Sticky top bar in the webview (below the toolbar, outside the 35px gutter):
      selectionchange (debounced) → walk preceding sibling headings of the caret block →
      render the path. Heading data already exists (outline parser, task 78 host-side +
      DOM headings in the webview) — no new parsing.
- [ ] Click a crumb → the existing scroll-to-heading handler (task 78 wiring).
- [ ] Doubles as task 289's hoist bar: in hoisted state the crumbs above the hoist root
      become the "exit" affordance — ONE component, two duties (coordinate; whichever
      lands first builds it).
- [ ] Setting `vmarkd.editor.breadcrumb` (default on); hidden when the doc has no
      headings; theme-aware, ~1 line of height, never shifts content (overlay or reserved
      row — decide by feel, show the user).

## Out of scope

- Block-level crumbs beyond headings, breadcrumb in sv/Preview v1, editing via the bar.

## Verification

L1: path-derivation unit (caret in preamble, nested levels, setext, heading edits).
L2: caret moves → path updates; click → scroll+flash; zero `getValue()` impact.
L3 real-VS-Code (mandatory): rendering under injected CSS + the sticky position over a
scrolled large doc.
