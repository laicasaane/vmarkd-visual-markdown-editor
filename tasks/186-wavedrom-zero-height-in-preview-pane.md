# 186 — wavedrom blocks render at ZERO height in the full Preview pane

**Status:** OPEN — discovered 2026-07-02 during the task-185 verification runs. PRE-EXISTING
(reproduced on clean `b0e4d55` with all 185 changes stashed), so the nightly gate is red on
`parity.spec.ts` independently of task 185.

## Evidence

- `parity.spec.ts:56` ("IR (collapsed) renders at the same size/spacing as Preview") fails with
  exactly four consecutive code-block entries at indices 45/47/49/51:
  `{"ir":96,"pv":0} {"ir":54,"pv":0} {"ir":71,"pv":0} {"ir":57,"pv":0}` — rendered fine in IR,
  ZERO height in the full Preview overlay.
- The all-renderers fixture gained THREE extra wavedrom fences (4 total) in `2b80dab`
  ("fix(wavedrom): reg/assign/config support + dark bitfield + Preview-pane bg") — the same
  commit whose fixture growth also rotted `custom-diagrams-render.spec`'s hardcoded
  `processed === 1` counts (that half was FIXED in task 185: expectations now tie to the DOM
  target count). Four new blocks ↔ four zero-height Preview entries is a strong match.
- Reproduced twice on the current tree and once on clean `b0e4d55` (stash experiment) —
  deterministic, not a flake; `retries: 2` does not absorb it.

## Hypothesis (unverified)

The wavedrom variants added in `2b80dab` render through the custom observer in the IR pane,
but the full Preview pane (`.vditor-preview`) copy of those blocks never gets a wavedrom
render (or renders into a collapsed container). Height 0 means no svg box at measure time.
Check: does `findBlocks`/`renderWavedrom` cover `.vditor-preview` for these variant sources
(reg/assign/config need `WaveDrom.renderWaveForm` variants?), and does the Preview render pass
run for them at all?

## Done when

- [ ] Root cause identified with evidence (not the hypothesis above taken on faith)
- [ ] wavedrom variants render in the full Preview pane at non-zero height
- [ ] `parity.spec.ts` green locally (headless) — it is the regression net for this
- [ ] unit coverage for whatever code path was at fault
