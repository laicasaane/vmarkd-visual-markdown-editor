# ADR-0003 — CSS theming architecture: mechanism routing + per-surface contracts

- **Status:** Accepted
- **Date:** 2026-06-13
- **Tags:** css, theming, vditor, build, architecture
- **Related:** tasks 84/85 (the `--vmarkd-*` palette tokenization), task 109 (tokenize github content themes), `media-src/src/main.css`, `build.mjs` (`varifyVditorPalette`, `patchVditorIndexCss`)
- **Note:** ADR-0001/0002 cover the Marp feature and currently live on a separate branch; the numbering is project-global.

## Context

`media-src/src/main.css` is ~900 lines with ~62 `!important`. This reads as "too much hacking," but the cause is structural, not sloppiness:

- vMarkd renders Markdown via **Vditor**, embedded in a **VS Code webview**, with our own editor features layered on top. We therefore fight *other people's* CSS: Vditor ships its own structural + content-theme CSS, and VS Code **injects default CSS** into every webview (bare-element styles via `--vscode-*`).
- The github↔Vditor *cascade-order* war (equal-specificity `.markdown-body` vs `.vditor-reset` ties) was **already solved** by migrating Vditor's content-theme palette to `var(--vmarkd-*, default)` (tasks 84/85) — themes set tokens instead of out-ranking rules. Spike-verified (task 109): the remaining `main.css` `!important` are NOT github referees.
- The remaining `!important` fall into three irreducible-by-default categories: **(1) VS Code injected-default neutralizers** (e.g. neutralizing the webview's `blockquote` background), **(2) IR/WYSIWYG edit-surface** rules (dual-node anti-jank / anti-glitch), **(3) layout/geometry/features** (full-width, tables, Edit↔Preview geometry).
- Decision taken alongside this ADR: **we drop Edit↔Preview spacing parity** — IR/WYSIWYG may have roomier block spacing than the preview/render; we only require no jank and no glitches while editing.
- We already patch Vditor's *TypeScript* at build time (esbuild `onLoad`) and rewrite Vditor's content-theme *CSS* at build time (`varifyVditorPalette`); a Vditor **fork** is on the table. So patching Vditor's own CSS at the source is a legitimate, established tool — not a hack.

## Decision

Adopt two organizing principles and a file structure.

### 1. Per-surface contracts (stop conflating edit with preview)

Two distinct surfaces, two explicit contracts — stop writing rules that force `edit == preview`:

- **Render / Preview surface** — the GitHub-fidelity target. Palette via `--vmarkd-*` tokens, structure from Vditor + small deltas (e.g. heading scale). "Looks like GitHub" lives here.
- **Edit surface (IR / WYSIWYG)** — optimized for editing, NOT for matching the preview. Contract: no jank (no reflow/scroll-jump on caret enter/leave or expand/collapse), no glitches (no phantom strut space), readable while editing. Block spacing may be roomier than preview.

### 2. Mechanism routing (route each styling need to the right home; minimize `main.css` overrides)

Four mechanisms, with a decision rule applied to every new styling need:

| Need | Mechanism | Why |
|---|---|---|
| Colour / palette value | **`--vmarkd-*` token** (theme file sets it) | no cascade fight |
| Change a rule **originating in Vditor** | **build-time Vditor source-patch** (`build.mjs`, e.g. `patchVditorIndexCss`) | clean, no `!important`, anchor-asserted (fails the build on drift) |
| Beat a **VS Code injected default** | **`main.css` `!important`** | the only place — it's neither our CSS nor Vditor's |
| Our own feature / geometry / edit-surface anti-jank | **`main.css`** (scoped; `!important` only to beat Vditor's inline/computed values) | it's our logic |
| Behaviour (not CSS) | **esbuild TS patch** | — |

**Consequence of the rule:** the more Vditor-origin fixes move to source-patches and palette to tokens, the more `main.css` shrinks to exactly the three irreducible categories — and every remaining `!important` is either genuinely unavoidable (VS Code) or self-evidently ours.

### 3. `main.css` organized into labeled sections by contract

A flat file becomes explicit sections, each with a header stating *antagonist / mechanism / whether its `!important` is load-bearing and why*:

```
header: the 4 mechanisms + the routing rule + the per-surface split
1. Token bridge          (body.markdown-body → --vmarkd-*, shared by all themes)
2. VS Code neutralizers  (!important LOAD-BEARING — beats host-injected CSS)
3. Render/Preview        (GitHub fidelity: tokens + structure + deltas)
4. Edit surface IR/WYSIWYG (anti-jank / anti-glitch — explicitly NOT preview-parity)
5. Layout & features     (full-width, tables, geometry)
```

### 4. `build.mjs` "Vditor-origin CSS rewrites" as a first-class mechanism

`varifyVditorPalette` + `patchVditorIndexCss` (and future ones) form a documented section: the **preferred home for changing Vditor's own CSS rules**, instead of `!important` overrides in `main.css`. Each rewrite is anchor-asserted so a Vditor version bump fails the build loudly.

## Alternatives considered

- **CSS Cascade Layers (`@layer`)** — rejected. Source-patches handle "ours-vs-Vditor" more cleanly (at the source), and the dominant antagonist — VS Code's **unlayered** injected CSS — beats any layered rule, so `@layer` can't retire the largest `!important` bucket. Tokens + source-patches win.
- **Naive `!important` removal** — rejected. Spike-verified that the remaining ones are load-bearing (VS Code defaults / anti-jank / geometry); removal regresses.
- **Keep shipping the full verbatim github-markdown-css** — rejected (task 109): ~23 KB per theme + its own `!important`, and a second incompatible model vs the token themes.
- **Shadow DOM / scoping** — rejected. Vditor doesn't use it; retrofitting would break the whole editor.

## Consequences

- **+** Every `!important` is either routed away (token / source-patch) or justified by its section's documented contract; `main.css` becomes self-documenting and shrinks over time.
- **+** Edit and Preview are decoupled — no more chasing parity; the edit surface is free to be editing-optimized, the preview free to be GitHub-faithful.
- **+** Vditor-origin fixes have a clean home (build-time source-patch) instead of `!important` arms races.
- **−** Relies on patching Vditor's source (CSS + TS) — anchor-drift risk on a Vditor bump, mitigated by build-time asserts; a fork is the accepted long-term backstop.
- **−** The VS Code-neutralizer, geometry/feature, and edit-surface anti-jank `!important` **stay** — they are irreducible by these levers. This ADR makes them legible, not gone.
- **−** Requires discipline: new styling goes through the routing rule, not straight to a `main.css` `!important`.

## Follow-ups (not this ADR)

- Audit edit-surface (section 4) rules under the dropped-parity contract: split each into anti-jank/anti-glitch (keep) vs pure static `edit == preview` equalizer (drop). Per-rule test: "if removed, does it jank, or just render with larger static spacing?"
- Reorganize `main.css` into the labeled sections above.
- Continue tokenizing themes (github-dark) and moving Vditor-origin fixes to source-patches as they come up.

## Amendment 2026-07-27 — routing-rule compliance audit (task 402)

**New baseline:** `main.css` is 1705 lines / 78 `!important`, up from **1009 lines / 71
`!important`** at the exact ADR-0003 commit (`d89c53f`, 2026-06-13) — this ADR's own
"~900/~62" was a rough estimate at authoring time, not the committed figure; `d89c53f`
is the precise diff baseline used below. Six weeks of diagram-engine work (wavedrom,
nomnoml, geojson/topojson, vega/vega-lite, stl, d2, callouts, html-comment previews)
account for essentially all of it: **+696 lines (+69%) vs only +7 `!important` net
(+10%)** — the routing rule is doing its job: the growth is overwhelmingly
non-`!important` CSS (new selectors, tokens, `@font-face`, plain layout), not new
overrides.

**Classification of the 8 new `!important` declarations** (net +7 after 1 removal) against
the routing table:
- **2 — VS Code injected-default neutralizers** (category 1, irreducible): stripping the
  injected `<code>` foreground/background from SMILES's `<code class="language-smiles">`
  wrapper, and from the html-comment preview's `<pre>`.
- **5 — our own feature / edit-surface anti-jank** (category 2/3, irreducible): the
  html-block comment phantom-height fix (`content: none !important`), the full-preview
  single-scroller overflow/height/padding trio (a refactor of 3 pre-existing `!important`
  lines to be width-agnostic, not new count), and the html-block expanded-source
  background reset.
- **1 borderline, flagged (not fixed here):** `pre > code:is(.language-echarts,
  .language-mindmap) { height: auto !important }` overrides a **Vditor-authored** CSS rule
  (`index.css`'s `.language-echarts, .language-mindmap { height: 420px }`) in the one
  layout Vditor's own cancel-rule doesn't reach (source `<pre>` isn't `:first-child` for a
  diagram block). Per this ADR's own routing table, a Vditor-originating rule should
  ideally be countered via `patchVditorIndexCss` (build-time source-patch), not a
  `main.css` override of Vditor's selector. Recorded as a candidate follow-up for whoever
  next touches `patchVditorIndexCss` — low priority: it's a single, thoroughly-commented,
  narrowly-scoped rule, not a repeating pattern.

**Section reorganization (checklist item):** `main.css` still has **no** labeled-section
structure (only one ad-hoc `── HTML comment previews ──` banner near the end) — this is
**not new drift**, it was already an open, un-scheduled follow-up in this ADR's own
"Follow-ups" list above (2026-06-13) and remains open. Not resolved by this audit; still
tracked there.

**Conclusion:** growth since 2026-06-13 is legitimate — new diagram-engine surface area,
not a bypass of the routing rule. No misrouted `!important` requiring an in-place fix was
found; one low-priority candidate (echarts/mindmap height) is flagged above for a future
`patchVditorIndexCss` pass. **This is the new checkpoint baseline for the next audit:
1705 lines / 78 `!important` as of 2026-07-27.**
