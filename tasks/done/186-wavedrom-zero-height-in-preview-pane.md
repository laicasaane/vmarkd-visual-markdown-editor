# 186 — wavedrom blocks render at ZERO height in the full Preview pane

**Status:** ✅ DONE (2026-07-02). Root cause proven with a real-VS-Code probe, fixed in
`custom-diagrams.ts` (module-level monotonic id counter + post-render id strip), regression
nets green (`parity.spec.ts`, extended `wavedrom-theme.spec.ts`), unit coverage verified.

## Evidence (original failure)

- `parity.spec.ts:56` ("IR (collapsed) renders at the same size/spacing as Preview") failed with
  exactly four consecutive code-block entries at indices 45/47/49/51:
  `{"ir":96,"pv":0} {"ir":54,"pv":0} {"ir":71,"pv":0} {"ir":57,"pv":0}` — rendered fine in IR,
  ZERO height in the full Preview overlay.
- The all-renderers fixture gained THREE extra wavedrom fences (4 total) in `2b80dab`
  ("fix(wavedrom): reg/assign/config support + dark bitfield + Preview-pane bg").
- Reproduced twice on the current tree and once on clean `b0e4d55` (stash experiment) —
  deterministic, not a flake; `retries: 2` does not absorb it.

## Root cause (PROVEN — throwaway probe spec, real VS Code, 2026-07-02)

WaveDrom's `renderWaveForm(index, source, prefix)` resolves its output node via a
**document-global** `document.getElementById(prefix + index)` (exactly 1 `getElementById`
in the vendored bundle). `renderWavedrom` numbered its targets `__vmarkd_wd_${seq}` with
`seq` **restarting at 0 on every call**, and the id-bearing divs it renders are swapped into
the pane and STAY there:

1. First observer pass renders the IR pane's 4 blocks → divs `#__vmarkd_wd_0..3` (with svgs)
   live in `.vditor-ir` permanently.
2. Switching to full Preview populates `.vditor-preview`; the next pass finds the 4 unprocessed
   preview copies and restarts numbering at 0. The `faithfulRender` stage is appended to the
   END of `document.body`, while `.vditor-ir` sits earlier inside `#app` — so every
   `getElementById` returned the **stale IR div** (probe: all four ids resolved to IR-PANE;
   pane DOM order `.vditor-ir` → `.vditor-preview`).
3. The waveform was drawn into the IR pane (same source → invisible no-op; probe: IR divs kept
   exactly 1 svg), the stage's fresh div stayed EMPTY, `produce` didn't throw → `faithfulRender`
   swapped the empty div into the Preview wrapper and marked it `data-processed` →
   **zero-height block, no error box** (probe: all four preview wrappers
   `{h:0, svgs:0, html:'<div id="__vmarkd_wd_N"></div>'}`).

The original hypothesis ("Preview never gets a wavedrom render") was close but wrong in the
detail: the render RAN — it just rendered into the other pane's element.

## Fix (`media-src/src/custom-diagrams.ts`)

- `wavedromSeq` is now **module-level and monotonic** (never reset): target ids are unique
  document-wide across passes, and WaveDrom's internal svg ids (`svgcontent_N`, lane/gradient
  ids) stay unique across the IR/Preview copies too.
- After a successful render the target div's `id` is **stripped**: no pane — and no
  cache-restored HTML (task 184 persists this innerHTML across sessions, where the counter
  restarts) — ever retains a `__vmarkd_wd_*` node for a later pass's `getElementById` to hit.

## Done when

- [x] Root cause identified with evidence (probe spec in real VS Code; deleted after diagnosis)
- [x] wavedrom variants render in the full Preview pane at non-zero height — Preview now
      measures `96/54/71/57` px, exactly matching the IR heights from the failure signature
- [x] `parity.spec.ts` green locally (headless) — plus `wavedrom-theme.spec.ts` extended to
      assert per-block `svg` presence + height > 10 in `.vditor-preview` (direct net)
- [x] unit coverage for the code path at fault — `custom-diagrams.test.ts` gained a jsdom
      repro (stubbed `renderWaveForm` with the real getElementById contract): second-pass
      wrapper must receive its svg, and no `__vmarkd_wd_*` ids may remain after a pass
      (coverage of the changed lines verified: init 1 hit, `wavedromSeq++`/`removeAttribute`
      4 hits each)
