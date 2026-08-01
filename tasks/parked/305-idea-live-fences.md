# Task 305 — Live Fences: read-only blocks rendering workspace truth [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative-audit proposal
(192 §13); NOT scheduled.

## What it is & the effect

Fenced blocks like ```` ```dir-tree ````, ```` ```git-log n=5 ````,
```` ```test-results file=reports/junit.xml ````, ```` ```coverage file=lcov.info ````,
```` ```problems ```` that render as live, styled views of what is ACTUALLY TRUE in the
workspace right now, auto-refreshing when the underlying data changes. Every README's
"project structure" tree and every runbook's "current test status" is stale a week after
writing — these never are, and they degrade to plain text on GitHub.

## Why novel

Obsidian Dataview queries the note vault; nobody renders IDE/workspace truth (tests,
coverage, diagnostics, git log) inside a markdown doc. Security posture is honest by
design: **strictly declarative READERS — no command execution ever** (unlike 238), reads
confined to workspace roots, output read-only, CSP prevents any phoning home. Residual
risk is display-only — same trust level as opening the repo at all.

## Feasibility on our assets

`engine-registry.ts` is explicitly the single-source descriptor table — "host-fed engines"
are data + one renderer; `wiki-cache.ts` is the exact fs-watcher precedent; git data rides
the git-diff.ts path; ```problems is `vscode.languages.getDiagnostics`; junit/lcov parsing
is dependency-free host code; a coverage bar can even render through echarts.

## Honest value

**Highest daily-driver value of the whole creative batch**: living READMEs, runbooks and
status docs are a chronic, universal pain. Each fence type is small and independently
shippable — adopt could mean "dir-tree + git-log first, rest on demand".

## Decision

- [ ] **ADOPT** → start with 2 fence types as the pattern-prover
- [ ] **PARK** — reason: _______
