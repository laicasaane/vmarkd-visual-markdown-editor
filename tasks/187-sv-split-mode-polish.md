# Task 187 — sv (split) mode polish: preview morph, mode-switch scroll, status-bar mode

> **Status:** ✅ DONE (2026-07-02). All four items shipped + the streaming×sv risk fixed;
> permanent real-VS-Code net `sv-split.spec.ts` green; unit suite 1184/1184.
> Scope was set by the user after the sv behaviour analysis; two analysis items were
> RULED OUT by the user and must NOT be "fixed": scroll-sync works (our own
> `split-scroll-sync.ts`, task 48 — the probe's synchronous scrollTop read was a false
> negative), and HTML comments stay INVISIBLE in the sv preview by design
> ("preview to preview — realny render").

## Measured baseline (real-VS-Code probe, 2026-07-02)

sv fundamentals were healthy before this task: source pane fully themed, the right pane
renders EVERYTHING (12 d2 svgs incl. |md| foreignObjects, wavedrom at full height post-186,
echarts/KaTeX/hljs/callouts/leaflet/STL), typing→save works (sv → cheap full `getValue()`),
Ctrl+Z works (per-mode undo stack), the mode persists (capture-phase [data-mode] listener).

## Shipped

1. **Preview morph (P1b)** — `preview-morph.ts` + `patchPreviewMorph` (esbuild patch on
   vditor `preview/index.ts`, chained with the copy-tip patch; fail-loud anchor on the
   NON-url branch only). Vditor rebuilt the whole pane via `previewElement.innerHTML`
   every debounced edit settle — leaflet re-init, three.js re-boot, echarts re-instantiate.
   The morph diffs RAW-vs-RAW block html (WeakMap baseline per pane; the live DOM is
   post-processed so raw-vs-DOM would mismatch everywhere), prefix/suffix two-pointer,
   splices only the changed middle (incl. its interleaved text nodes). Kept blocks keep
   their live DOM — `afterRender`'s engine adapters skip them via `data-processed`
   (verified for mermaid/chart/abc). Fail-safes: count-drift → full set + re-baseline;
   leading non-element nodes → full set; any throw → stock innerHTML. Serves the full
   Preview overlay too (parity green).
2. **Mode-switch scroll (P2a)** — `preview-scroll-preserve.ts`: on preview-display flip
   with `currentMode==='sv'`, pin the SV SOURCE pane to the stored edit anchor
   (sv-aware anchors: blocks = data-block divs, headings = `#…␠` text blocks; rendered
   panes keep tag detection). split-scroll-sync cascades the right pane off our
   programmatic scroll events — one writer per pane. Leaving sv keeps the existing
   preview-anchor mapping (the right pane tracked the source while in sv).
   Verified: enter sv → source lands at the block-mapped anchor (measured 1155 for an
   edit anchor of 600 across different pane heights); back to IR → 340, not 0.
3. **Status-bar mode (P2c)** — new `editorMode` webview→host message (protocol union),
   posted at init (finish-init) + after every [data-mode] switch (toolbar-actions);
   host keeps `webviewEditorMode` per-uri (cleaned on panel dispose) and the status bar
   renders sv as `$(split-horizontal) Split` with a split-appropriate tooltip.
   DECISION (differs from the original plan): ir and wysiwyg BOTH keep the familiar
   `$(eye) WYSIWYG` label — distinguishing them is jargon, not information; only the
   sv label was a lie. `activate()` now returns `{ webviewEditorMode }` as a test API
   (the e2e asserts the report end-to-end through the host map).
4. **Preview delay (P3)** — `preview.delay: 500` in vditor-options' config-derived LAST
   merge (a stale saved `preview.delay` can never pin the old 1000; pin-tested).
   Panel width asymmetry (337 vs 294) left as-is — Vditor padding, cosmetic.
