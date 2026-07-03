# Task 231 — Docusaurus/MkDocs admonitions (`:::note` … `:::`)

**Status:** planned · **Impact:** 🟡 med (docs-site authors) · **Origin:** task 192 §9

## Problem

Verified by Lute probe: `:::note\n…\n:::` renders as a literal paragraph (`<p>:::note<br>…`).
Developers authoring Docusaurus/MkDocs content see raw `:::` markers in vMarkd while their
docs site renders styled admonitions — the same vault-degradation shape as Obsidian
callouts (task 206), for a different ecosystem.

## Scope

- [ ] Map container admonitions onto the EXISTING callout rendering: `:::type[ title]` …
      `:::` → the task-206 alias map (note/tip/info/warning/caution/danger + Docusaurus
      names). Reuse the callout visuals wholesale — no second design.
- [ ] Mechanism: these are paragraphs to Lute (not blockquotes), so the callout machinery
      does NOT apply directly — a renderer pass groups the `:::` paragraph cluster into a
      styled `data-render` presentation while the SOURCE stays byte-identical (the
      dual-node discipline; read the vmarkd-lute-features skill before building).
- [ ] Body renders as markdown (it already does — Lute parses the inner lines normally);
      nested admonitions v1: render outer only, inner stays literal (document it).
- [ ] Editing: v1 = IR shows source-with-styling (like editing a diagram source), full
      caret-enter/collapse polish only if the callout machinery ports cheaply. Gate behind
      `vmarkd.markdown.containerAdmonitions` (default on — the syntax has no other meaning).

## Phase 2 (added 2026-07-03, Quarto parity — same `:::` cluster machinery)

- [ ] **Tabsets** — `::: {.panel-tabset}` renders as a tab bar: each top-level heading
      inside becomes a tab (Quarto convention, ~438K installs); v1 Preview+WYSIWYG render,
      no `group=` sync (doc-scoped pub/sub later); source stays byte-identical
      (data-render presentation over the same paragraph-cluster pass as phase 1).
- [ ] Stretch (only if the cluster pass makes them near-free): `.content-visible/
      .content-hidden` rendered with a condition badge + honored by 53/252 exports;
      `.aside`/`.column-margin` floated into a right margin on wide viewports.

## Out of scope

- Docusaurus MDX/JSX, `???` collapsible MkDocs variant (map `???` → folded rendering only
  if trivial after task 206's fold lands), writing/conversion tooling (`:::` ↔ `> [!NOTE]`).

## Verification

- L1: cluster parser (type/title line, unterminated block, nested, `:::` inside code fence
  must NOT match).
- L2: renders with callout styling in ir/wysiwyg/preview; round-trip BYTE-stable (the
  whole point); edit-adjacent typing safe.
- L3 real-VS-Code (mandatory): fixture block renders styled; save fidelity intact.
