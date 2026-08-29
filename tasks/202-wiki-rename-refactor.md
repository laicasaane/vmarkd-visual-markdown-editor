# Task 202 — Rename refactor: rewrite incoming wiki links

**Status:** planned · **Impact:** 🔴 high (trust-breaker) · **Origin:** task 192 §3

## Problem

Renaming a note silently breaks every inbound `[[link]]`: `onDidRenameFiles`
(`src/extension.ts:1090-1111`, shipped as task 14) only re-points the open panel's
identity — "Phase 1: direct
file rename only"; `extension.ts:874` admits cross-folder rename is a known limit. The
watcher reindexes and chips flip to *missing* with no warning. Classic wiki link-rot.

## Scope

- [ ] `workspace.onWillRenameFiles` handler: for a renamed/moved `.md`, compute affected
      docs from the (task 201) reverse index — or a scan fallback if 201 hasn't landed —
      and return a `WorkspaceEdit` rewriting `[[old]]`, `[[old|label]]` (label kept),
      and relative markdown links `](old.md)` across the wiki root.
- [ ] Key semantics must mirror `normalizeWikiLookupKey` (`src/wiki-core.ts:24-40`) — only
      rewrite links that actually RESOLVED to the renamed file (respect ambiguity: if two
      files shared the key, do not rewrite, warn instead).
- [ ] Confirmation: setting `vmde.wiki.updateLinksOnRename` = `always | prompt | never`
      (default `prompt`, matching VS Code's own markdown link behaviour).
- [ ] Folder renames: handle files nested under the moved folder (path-derived keys change).
- [ ] **Asset (image) renames** (added 2026-07-03, broad sweep): extend the same
      `onWillRenameFiles` WorkspaceEdit to non-md files under the assets folder(s) —
      rewrite `![](old.png)` AND wiki-syntax refs `[[img.png]]`/`![[img.png]]` (which
      VS Code's built-in `markdown.updateLinksOnFileMove` never touches), honoring the
      same `updateLinksOnRename` setting; guarantee the rewrite propagates into docs open
      in the VMDE custom editor.

## Out of scope

- Heading-anchor fragments in rewritten links beyond preserving them verbatim
  (`[[old#h]]`→`[[new#h]]`); alias-based resolution (task 207).

## Verification

- L1 backend (vscode-mock): rename single file / folder; pipe labels preserved; ambiguous
  key skipped with warning; `prompt` flow; relative-link rewrite; no-op when no inbound links.
- L3 real-VS-Code (mandatory): fixture vault, `workspace.fs.rename` target, linking doc's
  bytes on disk rewritten, chip stays resolved. Closes the 190 §5 "[UNSUPPORTED?]" probe.
