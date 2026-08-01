# Task 170 — Host-preload heavy diagram-engine scripts on full-content fence detection (spike-first)

**Status:** ❌ **KILLED / WONT-FIX (2026-07-05, spike done)** for the preload proposal — but keep the small
**bonus** (hljs full-content gate, see below). The engine-script parse IS a real cost (not just download),
so the "download-only → kill" criterion is technically not met — yet host-preload is the **wrong lever**:
it just relocates the parse to delay the editor mount, and the perceived paint is already masked. The
per-render parse block is task 182's (off-thread) domain.

## Spike result (real VS Code, headless — measured 2026-07-05)
Mermaid-heavy fixture (5 mermaid + 1 code), longtask `PerformanceObserver(buffered)` + Resource-Timing +
an isolated `new Function(text)` compile timing:
- **`mermaid.min.js` (3.2 MB): download 187 ms** (local disk) **+ a ~204 ms execution longtask** (parse +
  compile + top-level run); isolated **compile ≈ 96 ms**. So the parse is real and comparable to the
  download — **NOT download-only**.
- The parse is on the critical path to first render (must run before `window.mermaid` exists), and fires
  **late** (~800 ms, after Lute/main.js are resident, when `Ee` lazy-loads it at first render).
- **BUT code colouring is @48 ms and (per the task-169 spike) IR content is painted @48–257 ms** — the
  ~204 ms parse delays only *the diagram appearing*, never perceived first-paint.

**Why KILL the preload:**
1. **Masking decides it against preload.** Content is on screen instantly (inline-init 38 + teaser 50), so
   the parse-before-first-render only postpones the diagram — not the perceived paint.
2. **The safe variant (blocking `<script>` before main.js) is net-negative.** It moves the ~204 ms parse
   *ahead* of the editor mount → the whole editor appears ~200 ms LATER for **every** mermaid doc, trading
   "diagram fills in at ~0.5 s while you already read the text" for "editor is blank ~0.2 s longer." Worse UX.
3. **It's the off-thread problem.** A parse that blocks first render is exactly what **task 182** removes;
   reordering the load can't (single main thread either way). Same conclusion as the task-169 spike.
4. `rel=preload` (the non-crashing async variant) only warms the local-disk read (187 ms) → marginal, as
   the review already flagged.

