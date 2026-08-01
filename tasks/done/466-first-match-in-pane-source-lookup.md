# Task 466 — `nativeSourceForPane`'s `data-code` read takes the FIRST match in the pane, which is wrong for `.vditor-preview`

**Status:** 🟢 **DONE (2026-07-31).** Reproduced for `mermaid-retheme.ts` in the real VS Code
webview, fixed via a per-live-node entry point (`nativeSourceForLive`), red-then-green proven. The
other two "confirmed sites" (`render-cache-client.ts`) turned out to be NOT reachable today — see
"What was actually reachable" below — migrated defensively without changing their scope.
`flowchart-retheme.ts` doesn't call the shared helper at all and is also unreachable; left alone.
**Post-review:** 4 independent reviewers all flagged `nativeSourceForLive` as a byte-for-byte
duplicate of task 454's `resolveEchartsSource`; consolidated into `diagram-surfaces.ts` and
`echarts-retheme.ts` now shares it — see "Post-review consolidation" below. A pre-existing,
unrelated failure in `echarts-theme.spec.ts` was found and ruled out as caused by this task — see
"A pre-existing, unrelated failure found along the way" below. ·
**Impact:** 🟡 medium (wrong diagram redrawn on a theme flip, but only with 2+ diagrams of the same
lang in split/full Preview) · **Origin:** code reading during task 454's root cause, 2026-07-30.

## Problem

`media-src/src/native-offscreen.ts`'s `nativeSourceForPane` resolves a diagram's source like this:

```ts
const stamped = pane.querySelector(`.language-${lang}`)?.getAttribute('data-code')
if (stamped != null) return stamped
```

`querySelector` = the FIRST match inside `pane`. That is correct for `.vditor-ir__preview` and
`.vditor-wysiwyg__preview`, which wrap exactly ONE diagram each. It is **not** correct for
`.vditor-preview`: the full/split Preview surface is a SINGLE pane containing every diagram in the
document. With two or more diagrams of the same lang there, every one of them resolves to the
first one's source.

Callers affected: `mermaid-retheme.ts` (per-pane loop), and `render-cache-client.ts` in two places.

## Independently confirmed, with exact sites (2026-07-31)

An independent review of task 454's fix reached the same conclusion from the opposite direction —
that 454 "closes the bug for echarts only, not the class" — and grepped the surviving instances of
the identical `pane.querySelector('.language-X')` shape:

| file | line |
|---|---|
| `media-src/src/mermaid-retheme.ts` | 75 |
| `media-src/src/flowchart-retheme.ts` | 113 |
| `media-src/src/render-cache-client.ts` | 287 |
| `media-src/src/render-cache-client.ts` | 553 |

`flowchart-retheme.ts` was NOT in my original list — add it. Any of these silently redraws or
resizes only the FIRST same-language diagram in a `.vditor-preview` pane holding two or more.

Note the shape of the correct fix is already demonstrated: task 454 solved it for echarts by
iterating per-live-node and reading `data-code` off `live` itself, explicitly refusing to route
through `nativeSourceForPane` for exactly this reason. Follow that, rather than widening the pane
search.

## Why task 454 could not surface it

`test/vscode-e2e/fixtures/all-renderers.md` has exactly one diagram per language, so first-match and
correct-match are the same element. Task 454 fixed the echarts path by reading `data-code` off the
LIVE node it is already iterating (not via this helper), precisely to avoid this hazard — so 454's
own fix is not affected, but the helper it deliberately avoided still has the bug.

## Scope

- [x] Reproduce first: a fixture with TWO mermaid diagrams with visibly different content, opened in
      `sv` mode, theme-flipped — assert each keeps its own shape.
- [x] Give `nativeSourceForPane` a per-live-node entry point (the same shape task 454 used
      for echarts) rather than widening the pane search, and route the callers through it.
- [x] Unit test with two same-lang nodes in one synthetic `.vditor-preview`, each with its own
      `data-code`, asserting each resolves to its OWN source.

## What was measured

`all-renderers.md` §3 already had TWO mermaid diagrams (a `graph TD` flowchart and a
`sequenceDiagram`) — it just so happens no existing spec ever checked past the FIRST
`.language-mermaid` match in `.vditor-preview`, which is exactly why this was never caught despite
the fixture already containing the reproducing shape.

