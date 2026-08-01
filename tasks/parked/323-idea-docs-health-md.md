# Task 323 — docs-health.md: the dashboard that is itself a document [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

One command generates/refreshes a `docs-health.md` in the vault: a coverage TREEMAP of
your source tree coloured by "how many docs cite this directory" (the inverse of orphan
detection — code nobody documented), a freshness histogram, an overdue-review table, an
ownership breakdown. Documentation health stops being invisible or living in a SaaS panel
nobody opens: it's a plain committed markdown file whose echarts/mermaid fences our own
engines render — **and `git log docs-health.md` becomes the historical record of your doc
health**. GitHub renders the mermaid parts too.

## Why novel

Docs platforms put health in web dashboards; making the report a first-class, diffable,
committable markdown DOCUMENT rendered by the editor's own engines is an inversion nobody
ships. "Your doc health has a git history" is a genuinely new property.

## Feasibility on our assets

Inputs come from wiki-cache (doc↔link index), the 308 front-matter scan, a host fs walk;
the report body is just generated fences — the 18-engine registry renders them with zero
new webview code; lute-host can even VERIFY the generated doc renders before writing.
Distinct from 268 (vault-internal orphans/dead-links) — this maps docs AGAINST CODE.

## Honest value

High demo-wow (a self-rendered treemap of undocumented code is a screenshot machine) +
decent recurring value as a monthly team ritual. Also dogfoods our own renderers.

## Decision

- [ ] **ADOPT** (best after 308 stage 1-2 provide freshness data)
- [ ] **PARK** — reason: _______
