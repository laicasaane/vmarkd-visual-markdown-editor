# Task 356 — Lute cost baseline (measured) + "can we speed lute up?" verdict

**Status:** 🔵 REFERENCE / DECISION (spike 2026-07-05). No work queued — records the numbers so nobody
re-measures, and the verdict: **the lute hot paths are already optimized; don't fork lute for load.**

## Measured baseline (real VS Code webview, 2307-line / 108 KB / 723-block doc, median of 9)
Raw `vditor.lute.<fn>` calls timed directly — this is the UN-optimized lute cost. The real editor pays
LESS on the typing path because 172/175/180 (below) sit in front of the spin.

| operation | cost | when it runs |
|---|--:|---|
| `SpinVditorIRDOM` — 1 paragraph | **0.9 ms** | per keystroke (block-scoped) |
| `SpinVditorIRDOM` — 1 heading | 0.4 ms | per keystroke |
| `SpinVditorIRDOM` — 500-line CODE block | **38 ms** | keystroke inside a huge code body |
| `SpinVditorIRDOM` — WHOLE doc (fallback) | 328 ms | rare: link-ref-def / footnote / no enclosing block |
| `Md2VditorIRDOM` — full doc | 107 ms | open (once; cached for repeat opens by [184]) |
| `Md2VditorIRDOM` — 20 lines | 1.4 ms | — |
| `VditorIRDOM2Md` — full doc | 305 ms | save (debounced on undoDelay; [69] serializes incrementally) |
| `lute.min.js` fetch | 165 ms, 3.66 MB | startup (+ ~150 ms GopherJS `$init` = ~300 ms one-time) |

## Key facts
- **`SpinVditorIRDOM` is BLOCK-scoped, not whole-doc** (input = edited block's `outerHTML`, not
  `ir.element.innerHTML`; whole-doc only on the `isIRElement` fallback). So per-keystroke cost scales
  with the EDITED BLOCK, not document length. A 2000-line doc with a short edited paragraph = 0.9 ms.
- **Prose typing is already cheap (0.9 ms).** Large-doc typing lag, when it happens, is the browser
  **DOM reflow (O(doc) layout/paint)**, NOT lute — a Vditor rebuild+reflow issue, not a lute one.
- **The spin cannot go incremental or off-thread** (synchronous GopherJS; Worker rejected in the
  webview; the `<wbr>` caret snapshot can't survive an async DOM swap; no JS sub-AST hook without
  forking GopherJS). The only spin wins are shrinking its INPUT or skipping it — both already shipped.

## The hot paths are ALREADY optimized (all DONE, always-on)
- **[172] strip the rendered preview SVG from the spin input** — a diagram block's `outerHTML` embeds
  its thousand-node rendered SVG; lute re-tokenizes it every keystroke then discards it (27–67 ms). 172
  empties the preview before the spin → **0.35 ms (~190×)**, byte-identical. Covers the 38 ms row for
  *diagram* blocks (a plain code block has no SVG → 175 covers it).
- **[175] skip the spin for non-structural keystrokes inside a fenced code/diagram BODY** → ~0 ms for
  typing inside a big code/diagram source (covers the 38 ms code-block row).
- **[180] defer the per-keystroke block rebuild for prose typing** → batches the (already-cheap) prose
  spin so a fast typist doesn't pay it per char.

## Verdict — is a lute speedup worth chasing? **No meaningful lever left.**
1. **Typing path**: optimized to the floor by 172 + 175 + 180. Nothing to add.
2. **Load (~300 ms one-time)**: a **TinyGo / Go-WASM** rebuild would shrink it, but that **forks the
   lute build** (API rewrite syscall/js, GopherJS→WASM, re-patch every bump) for a **one-time, bounded**
   win — the D2 TinyGo spike showed "smaller but NOT a drop-in". **Low ROI → PARKED.** Revisit only if a
   cold first-paint budget makes 300 ms matter (the host prerender [lute-host.ts] already hides `$init`
   behind an instant-paint teaser).
3. **Open parse (107 ms) / full serialize (305 ms)**: cold paths, already mitigated ([184] open cache,
   [69] incremental serialize).

## Related
Tasks 172, 175, 180 (the shipped spin optimizations), 69 (incremental serialize), 184 (open-render
cache), 182 (off-thread render — the diagram-engine lever, orthogonal to lute). Skill
`vmde-lute-features` (spin scope + Node-lute probe). Memories `prose-typing-lag-vditor-rebuild-reflow`
(the lag = reflow, not spin), `lute-runs-in-node`.

## Prior art — fork re-scan 2026-07-23 (task 358)

- `Cano1997/vditor` (60 ahead, most substantive vditor-side work of the window): large-code-block editing cost — drop the preview node in favour of a copy node, keep huge blocks preview-only/read-only, fix copy failing on very large blocks (`update: 代码块节点取消绘制preview，防止内容过多导致卡顿`, 2026-05-20…28). Independent confirmation of the 500-line-code-block spin cost measured here; if a big-code-block complaint ever comes in, this is the prior art.
- `huangko555` (see task 73) additionally moved markdown parsing for large documents into a **Web Worker** (`0.2.1: 大文档性能(Web Worker 解析)`) — a data point for the parked off-thread direction (task 182 for diagrams, 167/173-177 for prose).
