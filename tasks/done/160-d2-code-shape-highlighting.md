# Task 160 — D2 `shape: code` syntax highlighting

> **Status:** ✅ DONE — 2026-08-11.
> `D2Shape.language` was already exported by task 154/159. This task adds portable SVG token
> highlighting in the renderer and ensures highlight.js is ready before D2 code shapes render.

## Problem
A D2 `shape: code` block (or a fenced ` ```lang … ``` ` code shape) renders as **plain monospace
text** in our pipeline — no token colours. Real d2 syntax-highlights code shapes (via chroma) using
the block's language. We drop the language and never colour the tokens, so a code shape looks like an
undifferentiated grey panel of text.

## Root cause
1. ~~`main.go` doesn't export the object's `Language` attribute~~ — **RESOLVED: `D2Shape.language`
   is exported** (task 154 / confirmed by [task 159](159-d2-wasm-export-batch.md)). This step is done.
2. `textCode` in `media-src/src/diagrams/d2/d2-svg-shapes.ts` rendered `shape === 'code'` as `\n`-split `<tspan>` rows in a
   single colour (`textShapeBox` / `CODE_FONT`), with no per-token colouring.

## Approach
1. Consume `Language` from task 159 on the code shape (`D2Shape.language`).
2. In the SVG code-shape branch, highlight the source and emit coloured output. Two options
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
- **Chosen: A.** The renderer converts highlight.js's span-only result into SVG `<tspan>` tokens. Each
  token retains its `hljs-*` class and sets `fill="currentColor"`, so the active highlight.js CSS controls
  SVG colour too. This keeps zoom/pan and SVG export portable; no `foreignObject` is introduced.
- `renderD2` waits for the existing highlight.js loader only when a graph has a language-tagged code
  shape. A failed/unavailable language retains the previous plain-monochrome path.
- Sizing already exists (`textShapeBox` for `code` uses a monospace estimate) — colouring must not
  change the box geometry.
- hljs is bundled + eager-loaded; **no new dependency**.

## Verification
- Unit: `d2-render.test.ts` pins `hljs-keyword` and `hljs-number` SVG token spans; `d2-wasm.test.ts`
  pins the block-string language contract. D2 suite: 12 files / 243 tests.
- Real VS Code: `d2-code-highlight.spec.ts` confirms token spans render and their computed fill changes
  between `github-dark` and `material-dark`: 1 passed.
- `node build.mjs`, D2 typecheck, Biome, and `git diff --check` pass.
- `npm run quality`: lint, knip, jscpd, dependency-cruiser, coverage (201 files / 2891 tests), and
  coverage-module ratchet pass. `npm audit` alone was blocked by `EAI_AGAIN registry.npmjs.org`.

## See also
- **Task 159** (exports `Language` — hard dependency), task 124 (shape:text/code rendering), task 104.
- `media-src/src/diagrams/d2/d2-svg-shapes.ts` (the `shape === 'code'` branch, `textShapeBox`, `CODE_FONT`),
  `src/theme-registry.ts` (`autoCodeStyle`), the WYSIWYG code-highlight work (hljs eager-load).
- Skill `vmarkd-renderer-theming` (code blocks = highlight.js, theming model #2).
