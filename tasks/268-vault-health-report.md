# Task 268 — "Vault health" report: orphaned assets + workspace dead links + doc stats

**Status:** planned · **Impact:** 🟡 med (note-takers, vault users) · **Origin:** task 192 §10

## Problem

Three related absences, best shipped as ONE command (the audit's recommendation):
(1) image paste→assets accumulates files forever — nothing ever scans the folder back
(the only "orphan" code is the internal diagram-cache GC); (2) dead-link checking exists
only per-OPEN-doc in task 55's scope — no workspace-wide sweep; (3) no workspace insights
(largest/stalest docs, unchecked-task density). One scan serves all three: refs→files
(dead links) and files→refs (orphans) are the same pass, inverted.

## Scope

- [ ] Command `vMarkd: Vault health report`: host-side scan of workspace .md (reuse the
      wiki-cache scan/watcher skeleton) collecting image+link refs (`![]()`, `[[img]]`,
      `![[img]]`, `<img src>`, relative md links).
- [ ] Report (quick-pick tree or a generated markdown doc — decide by demo): **Unused
      assets** under `image.saveFolder`(s) with delete-to-Trash action (never hard
      delete); **Dead links** workspace-wide (doc:line → missing target, click to open);
      **Stats**: doc count, largest by words, stalest by mtime, unchecked-task density,
      orphan docs (zero inbound — needs task 201's reverse index; degrade gracefully
      without it).
- [ ] Perf guard: size caps + progress notification on big vaults; respects untrusted-
      workspace rules.

## Out of scope

- Auto-cleanup without review, open-doc live diagnostics (task 55 owns that — this is the
  batch sweep), the dataview query engine (105).

## Verification

L1 (the bulk): ref-scanner units (all ref forms, url-encoded paths, case sensitivity),
orphan/dead-link set logic, Trash-delete via the vscode-mock. L3: fixture vault with a
known orphan + dead link + stats → report content exact; delete action moves to Trash.
