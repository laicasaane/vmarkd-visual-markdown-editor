# Task 301 — Diagram Diff Lens [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative-audit proposal
(192 §13, wf_aaa4cd22-222); NOT scheduled, no commitment. If adopted → promote to a scoped
task; if parked → record why in Decision below.

## What it is & the effect

When git says a diagram fence changed, today you read cryptic text-diff lines
(`-A-->B / +A-->C`) and re-render the picture in your head. This puts a lens button on the
change gutter of any diagram fence: click it and the OLD and NEW diagrams render side by
side (or onion-skinned with an opacity slider) — added nodes/edges glow, removed ones are
ghosted. Reviewing a teammate's architecture change becomes looking at two pictures.

## Why novel

Nobody ships rendered diagram diffs in an editor: GitHub renders mermaid but diffs it as
raw text; Mermaid Chart (SaaS) has version history but no visual node-level diff. Doing it
offline, across mermaid/d2/graphviz/plantuml, inline — unclaimed territory.

## Feasibility on our assets

Almost free at v1: `src/git-diff.ts` already fetches the HEAD blob (vscode.git API) and the
diff gutter on the fence is SHIPPED; `md-scan.ts` extracts the old fence text; both versions
render through the same engines — and the task-184 cache is keyed on SOURCE TEXT, so the
pre-edit SVG is usually already on disk. Node/edge highlight = SVG postprocessing on markup
we control. Shares its render-both core with 302 (Time Machine).

## Honest value

Both kinds: real daily value for anyone versioning architecture docs AND the single best
demo the extension could have. Best wow-per-engineering-hour of the whole creative batch.

## Decision

- [ ] **ADOPT** → scope as: v1 side-by-side render on gutter click (no highlight), v2
      onion-skin + node-level add/remove highlight per engine family.
- [ ] **PARK** — reason: _______