## ✅ DONE — the bonus (2026-07-05, shipped with task 166)
The hljs preload gate tested only the truncated `preRenderedHtml` prefix, so a code fence below
`MAX_PRERENDER_CHARS` was missed → its colouring fell back to the slow defer path. Fixed: a new exported
`hasCodeFence(markdown)` in `html-builder.ts` (fenced ```/~~~ or raw `<code>/<pre>`; inline single-backtick
code intentionally excluded) is run over the FULL `document.getText()` at the `buildWebviewHtml` call site
(`extension.ts`) and passed as `docHasCodeFence`; the gate uses it (falling back to the old truncated-HTML
probe when the flag is absent). Unit-tested in `html-builder.test.ts` (incl. a fence past 10 k chars).

---

## (Original TODO plan — kept for the record; the preload is superseded by the KILL above)
**Status was:** TODO (big / **spike-first — do NOT ship as originally written**; measure that parse-during-render-burst is the real stall before committing).
**Source:** vMark perf analysis (2026-06-28, 39-agent workflow `wf_19aa433d-4fa`).
**Value / Risk:** 🟨 medium *conditional* (moves the heavy engine script's execution-ordering earlier, like the shipped hljs preload) / 🟡 medium (a blocking 3.2 MB mermaid parse before main.js taxes **every** mermaid doc's editor mount — only a win if the user is looking at a diagram immediately).
**Engines:** mermaid (3.2 MB), echarts.

## Problem

Only hljs is preloaded before main.js today — a **blocking** `<script>` placed before the bundle,
gated on a code fence in the prerendered HTML (`src/html-builder.ts:201-211`). Task 145 measured its
win: first code colour ~4.8 s (defer) → **~1.3 s** (host preload). Crucially, task 145 states the
gain was **execution ordering** (pre-defining `window.hljs` before the render burst), **not**
download — "`addScript` is async and does NOT block first paint, so deferring only pushed colouring
behind the diagram burst."

The heavy engines (mermaid/echarts) instead lazy-load at first render via Vditor's async loader `Ee`
(`media/dist/main.js`): `Ee(\`${cdn}/dist/js/mermaid/mermaid.min.js?v=11.15.0\`, "vditorMermaidScript")`
/ `…echarts.min.js?v=6.1.0`. So the multi-MB file read + parse starts **late** and serially after
Lute is resident.

## ⚠️ Why it can't ship as proposed (review findings)

- **`rel=preload` doesn't replicate the hljs win.** It warms the (local-disk) cache by URL only — it
  does **not** define the global. The resource is served from `vscode-resource` (local disk), so
  "idle network during Lute boot" is a misframe; the saved cost is a local file read, not a network
  download.
- **An id-matched ASYNC `<script>` is a RACE / crash.** `Ee`'s dedup resolves its promise
  immediately when `document.getElementById(t)` is truthy, but `Ee` sets the id only `onload` — so an
  async host tag with the same id makes `Ee` resolve before `window.mermaid` exists →
  `mermaid.initialize()` runs on `undefined` → ReferenceError.
- **The only safe, win-replicating variant is a BLOCKING id-matched script before main.js:**
  `<script id="vditorMermaidScript" src="${vditorBaseUri}/dist/js/mermaid/mermaid.min.js?v=11.15.0">`
  (fully executed before main.js → id present **and** `window.mermaid` defined when `Ee` runs). The
  `?v=` query must match the `Ee` fetch **exactly** (a version coupling to keep in sync, like the
  hljs `?v=11.7.0` precedent).

## Spike (do this FIRST)

Extend `test/vscode-e2e/perf-timeline.spec.ts` to a **mermaid-heavy** fixture and confirm
first-mermaid-render actually improves with the blocking variant — because (a) task 145 names the
remaining bottleneck as **render/serialize on the single main thread**, not download, and (b) a
blocking 3.2 MB mermaid **parse** before main.js **delays the live-editor mount for every mermaid
doc** (heavier than hljs's 2.1 MB, and only helps if a diagram is on screen immediately). **If the
spike shows parse-during-render-burst is the real stall → promote to medium-high. If download is the
only thing moved → kill it (marginal on local disk).**

## Plan (only if the spike confirms)

In `src/html-builder.ts` / `extension.ts`, emit a **blocking** id-matched `<script>` for the present
engine(s) before main.js, gated on a **FULL-content** regex (`/```\s*mermaid/m`, `/```\s*echarts/m`
over `document.getText()`, available at `extension.ts:1727`) — **not** `preRenderedHtml`, which
`lute-host.ts:123-141` truncates at `MAX_PRERENDER_CHARS` and so misses below-the-fold diagrams.

## Constraints
- CSP (`html-builder.ts:48-66`): a `cspSource`-origin script is allowed without a nonce — OK.
- Worker/Lute round-trip: irrelevant (head `<script>`, not editable DOM).
- The blocking-script + exact-`?v=` contract above is load-bearing — an async tag crashes, a wrong
  `?v=` double-fetches. No `Date.now`/`Math.random`.

## Bonus (worth doing regardless)
The **existing hljs gate** (`html-builder.ts:201-203`) shares the truncated-prefix blind spot — a
code fence below the prerender cut-off is missed. Move it to the same **full-content** scan.

## Verification
- The spike's perf spec is the gate (proves parse-ordering, not just download, moves).
- **Real-VS-Code e2e (MANDATORY)** if shipped: a mermaid doc renders, no double-fetch (one
  `vditorMermaidScript`), no `Ee` race/ReferenceError; a non-mermaid doc emits no preload.
- `tsc` + `biome` + vitest + Playwright, headless. Verify coverage.

## See also
- `src/html-builder.ts:201-211` (the hljs precedent), task 145 (the measured hljs win + the
  "bottleneck is main-thread render/serialize" finding), `lute-host.ts:123-141` (prerender prefix
  truncation), `extension.ts` (`document.getText()`, `vditorBaseUri`).
- Overlaps with task 168/169 — if the real stall is the render burst (not load), those address it
  more directly; revisit this only for the load-ordering slice.