Extended `test/vscode-e2e/retheme-preview-surface.spec.ts`'s existing `sv`-mode theme-flip test
(fold-in, not a new `test()` — no extra VS Code boot) to tag+check the SECOND mermaid diagram
independently, plus a content-signature check (flowchart labels must not leak into the sequence
diagram's redraw and vice versa). Pre-fix run:

```
[412-preview] outcomes {"mermaid":"redrawn",...}   ← the FIRST mermaid only, via the old per-pane check
[466] second mermaid redrawn = false                ← RED: confirmed
Error: the SECOND mermaid diagram in .vditor-preview also redrew after the flip
Expected: true / Received: false
```

**Mechanism, more precisely than the filed premise:** the bug in `mermaid-retheme.ts` was not "both
diagrams resolve to the first one's source" — it was that the candidate-collection loop itself
(`for (const pane of panes) { const live = pane.querySelector('.language-mermaid'); ... }`) only
ever finds the FIRST `.language-mermaid` per pane, so for `.vditor-preview` (one pane, whole
document) only ONE mermaid diagram was ever collected as a re-render candidate at all — the second
was never even attempted, not mis-sourced. Net observable effect matches the filed impact (a second
same-lang diagram in Preview doesn't redraw on flip), just via "never touched" rather than
"redrawn with the wrong content".

**What was actually reachable, per caller (checked by reading each caller's own pane-scoping before
touching anything, then re-verified by re-running the real-VS-Code e2e for the demonstrated one):**

| caller | scope | `.vditor-preview` reachable? |
|---|---|---|
| `mermaid-retheme.ts` (`reRenderMermaid`) | `renderedDiagramPanes(editorEl)` — includes `.vditor-preview` | **YES — demonstrated, fixed** |
| `render-cache-client.ts:289` (`reportRenders`) | `nativePanes(root, lang)` → filters by `PREVIEW_PANE_SEL` = `.vditor-ir__preview, .vditor-wysiwyg__preview` only | NO — `.vditor-preview` is never in this loop's pane list |
| `render-cache-client.ts:555` (`reserveAndRequest`) | same `nativePanes`/`PREVIEW_PANE_SEL` scope | NO, same reason |
| `flowchart-retheme.ts` | its own inline sibling-search, scoped to `.vditor-ir__preview, .vditor-wysiwyg__preview` only (own header comment: "the standalone `.vditor-preview` pane ... re-renders via previewRender on its own") — doesn't call the shared helper at all | NO, and not even the same function |

So of the 4 "confirmed sites" the independent review listed, only `mermaid-retheme.ts` was actually
exercisable with the bug today. Per the task's own instruction ("if a caller already scopes
narrowly enough that the bug is unreachable in practice, say so and stop"), the other three were
**not given a fix for a bug that couldn't be demonstrated** — `render-cache-client.ts`'s two sites
were migrated to the new `nativeSourceForLive(live, lang)` primitive anyway (a same-behavior swap:
both call sites already had `live` resolved right above the old call, so this removes the latent
landmine for free without touching their pane-scoping), but `flowchart-retheme.ts` was left
untouched — it isn't even a call site of the shared helper.

## The fix

`media-src/src/diagram-surfaces.ts`: new `nativeSourceForLive(live, lang)`. Reads `data-code` off
`live` directly (correct by construction, no pane-wide query left to get wrong); falls back to the
sibling-editable-marker search (`blockScopeOf` + `RENDERED_DIAGRAM_PANE_SELECTOR`, both already
local to this module) for documents rendered before the stamp existed.

`mermaid-retheme.ts`: candidate collection changed from "one `pane.querySelector` per pane" to
`renderedDiagramTargets(editorEl, 'mermaid')` (already existed in `diagram-surfaces.ts`, built for
exactly this) — enumerates every `.language-mermaid` live node directly, so a `.vditor-preview` with
N mermaid diagrams yields N candidates, not 1.

`render-cache-client.ts`: both call sites swapped to `nativeSourceForLive(live, lang)` (behavior-
preserving today, given the table above; defensive against a future pane-scope widening).

**Post-review consolidation (2026-07-31):** the first pass landed `nativeSourceForLive` as a new
function in `native-offscreen.ts`. Four independent reviewers (reuse/simplification/efficiency/
altitude, run per the `simplify` skill) all flagged the same thing: it was a byte-for-byte
reimplementation of task 454's `resolveEchartsSource` in `echarts-retheme.ts` — same `data-code`
read, same pane lookup, same `blockScopeOf` call, differing only in a hardcoded `'echarts'` vs a
`lang` param. Consolidated per the altitude review's suggested shape: moved `nativeSourceForLive`
into `diagram-surfaces.ts` (which already owns "where can a rendered diagram live" —
`renderedDiagramTargets`/`renderedDiagramPanes`/`RENDERED_DIAGRAM_PANE_SELECTOR` all live there, and
`diagram-dom.ts`'s `blockScopeOf` has zero imports so pulling it in is acyclic), deleted
`resolveEchartsSource` from `echarts-retheme.ts` entirely, and routed both `reRenderEcharts` and
`reconstructCharts` through the shared function. `mermaid-retheme.ts`/`render-cache-client.ts`
updated to import it from `diagram-surfaces.ts` instead. Also fixed the smaller finding: `render-
cache-client.test.ts`'s `vi.mock` had hand-copied the block-wrapper selector and already drifted
(missing `.vditor-wysiwyg__block`) — since `diagram-surfaces.ts` has no heavy engine imports, the
mock no longer stubs `nativeSourceForLive` at all; the test now exercises the REAL function.

## Tests

- Unit (`media-src/src/diagram-surfaces.test.ts`, new file): `nativeSourceForLive` — two same-lang
  mermaid nodes AND two same-lang echarts nodes in a synthetic `.vditor-preview`, each resolving to
  its OWN `data-code` (the echarts case is the exact hazard task 454 sidestepped by not routing
  through this helper — now covered directly); the sibling-marker fallback for IR/WYSIWYG AND
  WYSIWYG blocks specifically (`blockScopeOf`'s `.vditor-wysiwyg__block` branch); returns `null` when
  neither exists.
- `render-cache-client.test.ts`'s `native-offscreen` mock simplified to drop the (now-drifted)
  hand-rolled `nativeSourceForLive` stand-in — the real `diagram-surfaces.ts` function is used.
- `echarts-retheme.test.ts` needed no changes — it tests `reRenderEcharts`/`reconstructCharts`'s
  public behaviour, not the internal resolver, so the consolidation is invisible to it (still green).
- Real-VS-Code e2e: folded into `retheme-preview-surface.spec.ts`'s existing `sv`-mode flip test
  (two additional tag/redraw + content-signature assertions for the fixture's pre-existing second
  mermaid diagram), moved AFTER the independent per-lang outcome assertions so an unrelated lang's
  flake can't mask a 466 regression (or vice versa).

**Red-then-green, real VS Code (re-run after the consolidation moved the fix into
`diagram-surfaces.ts`/`mermaid-retheme.ts`, since the earlier red-then-green targeted the
pre-consolidation file layout):** reverted `mermaid-retheme.ts`'s candidate loop to the pre-fix
per-pane-first-match shape (still calling `nativeSourceForLive` so only the collection logic was
under test) → `retheme-preview-surface.spec.ts` failed exactly as before (`second mermaid redrawn =
false`). Restored the fix, rebuilt → passed (`second mermaid redrawn = true`, all 5 langs +
content-signature checks green).

Gates run and green: `npm test` (168 files / 2394 tests), `npm run typecheck`,
`./node_modules/.bin/tsc -p tsconfig.json --noEmit`, `node build.mjs`, targeted coverage on
`diagram-surfaces.ts` (new `nativeSourceForLive` lines fully covered; the only uncovered lines,
39-42, are inside the pre-existing `renderedDiagramPanes`, untouched by this task), whole-project
`npm run test:coverage` (no threshold failures). `npm run lint:ci` has one pre-existing failure in
`test/vscode-e2e/anchor-links.spec.ts` — an untracked file from a different concurrent agent's
in-flight work (task 243), not touched by this change; every file this task touched is individually
`biome check` clean.

## A pre-existing, unrelated failure found along the way (NOT fixed here)

While re-verifying the echarts consolidation, `test/vscode-e2e/echarts-theme.spec.ts`'s **"chart +
mindmap background follows a live light->dark flip"** failed reproducibly (3/3 runs, low system
load, so not the D2-timeout style load flake seen elsewhere this session): `after.chart` read
`255,255,255` (stale light background) instead of `18,19,20` (dark) after a `theme.content`
config-driven flip. **Isolated and confirmed NOT caused by this task's changes**: temporarily
restored the exact pre-consolidation `resolveEchartsSource` body inline in `echarts-retheme.ts`
(bypassing `nativeSourceForLive`/`diagram-surfaces.ts` entirely) and the failure persisted
identically. The two functions are behaviourally identical (return `null` vs `undefined` on a miss,
both satisfy `== null` at every call site), so this rules out the dedup as the cause. Left
uninvestigated further — `echarts-retheme.ts` is under task 454's active concurrent work (this
session's task list shows it `in_progress`), and the failure is plausibly in the config-change
wiring (`message-router.ts`/`vditor-init.ts`/`finish-init.ts`, all showing unrelated uncommitted
diffs from other concurrent agents this session) rather than in `echarts-retheme.ts` itself.
**Flagging for whoever owns 454 or the config-wiring changes — not this task's to fix.**

## Out of scope

- The echarts path (task 454) — already fixed by reading off the live node; this task's fix follows
  that same pattern, and the post-review consolidation now shares one function with it.
- `flowchart-retheme.ts` — confirmed unreachable (see table above); left untouched.
