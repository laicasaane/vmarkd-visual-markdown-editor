# Task 188 — chunked sv streaming: large files open DIRECTLY in split mode

> **Status:** 📋 TODO (planned; decision-grade — the feasibility probes below already ran).
> Follow-up to task 187 item 5: today a streamed (>700 KB) open runs in IR with a
> SESSION-ONLY mode forcing (`setPersistModeOverride` keeps the user's saved sv
> preference intact), because `streamRenderIR` writes only the IR pane and a whole-doc
> sv render is a measured multi-second freeze. This task gives sv its own streaming
> path so a split-mode user's huge file opens straight into split view.

## Measured facts (Node benches, 2026-07-02 — probe kept at `tmp/spike-188/`)

- Whole-doc `Md2VditorSVDOM`: **5 041 ms at 312 k chars** (vs `Md2VditorIRDOM` 888 ms,
  `Md2VditorDOM` 717 ms) → 12 s+ at the >700 KB streaming threshold. Booting sv
  directly, or auto-switching to sv after an IR stream, both hit this freeze — chunking
  is the only route (and per-chunk renders are independent, so if the whole-doc cost is
  superlinear, chunking also LOWERS the total, not just spreads it).
- **sv is not byte-faithful even today** (whole-doc render): Lute normalizes trailing
  hard-break spaces away and tightens loose lists in the sv DOM text. sv `getValue()`
  = textContent, so this matches IR's existing Lute-canonical semantics — byte identity
  with the disk is NOT the correctness bar for this task (task-61's writeback layers
  own that concern).
- **The correctness bar is: chunked result == whole-doc render.** The probe found
  exactly TWO chunking artifacts to engineer away (4 × ~4 KB chunks, mixed fixture):
  1. **Cross-chunk link-reference definitions**: a `[ref][r15]` whose `[r15]: url` def
     lands in a LATER chunk renders as plain text instead of link-marked spans —
     the exact problem `streamRenderIR` already solves with `buildDefMap` + def-context
     injection + `stripInjectedDefs`; the sv strip differs (injected defs are VISIBLE
     source blocks in sv → drop the trailing injected block divs by count).
  2. **Lists split at a chunk boundary**: each half renders as its own list, preserving
     a blank line the whole-doc parse normalizes away (±1 char text drift + different
     marker classes). Fix in `chunkize` (shared with IR): back the cut off so it never
     splits a list run (scan the cut vicinity for `^[-*+] ` / `^\d+[.)] ` continuation
     lines, same spirit as the existing fence guard) — benefits the IR stream too.
- Fence and table boundaries were already safe (chunkize's fence guard held).

## Design

1. **`streamRenderSV(pub, markdown, hooks)`** in stream-render.ts, mirroring
   `streamRenderIR`: chunkize → per-chunk `Md2VditorSVDOM(chunk + defs context)` →
   strip injected defs (sv-aware, by trailing-block count) → append the chunk's
   top-level nodes into `vditor.sv.element` with frame-budget yields (~65 ms/chunk at
   the measured rate — chunk size may need halving for 60 fps; measure). No per-chunk
   preview processing (sv markup has no `data-render` previews — simpler than IR).
2. **Boot wiring (main.ts)**: when `streamActive` and the persisted mode is `sv`,
   construct in sv with `value:''` and stream the sv pane (drop the IR forcing +
   persist-override for this case — sv keeps its mode for real). `wysiwyg` keeps the
   task-187 session-only IR forcing (out of scope here; whole-doc wysiwyg ≈ IR cost,
   could later just render directly).
3. **Preview half**: keep the right pane empty behind the existing stream spinner and
   run ONE `preview.render` at `onDone` — it lands through the task-187 morph. A
   progressive per-chunk preview would double the Lute work for no visible win under
   the spinner. (Measure `Md2HTML` at threshold size during implementation; if it
   blocks >1 s, chunk the preview fill too — plain HTML appends, no engine passes
   until the end.)
4. **Post-stream finalize**: same contract as the IR path — edit-sync `invalidate()`
   (rebaseline), undo stack reset, `reportDocMode`, spinner removal, editable again.
   The task-187 pieces compose: source-pane scroll pin, `editorMode` report ('sv'),
   morph baseline starts empty (first preview render = full set).

## Correctness contract / acceptance

- [ ] Unit (Node/vitest, reuse the probe fixture): chunked sv DOM textContent ==
  whole-doc `Md2VditorSVDOM` textContent, AND chunk-boundary blocks carry the same
  marker classes (link refs resolved across chunks; no list split at any cut) on a
  mixed fixture incl. ref-before-def, loose lists, tables, fences, no-trailing-newline.
- [ ] Unit: list-aware `chunkize` cut (shared) — never splits a list run; still
  lossless (`chunks.join('') === input`); fence guard unchanged (IR stream tests stay
  green).
- [ ] Real-VS-Code e2e (extend `sv-split.spec.ts` or a dedicated spec): persist sv on a
  small file (toolbar switch → save-options), then open a >700 KB fixture → boots in
  SPLIT (mode 'sv', both panes visible), source streams in progressively (spinner,
  read-only during), fully editable after; `getValue()` non-truncated (tail section
  present); preview renders after done; status bar map reports 'sv'; typing works and
  saves.
- [ ] The 187 session-forcing + persist-override remains ONLY for wysiwyg; the Large-md
  tooltip sentence updated accordingly.
- [ ] Perf note recorded: total sv stream time + per-chunk ms at the threshold size
  (compare against the 5 s/12 s whole-doc baseline).
- [ ] Task file + tasks/README updated; coverage verified for the new lines.

## Risks / open questions

- Per-chunk sv render cost (~65 ms) exceeds a frame — acceptable with yields (the IR
  stream runs 11–18 ms chunks; halve the sv chunk size if scroll jank shows).
- `processSVAfterRender`/undo interplay after a manual DOM fill — mirror how
  streamRenderIR resets (it already solved this for IR; verify sv's `sv.process`
  equivalents).
- Very long single blocks (a 100 KB fence) can't be split — same limitation as the IR
  stream (single-chunk fallback), document.

## Related

Task 187 (session-only IR forcing this replaces for sv; morph; editorMode), task 49
(IR streaming — the template), task 61 (writeback byte concerns are OUT of scope
here). Probe: `tmp/spike-188/sv-chunk-fidelity.mjs` (chunked-vs-whole comparator) +
`tmp/spike-187/sv-render-bench.mjs` (mode render costs). Files: `media-src/src/
stream-render.ts`, `stream-chunk.ts` (chunkize), `main.ts` (boot wiring),
`test/vscode-e2e/sv-split.spec.ts`.
