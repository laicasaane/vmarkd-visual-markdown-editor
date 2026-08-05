# 493 — D2 labels ignore the `\n` the compiler kept in them

**Status:** 🟢 IMPLEMENTED, awaiting the user's own look — opened 2026-08-03 from a user report on a real document
(`data-flow-d2.md`, two blocks with `\n` in most node labels and in one edge label).

## Symptom

A D2 label written as `"Dedicated mailbox\nExchange Online"` renders as ONE line —
`Dedicated mailbox Exchange Online` — while the real `d2` v0.7.1 CLI breaks it into two rows. On the
wider labels the single line is drawn WIDER than the box it sits in and visibly spills out of the
shape (`Module 2 — message decomposition decompose, identify, pseudonymise, segment`). Edge labels
have the same defect (`needs_info\nask_bradbury\nnothing_new` → one long inline run).

Reproduced under the DEFAULT layout (`vmarkd` = ELK + refine) before any change:
`tmp/d2-nl/before-b0-vmarkd.png`, against the real-d2 goldens the user rendered with the CLI.

## Mechanism (measured, not assumed)

1. The compile-only WASM hands us a REAL newline inside `shape.label` / `edge.label` — probed
   directly (`tmp/nl-probe.mjs`: `"Dedicated mailbox\nExchange Online"`).
2. `canvasMeasure` (the production Sizer) ALREADY splits on `\n`: width = the widest line, height =
   `lines × fontSize × 1.25`. So every box was already sized for N rows of the WIDEST line.
3. Only the EMISSION was wrong. SVG `<text>` does not break on `\n`, and `d2-render.ts` emitted the
   whole label as one text run for every shape except `shape:text` / `shape:code` (the file's own
   line-23 comment says as much: those two "are the only shapes that render `\n`-separated
   multi-line labels (as `<tspan>` rows)").

So the fix is confined to the emission sites plus the two fixed-height header bands; the layout
already reserved the right room.

## Scope

Honour an EXPLICIT `\n` only. No width-based auto-wrap — real d2 does not wrap either (the user's own
golden shows `internal email, never to the customer` as one long unwrapped edge label), and adding it
would move every existing diagram.

## Plan

- [x] `labelRows(text, x, y, fs, flow)` — one choke point that splits on `\n` and emits one `<tspan>`
      per line with ABSOLUTE `x`/`y` (never `dy`: it interacts with `dominant-baseline` differently
      across renderers, and the same SVG must hold in the webview and in an export). Single-line
      labels return the escaped string UNCHANGED, so every existing render stays byte-identical.
      `flow` = `center` (rows centred on `y`), `down` (`y` = first row) or `up` (`y` = last row),
      derived from the site's baseline.
- [x] Line height `LABEL_LH = 1.25` — must stay equal to `canvasMeasure`'s factor or the block of rows
      drifts out of the box the sizer reserved. Guarded by a unit test.
- [x] Emission sites converted: leaf shapes (incl. every bespoke shape's `lx/ly`), `shape:person`,
      container header, grid header, grid cell, connection label, arrowhead label, `sql_table` and
      `class` headers.
- [x] `headerBandH(label)` — `sql_table` / `class` draw their title in a FIXED 32 px band used by both
      the sizer and the draw pass; a 2-line title needs a taller band. Returns `HEADER_H` unchanged
      for a single line.
- [x] ELK container top padding was a hardcoded 44 (= a single 20 px label row + 24). Take it from
      the measured label height so a 3-line container header cannot overlap the first child.
      Byte-identical for single-line headers.
- [x] Unit tests in `d2-render.test.ts`.
- [x] Real-VS-Code e2e (`test/vscode-e2e/d2-multiline-label.spec.ts`).
- [x] Verify vs the real-d2 goldens the user supplied (before/after screenshots).

## Verification (2026-08-03)

- `npm test` — **2 678 pass** / 191 files, incl. the 9 new multi-line cases (one per flow: the
  centred in-shape/edge label, the container header growing DOWN, the grid header growing UP).
- `d2-quality.test.ts` byte-stability: unaffected — none of the 8 golden fixtures has a `\n` in a
  label (checked), and single-line labels take the unchanged code path.
- `xvfb-run -a npm --prefix test/vscode-e2e test -- d2-multiline-label.spec.ts` — **1 passed**, and
  **RED first**: with `labelRows` neutered the same spec failed 3/3 (initial + both retries).
- The D2 specs that assert on the two surfaces this touched — `d2-table-chrome` (header band),
  `d2-label-halo` (the edge-label `<text>` the tspans now sit inside), plus `d2-feature-parity` and
  `d2-theme` — **7 passed** together (1.5 min).
- **Cache caveat**: the persisted render cache keys on the EXTENSION VERSION, which a code-only fix
  does not move, so an already-cached diagram would have replayed its pre-fix SVG. The local store
  was parked aside (`globalStorage/spiochacz.vmarkd/diagram-render-cache.bak-493`) before handing
  this over. A release bumps the version and invalidates it for everyone else.
- `npm run typecheck`, `npm run typecheck:vscode-e2e`, `npm run lint:ci` (694 files) — clean.
- `npm run quality` — lint:ci / jscpd / depcruise / test:coverage / check:coverage-modules **PASS**;
  `knip` FAIL is the pre-existing baseline (task 469), and none of its findings are in this diff.
- Coverage: every new line in `labelRows` / `anchorFlow` / `headerBandH` / the emission sites and the
  ELK padding line is exercised (checked against `coverage-final.json`, not the file %).
- Renders of the reporter's own document, default engine: `tmp/d2-nl/before-b0-vmarkd.png` vs
  `after-b0-vmarkd.png` / `after-b1-vmarkd.png`, matching the real-d2 CLI goldens row for row.
- Packaged + installed locally (`tmp/vmarkd-1.2.27-t493.vsix`) so the fix can be judged in the real
  editor.

## Not done

- No width-based auto-wrap (see Scope) — a label with no `\n` still renders as one line, as in d2.
- `shape:text` / `shape:code` keep their own prose emitter at `PROSE_LH` (left-aligned, own padding);
  they were already multi-line and are deliberately not routed through `labelRows`.
