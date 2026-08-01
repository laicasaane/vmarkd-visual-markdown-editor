# Task 154 — D2 markdown labels (`|md|`) rendered formatted (foreignObject + Lute)

> **Status:** ✅ DONE (2026-07-02). `|md|` text shapes render formatted (headings, bold, lists,
> code chips, links, tables) in both layout engines, sized correctly, themed via currentColor.
> Two measure-vs-render traps found and fixed along the way (see *Findings*). Latex and
> inline-md-in-regular-labels stay plain text (explicit follow-ups below).
>
> Original framing: came out of the TinyGo d2-WASM slimming (`[[d2-wasm-tinygo-spike]]`): the
> compile-only WASM never emitted rendered markdown, and the TinyGo build dropped d2's Go
> `RenderMarkdown` entirely — so this is the JS-side replacement, where it belongs in our
> architecture (WASM = structure, JS = render).

## Problem (was)

D2 compiles `note: |md … |` to a shape with `shape: "text"`, `language: "markdown"` and the raw
markdown source as the label. Our renderer drew every label as a plain, XML-escaped SVG `<text>`
— so a `|md|` block showed up as literal `# Heading - **bold** …` with no formatting. This was
never rendered formatted, even with the stock-Go WASM (its rendered-markdown output was never
marshalled) — this task is the feature we never had.

## Shipped implementation

1. **WASM** (`media-src/vendor/d2/build/main.go`): `outShape` gains
   `Language string json:"language,omitempty"` ← `o.Language` — `"markdown"` for `|md|`
   (d2 aliases `md`→`markdown`, `go`→`golang`, …; latex/code tags pass through for future use).
   Rebuilt with the pinned toolchain (TinyGo 0.41.1 / Go 1.25.0, cached under
   `tmp/tinygo-spike/`); 1.74 MB, `source.json` sha updated.
   `D2_VER = '0.1.33-lang1'` — the `-langN` suffix is OUR entrypoint's schema revision and busts
   the webview HTTP cache when main.go marshals new fields WITHOUT a d2 bump (the pin test
   allows `version(-rev)?` but still locks the base to source.json).
2. **Enrichment before layout** (`custom-diagrams.ts` `enrichMarkdownLabels(graph, near)`,
   called by `renderD2` after `unsupportedReason`): for each `shape==='text' &&
   language==='markdown'` shape, render the label with a **fresh module-cached `Lute.New()`**
   (NOT the editor's `vditor.lute` — that carries vMarkd's JS renderText hooks) and measure the
   HTML offscreen → `s.mdHtml` + `s.mdSize`. The probe mounts inside the wrapper's
   `.vditor-reset` (same cascade as the final render) at `width:max-content; max-width:420px`.
   `document.fonts.load('16px "Source Sans 3"')` is awaited first (lazy @font-face otherwise
   drifts the measure — see Findings). Lute missing → fields absent → pre-154 plain-text render
   (graceful, logged).
3. **Render** (`d2-render.ts` `toSVG`): enriched shapes emit
   `<foreignObject … overflow="visible"><div class="vmarkd-d2-md" style="width:{mdSize.w}px;
   padding:4px;color:…">{mdHtml}</div></foreignObject>` instead of `<tspan>`s; `leafInfo` sizes
   the node from `mdSize + 2*TEXT_PAD`. The explicit-style box rule (fill/stroke → rect behind)
   is preserved — the fixture's styled `boxed: |md **…** |` shape keeps its green box.
   Covers **both** engines (elk-layout imports `leafInfo`/`toSVG`).
4. **CSS** (`main.css` `.vmarkd-d2-md`): Source Sans 3 @ 16px/1.35 (mirrors
   `FONT_SIZE`/`PROSE_LH`/`D2_FONT_STACK`), compact block margins, scaled headings, code chip /
   pre / table / blockquote accents via `color-mix(… currentColor …)` — theming model #1
   (currentColor, like KaTeX), so labels follow the content theme with no re-render plumbing.
   The render cache (task 184) stores the SVG string incl. the foreignObject — restores fine.

## Findings (the fiddly part, measured in the real webview)

- **`.vditor-reset` is `white-space: pre-wrap`** (the editor surface preserves whitespace):
  Lute's inter-element newlines (`<ul>\n<li>…`) became REAL line boxes in any context that
  didn't reset it — the measure probe read ~93 px of phantom height (3-item list measured 159 px
  vs 73 px rendered). Fix: `.vmarkd-d2-md { white-space: normal }` — normalizes measure AND
  render in every mount. (Diagnosed child-by-child after per-element computed styles came back
  identical; classic no-DOM-rect phantom geometry.)
