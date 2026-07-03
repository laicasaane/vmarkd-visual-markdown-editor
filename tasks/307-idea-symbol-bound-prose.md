# Task 307 — Symbol-Bound Prose: LSP-verified docs + doc-rot linter [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

Inline code mentions in prose (`` `parseConfig()` ``, `` `WriteBackController` ``) become
LIVE: hover shows the real current signature and doc-comment from the language server,
Ctrl+click jumps to definition — and if the symbol was renamed or deleted, the mention
gets a gentle squiggle: the doc has rotted. Engineering docs stop silently drifting;
stale names are flagged in the rendered doc before a new hire follows dead instructions.

## Why novel

Distinct from path-based transclusion (230): binds by SYMBOL NAME through the LSP, so it
survives file moves and needs no reference syntax — plain backticked prose becomes
verified. No markdown editor can do this (none sits next to a live LSP); even VS Code's
own preview doesn't.

## Feasibility on our assets

All host-side commands exist today: `executeWorkspaceSymbolProvider` to resolve,
`executeHoverProvider`/`executeDefinitionProvider` for content/navigation; wiki-cache is
the indexed-lookup precedent; decoration = the data-render observer pattern. Needs
false-positive heuristics (generic words) → start opt-in per doc.

## Honest value

Highest COMPOUNDING value for engineering orgs — doc rot is universal and invisible. Less
flashy than the time machines; the feature people would cite when recommending vMarkd.

## Decision

- [ ] **ADOPT** (opt-in per doc v1; pairs with the 308 freshness stack)
- [ ] **PARK** — reason: _______
