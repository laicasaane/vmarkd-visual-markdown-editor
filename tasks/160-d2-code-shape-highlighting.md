# Task 160 — D2 `shape: code` syntax highlighting

> **Status:** 💡 idea / planned (medium) — created 2026-06-27 from the `main.go` export audit.
> **✅ Unblocked — `D2Shape.language` is exported** (task 154 already added it for block-string langs
> incl. code shapes; [task 159](159-d2-wasm-export-batch.md) confirmed it on the contract, 2026-07-05).
> No WASM work remains; only the `toSVG` highlighting (step 2 below). Builds on task 104 and the
> shape:text/code rendering from task 124 Phase A.

## Problem
A D2 `shape: code` block (or a fenced ` ```lang … ``` ` code shape) renders as **plain monospace
text** in our pipeline — no token colours. Real d2 syntax-highlights code shapes (via chroma) using
the block's language. We drop the language and never colour the tokens, so a code shape looks like an
undifferentiated grey panel of text.

## Root cause
1. ~~`main.go` doesn't export the object's `Language` attribute~~ — **RESOLVED: `D2Shape.language`
   is exported** (task 154 / confirmed by [task 159](159-d2-wasm-export-batch.md)). This step is done.
2. `toSVG` in `media-src/src/d2-render.ts` renders `shape === 'code'` as `\n`-split `<tspan>` rows in a
   single colour (`textShapeBox` / `CODE_FONT`), with no per-token colouring.

## Approach
1. Consume `Language` from task 159 on the code shape (`D2Shape.language`).
2. In the `toSVG` code-shape branch, highlight the source and emit coloured output. Two options
   (decide in the task; note the tradeoff):
   - **A — `<tspan>` per token (portable):** run the source through **highlight.js** (already
     eager-loaded in the webview — see the WYSIWYG code-highlight work), walk the hljs token tree, emit
     one `<tspan fill="…">` per token using the active hljs theme's colours. Pure SVG → survives the
     diagram zoom/pan + any SVG export. More code (token→colour walk, line layout).
   - **B — `<foreignObject>` with `<pre><code class="hljs">`:** drop the highlighted HTML into a
     `foreignObject` and let the existing hljs theme CSS colour it. Far less code, exact parity with
     code-block rendering — but `foreignObject` doesn't render in static SVG export and can interact
     oddly with the transform-based zoom; verify in the real webview.
3. **Theme:** follow the active hljs theme the same way code blocks do (`autoCodeStyle` /
   `src/theme-registry.ts`) so the colours match the rest of the document and react to a theme flip.
4. Keep the non-`code` `shape: text` path unchanged (prose, not code).

## Risks / notes
- SVG syntax highlighting is the meat here — option A is correct-but-fiddly, option B is cheap-but-has
  SVG caveats. Prototype both on one block before committing.
- Sizing already exists (`textShapeBox` for `code` uses a monospace estimate) — colouring must not
  change the box geometry.
- hljs is bundled + eager-loaded; **no new dependency**.

## Tests (per AGENTS)
- **unit** (`d2-render`/`toSVG`) — a `shape: code` with `language: js` emits multiple coloured spans /
  the highlighted structure (not a single-colour text run).
- **e2e** (real-VS-Code) — a D2 code shape renders coloured tokens, and the colours track a content-
  theme flip (mirror `flowchart-theme.spec.ts` / `vega-theme.spec.ts`).
- Verify coverage of the new branch.

## See also
- **Task 159** (exports `Language` — hard dependency), task 124 (shape:text/code rendering), task 104.
- `media-src/src/d2-render.ts` (the `shape === 'code'` branch, `textShapeBox`, `CODE_FONT`),
  `src/theme-registry.ts` (`autoCodeStyle`), the WYSIWYG code-highlight work (hljs eager-load).
- Skill `vmarkd-renderer-theming` (code blocks = highlight.js, theming model #2).
