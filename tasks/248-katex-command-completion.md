# Task 248 — KaTeX command completion inside math blocks

**Status:** planned · **Impact:** 🟡 med (academic) · **Origin:** task 192 §10

## Problem

vMarkd renders KaTeX beautifully but you type `\begin{pmatrix}` blind — no completion
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

## Out of scope

- Live preview-as-you-type of the formula (exists — the math block already re-renders),
  LaTeX linting, mhchem command list (add only if the same table trivially extends).

## Verification

L1: trigger/filter units (prefix match, inside-math-only gate). L2: type `\pmat` in a math
pane → menu → select → source + rendered output correct, one undo step. L3: one
real-VS-Code leg (hint positioning under injected CSS).