- **Lazy @font-face drift**: the first measure ran before Source Sans 3 loaded → fallback-font
  `max-content` 219 px vs 169 px once loaded (box too wide, then clipped after reflow). Fix:
  force `document.fonts.load('16px "Source Sans 3"')` before measuring.
- **foreignObject clips by default in chromium** — `overflow="visible"` on the element is the
  safety net against sub-pixel measure/render drift scissoring the last line.

## Decision gates (resolved)

- **Raster/export caveat:** ACCEPTED formatted-on-screen-only. No d2 raster/export path exists
  today (task 159 unshipped); `<foreignObject>` is unreliable under `canvas.drawImage`
  rasterisation — if an export path ever ships, flatten md labels to `<text>` for it (documented
  in the toSVG comment).
- **Sizing pass cost:** one offscreen probe per md node per render — imperceptible (few nodes).
- **Scope:** `|md|` text shapes only. Inline markdown in regular node labels and `|latex`
  (KaTeX) are follow-ups; both still render as plain text.
- **CSP:** none needed — inline HTML in foreignObject is plain DOM; no new holes.

## Acceptance / tests

- [x] Unit (`d2-render.test.ts`, describe "|md| markdown labels via foreignObject"): enriched
  shape emits foreignObject + raw Lute HTML (h1/strong) and NOT `<tspan>`; node box =
  `mdSize + 2*TEXT_PAD` (128×72 / 308×208 for two sizes); UNenriched md falls back to plain
  text; styled md keeps the box; not flagged unsupported.
- [x] Unit (`d2-wasm.test.ts`): real rebuilt WASM compiles `|md|` → `shape:'text'` +
  `language:'markdown'`; plain label → no language; `|go` → `'golang'` (alias expansion).
- [x] Unit (`custom-diagrams.test.ts`, describe "enrichMarkdownLabels"): Lute-stub attaches
  mdHtml + floored mdSize to |md| text shapes ONLY; without `window.Lute` the graph is
  untouched. Coverage of the new lines verified via the JSON report.
- [x] Node measurement feeds layout: verified in the real webview — foreignObject 227×125 vs
  rendered content 227×123 (scrollHeight equal, nothing clipped), diagram viewBox tightened
  400→266 after the white-space fix.
- [x] Real-VS-Code e2e (`d2-feature-parity.spec.ts`): the fixture's `notes:` block renders with
  h1/strong/li/link inside a foreignObject, no raw `**`/`#` markers leak, ≥2 md nodes formatted
  (the styled boxed one too), at real size (w>60, h>40). Fixture: new §18 block in
  `all-renderers.md`. Whole affected battery green: d2-feature-parity, parity, custom-diagrams-
  render, wavedrom-theme; full unit suite 1167/1167; lint gate clean.
- [x] GFM showcase (user request, 2026-07-02): two more §18 fixture blocks demonstrate the full
  surface — a `||md` DOUBLE-pipe fence with a real md TABLE (single `|` would close the block
  string), blockquote with em/del/strong, ordered list, GFM task-list checkboxes, an indented
  code block, and a md label INSIDE a container targeted by an edge. `d2-feature-parity` now
  asserts each feature class renders (`mdGfm`: table/blockquote/ol/del/checkbox/pre across ≥6
  md nodes). Verified by screenshots in the real webview (dark).
- [x] Raster-export behaviour decided + documented (above).

## Follow-ups (not this task)

- `|latex` labels via KaTeX (same enrichment seam; KaTeX HTML output + measure).
- Inline markdown in regular node labels (d2 allows it; needs a marshalled flag or JS-side
  parse policy).

## Related

Tasks 104 (d2 renderer), 124 (feature parity — split this out), 159 (export batch — the raster
caveat's future consumer). Spike `[[d2-wasm-tinygo-spike]]`. Files: `media-src/vendor/d2/build/
main.go`, `media-src/src/{d2-wasm,d2-render,custom-diagrams}.ts`, `media-src/src/main.css`,
`test/vscode-e2e/{d2-feature-parity.spec.ts,fixtures/all-renderers.md}`. Skill:
`vmarkd-renderer-theming` (foreignObject = theming model #1, currentColor).
