# Task 324 — Changelog draft + "shipped but undocumented" cross-check [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Honest rating: low wow, steady release-time utility.

## What it is & the effect

One command reads the conventional commits since the last git tag and drafts a
keep-a-changelog section straight into CHANGELOG.md for polishing in the WYSIWYG editor.
The twist: each feat/fix entry is cross-checked against the vault — "feat(export): PDF
margins" with ZERO docs mentioning it gets a ⚠ "shipped, never documented" marker. The
changelog ritual becomes a documentation-gap audit.

## Why novel

git-cliff/standard-version generate changelogs as CLI/CI; none run in an editor and none
cross-reference the release against the documentation corpus. The gap-audit is the novel
half.

## Feasibility on our assets

Commit log since tag = vscode.git (git-diff.ts pattern); conventional-commit parsing is a
regex; prepend via minimal-diff writeback; the cross-check greps the vault via
wiki-cache's file list + commit scopes/paths. No AI required (vscode.lm optionally
tightens phrasing).

## Honest value

The changelog half is convenience (git-cliff users won't switch); the undocumented-flag is
the real value and FEEDS 308/323. Our own repo memory even pins a changelog STYLE — the
generator must respect it.

## Decision

- [ ] **ADOPT** (cheap rider on the 308/323 cluster)
- [ ] **PARK** — reason: _______
