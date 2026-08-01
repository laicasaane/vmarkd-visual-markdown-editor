# Task 321 — Self-healing code references (line-drift auto-repair) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. The missing MAINTENANCE half of task 229 (file:line refs).

## What it is & the effect

Docs cite `src/api.ts:120`; lines move. Today the reference silently points at the wrong
function after any refactor above line 120 — worse than no reference. After: the editor
detects the target region drifted (or the file shrank below the ref) and offers one-click
repair — "this reference now points at line 134 — fix it?" — computed by replaying git
diff hunks between the ref's creation commit and HEAD to remap the line number.

## Why novel

Line-remap-via-hunks is how blame and IDE bookmarks work INTERNALLY, but no documentation
tool applies it to heal references in prose. Swimm re-anchors its own proprietary blocks;
nobody heals plain `file:line` text in markdown.

## Feasibility on our assets

Hunk data = vscode.git diff (the git-diff.ts access pattern); the ref's baseline = the 308
attestation date or the ref line's own blame; the rewrite is surgical — exactly
minimal-diff-writeback's job (only those bytes change). Builds ON 229; slots INTO the 308
stack.

## Honest value

Magical in a demo ("the doc fixed its own reference") and quietly removes the strongest
argument AGAINST putting code refs in docs. Value scales with team ref usage.

## Decision

- [ ] **ADOPT** (sequenced after 229; ideally with 308)
- [ ] **PARK** — reason: _______
