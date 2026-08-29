# Task 248 — KaTeX command completion inside math blocks

**Status:** planned · **Impact:** 🟡 med (academic) · **Origin:** task 192 §10

## Problem

VMDE renders KaTeX beautifully but you type `\begin{pmatrix}` blind — no completion
(task 65 #8 was deferred for exactly this reason: "we have no math autocomplete"). MAIO
users lose hundreds of command completions when switching.

## Scope

- [ ] Hint-menu completion active ONLY inside math IR source panes (inline `$…$` and
      display `$$` marker panes): trigger on `\` + prefix, fed by a static KaTeX function
      list (generate once from the bundled KaTeX's `katex.__defineMacro`/docs table —
      version-pinned to the bundle).
- [ ] Environment completion: `\begin{` offers matrix/aligned/cases…; selecting inserts
      the matching `\end{}` with the caret between.
- [ ] Reuse the hint.extend vehicle (emoji/wiki pattern); coordinate with task 221 so the
      hint plumbing is built once.
- [ ] While in there, fix the known completion+Enter caret bug noted in task 65 #8
      (Ficus d3fa812 reference).
- [ ] **Ctrl+M toggle math** (added 2026-07-03, MAIO parity): wrap the selection in
      `$…$` (or `$$ … $$` for a multi-line/block selection), toggle off when already
      wrapped; empty selection → insert an empty pair with the caret inside. Webview
      key-capture chord + palette command; one edit, one undo step.
- [ ] **Pre-commit live preview bubble** (added 2026-07-03, Typora parity): a COMMITTED
      math node already live-renders beside its source, but an UNCOMMITTED `$\frac{…`
      (no closing `$`) is plain text — you type the whole formula blind. When the caret
      sits in an unterminated `$…` span (cheap text scan on input), show a caret-anchored
      overlay bubble rendering KaTeX of the pending source; dismiss on commit/Esc. Lives
      OUTSIDE the editable DOM (no Lute contact); same anchor + lifecycle as this task's
      completion menu — build together.

## Out of scope

- Live preview-as-you-type of the formula (exists — the math block already re-renders),
  LaTeX linting, mhchem command list (add only if the same table trivially extends).

## Verification

L1: trigger/filter units (prefix match, inside-math-only gate). L2: type `\pmat` in a math
pane → menu → select → source + rendered output correct, one undo step. L3: one
real-VS-Code leg (hint positioning under injected CSS).