5. **Streaming × sv (risk item, fixed — REVISED after user challenge)** —
   `streamRenderIR` writes DIRECTLY into the IR pane; booting a streamed (>700 KB) doc
   with a persisted sv/wysiwyg mode showed an EMPTY visible pane while the hidden IR
   filled (an edit there could even save emptiness). Booting sv directly is no
   alternative: a whole-doc `Md2VditorSVDOM` measured **5 041 ms at 312 k chars**
   (vs IR 888 ms, wysiwyg 717 ms — Node bench) → 12 s+ at the streaming threshold, the
   exact freeze streaming exists to kill; an automatic post-stream switch just moves
   that block to the end. So the streamed open runs in IR — but the forcing is
   **SESSION-ONLY**: `setPersistModeOverride` makes save-options keep persisting the
   USER'S saved mode (the first blunt version let any unrelated panel click stomp the
   sv preference for every future file — the user caught it); an explicit [data-mode]
   click clears the override and persists the new choice. The Large-md status tooltip
   explains the behaviour. Unit-tested (save-vditor-options.test.ts +2);
   `stream-large-file.spec` green. FOLLOW-UP → **task 188**: chunked sv streaming
   (`Md2VditorSVDOM` per block-boundary chunk, ~65 ms/chunk at the measured rate) would
   let huge docs open directly in sv; needs a byte-fidelity check (sv `getValue()` =
   textContent — chunked render must reproduce the source bytes exactly).
   Prerender teaser → sv boot: overlay removal is mode-agnostic (verified); the visual
   re-layout at swap is accepted. Wiki links in the sv preview: unverified, minor.

## Findings (expensive to rediscover)

- **The `.vditor-ir` WRAPPER does not scroll in the real webview** — it's
  overflow:hidden; the inner `pre.vditor-reset` is the scroll container. A programmatic
  `wrapper.scrollTop = N` silently clamps to 0 → no scroll event → no anchor snapshot.
  This false premise burned a whole probe session (both "editAnchor null" and
  "posts empty" traced back to it); `sv-split.spec` now verifies every scroll write stuck.
- **`acquireVsCodeApi()`'s postMessage can't be monkey-patched reliably** from an e2e
  evaluate (property write silently fails; comparing against a `.bind()` copy always
  reads "installed"). Assert host-side state via the `activate()` test API instead.
- **Vditor's `codeRender` decorates every preview `<pre>` with a copy button** — once
  the morph keeps rendered diagrams alive across afterRender passes, the `<pre>` inside
  a d2 `|md|` label gets the button too (the census "13th svg" was its icon; before the
  morph the async d2 svg never existed at codeRender time). Hidden via
  `.vmarkd-d2-md .vditor-copy { display:none }` — the label is diagram content.

## Acceptance / tests

- [x] Unit `preview-morph.test.ts` (8): first render == innerHTML (incl. text nodes);
  unchanged block keeps live DOM identity; changed-middle replace keeps prefix/suffix;
  insertion/deletion keep neighbours; identical html = no-op; external count-drift →
  full set + working re-baseline; leading-text fallback.
- [x] Patch tests (`vditor-source-patches.test.ts`, 3): hook + fallback injected;
  xhr branch untouched (exactly one hook); fail-loud on drift.
- [x] Unit `status-bar.test.ts` (+2): sv report → "Split" label (command unchanged);
  ir report keeps WYSIWYG.
- [x] Pin `vditor-options.test.ts` (+2): delay 500 default + overrides a stale saved 1000.
- [x] Real-VS-Code `sv-split.spec.ts` (PERMANENT, green): battery renders in the split
  preview (d2/md-labels/mermaid/wavedrom≥4 live/callouts), source pane lands at the
  anchor (>50, was 0), host map records 'sv' end-to-end, morph keeps a marked diagram
  svg across a typed edit settle while the edit itself re-renders, back-to-IR restores
  scroll (>100, was 0).
- [x] Battery green after the changes: parity, wavedrom-theme, webview boot,
  d2-feature-parity, custom-diagrams-render, stream-large-file. Unit 1184/1184,
  typecheck clean, lint gate clean, build (patch-coverage assert) green.

## Explicitly NOT in scope (user rulings, 2026-07-02)

- Source↔preview scroll-sync — works (task 48); don't re-probe with synchronous reads.
- HTML comments in the sv preview — stay invisible (real render).
- sv typing-performance work (whole-doc `SpinVditorSVDOM`; task-180's defer is IR-only)
  — separate backlog if it surfaces as a real complaint.
