# Task 280 — Copy as Confluence / Jira wiki markup

**Status:** planned · **Impact:** ⚪ low (corp niche, ~44K combined installs) · **Origin:** task 192 §11

## Problem

Corp writers paste docs into Confluence/Jira, whose legacy wiki markup differs from
markdown (`h1.`, `{code}` macros). Dedicated converters exist (t-nano md→Confluence ~29K,
chintans98 md→Jira ~15K); we have tracker LINKS (228) but no format conversion.

## Scope

- [ ] `Copy as Confluence markup` / `Copy as Jira markup` entries in the toolbar `…` menu
      + task-215 context menu: host-side conversion (jira2md-class pure-JS lib, vendored
      offline; verify license) of `getValue()` → `vscode.env.clipboard` (plain text is
      correct here — the targets consume markup text).
- [ ] Coverage pins: headings, bold/italic, lists, tables, code fences → `{code:lang}`
      with a sensible default theme, links, images (relative paths left as-is with a
      note — Confluence can't reach them).
- [ ] Honest scope note in the README: Confluence Cloud paste-converts markdown decently
      nowadays — these commands serve Server/DC and Jira comment fields.

## Out of scope

- Publishing to Confluence via API, round-trip (wiki→md), ADF (Atlassian Document Format)
  JSON.

## Verification

L1: converter fixture matrix (the coverage pins above). L2: menu click posts the command;
clipboard content (via the copy wire) matches the fixture output. L3: one leg — command →
`vscode.env.clipboard.readText()` is the expected markup.
