# Task 140 — PlantUML multiple diagrams / `newpage` in one block

> **Status:** ✅ DONE (2026-07-04) — Step 0 measured; the narrow real gap (several `@startuml` in one
> fence → only the first renders) is now flagged with a note instead of silently dropping diagrams.
> `newpage` already works (engine renders all pages). Created 2026-06-24; builds on 87.

## Outcome (2026-07-04)

**Step 0 — verified through the real engine** (fresh-import probe, each case isolated so task-347
stickiness can't confound):

| source | result |
|---|---|
| single `@startuml…@enduml` | 1 SVG ✅ |
| **two / three `@startuml…@enduml`** in one fence | **1 SVG — only the FIRST renders**; the rest dropped silently ❌ |
| **`newpage`** inside one `@startuml` | 1 SVG containing **all pages** ✅ (engine paginates natively) |

So the task's guess ("likely only first renders") was right ONLY for multiple `@startuml` pairs;
`newpage` (the more common multi-page need) already works. The real gap is narrow and rare (in Markdown
you normally give each diagram its own ` ```plantuml ` fence).

**Fix shipped — the minimal option (chosen by user): flag, don't silently drop.** The first diagram
still renders; when a fence holds >1 `@startuml`, a non-fatal info note is appended below it:
*"Only the first of N PlantUML diagrams is shown — put each @startuml…@enduml in its own code block."*
- `countPlantumlDiagrams(src)` (`plantuml-render.ts`) counts `@start…` openers at line-start (so
  `newpage` counts as 1, and `@start…` inside a note doesn't false-match); `>1` triggers the note in
  `themeOnce`, from the ORIGINAL source (before stdlib/theme injection).
- New reusable helper `media-src/src/diagram-note.ts` (`diagramNoteHtml` / `appendDiagramNote`) — a
  Lute-safe `data-render="1"` info-note twin of diagram-error/diagram-loading; **idempotent** (a prior
  note is removed first) so a live re-theme (`reRenderLang` clears + re-renders) re-adds exactly one.
- CSS `.vmarkd-diagram-note` in `main.css` (theme-var, info-coloured left border).
- NOT the full split (render every sub-diagram) — deliberate: rare case, and the note removes the only
  real harm (silent loss). Full splitting stays a possible follow-up if a real use-case appears.

**Tests:** unit `diagram-note.test.ts` (module 100%) + `countPlantumlDiagrams` cases in
`plantuml-render.test.ts` (single/multi/mixed-type/newpage/@start-in-note); real-VS-Code e2e
`plantuml-multidiagram.spec.ts` (multi-`@startuml` → first renders + the note; `newpage` → all pages +
NO note). All 8→9 PlantUML e2e specs + full unit (1308) + typecheck + `lint:ci` green.

## Problem
PlantUML supports multiple diagrams or pages in one source:
- several `@startuml … @enduml` pairs in a row, and
- `newpage` inside a single `@startuml` (multi-page output).
Our patched `plantumlRender` calls the TeaVM `render(lines, targetId, {dark})` once per ` ```plantuml `
block and assumes a single SVG. It's **untested** what happens with multi-page/multi-diagram source —
likely only the first page/diagram renders (the rest dropped silently).

## Step 0 — VERIFY
Feed a block with two `@startuml…@enduml` and one with `newpage` through our engine and observe: does
`render` emit one SVG (first only), all of them, or error?

## Approach (if only the first renders)
- Split the block source into individual diagrams (by `@startuml`/`newpage`) and render each into its
  own SVG, stacked in the wrapper (or paginate). Keep `data-code` per sub-diagram for re-theme.
- If the engine already emits all pages, just verify layout/scroll is sane and add a test.

## Decision gate
How common is multi-page PlantUML in a single Markdown code block? Likely rare. Default: verify + document;
implement splitting only if it's a real use case.

## Acceptance / tests
- A two-`@startuml` block renders both diagrams (not just the first); a `newpage` source renders all
  pages; single-diagram blocks unchanged.

## Related
Task 87 (engine + render call). `patchPlantumlRender` in `media-src/esbuild-shared.mjs`.
