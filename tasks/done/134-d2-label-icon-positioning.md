# Task 134 — D2 label / icon positioning (`label.near` / `icon.near`)

> **Status:** 🟢 DONE (9 "inside" keywords) — 2026-08-01. `d2-render.ts` gained `insideAnchor()`
> (parses the 9 `top-left`…`bottom-right` keywords into a `{h,v}` start/middle/end bucket; anything
> else — unset, `outside-*`, unrecognized — returns `null`) plus two consumers: `labelAnchorFor()`
> (box corner/edge → `{x,y,anchor,baseline}` for a `<text>`, with `hanging`/`central`/default-alphabetic
> baselines) and an `iconXY` inline in `nodeIconImage()` (same 9-keyword table, corner of the icon
> badge). Wired into `s.labelPosition` at all 4 shape-label sites from task 129 (container header,
> person — overrides the bespoke below-figure position when set, the leaf default/switch — overrides
> cylinder/queue/document/package/callout's bespoke `lx,ly` when set, grid header) and `s.iconPosition`
> at `nodeIconImage`'s call site. When the field is unset/`outside-*`/unrecognized every site falls
> back to its EXACT pre-existing hardcoded position — confirmed byte-stable via `d2-quality.test.ts`
> (8 tests green) + a direct "unset stays byte-identical" assertion in `d2-render.test.ts`.
> **`outside-*` NOT implemented** (deferred per the Decision Gate — needs extra box room in
> `dimsToFit`). **`tooltipPosition` NOT read** — tooltips are invisible `<title>` elements
> (`nodeHitOverlay`), nothing to position. Edge-label positioning is a separate, still-hardcoded path,
> not touched.
> Tests: `d2-render.test.ts` → `describe('label / icon positioning: label.near / icon.near (task
> 134)')` (5 tests: top-center anchor+baseline, bottom-right anchor+coords, outside-*/unrecognized
> no-op, icon top-right moves off the hardcoded top-left, byte-identical default). Full d2-dir suite:
> 205/205 passing; typecheck + `lint:ci` clean.
>
> Needs a Go+WASM field extraction → batch with task 121/124 Phase B (export now owned by [task 159](159-d2-wasm-export-batch.md)). Builds on task 104 and
>
> **✅ Unblocked 2026-07-05 — [task 159](159-d2-wasm-export-batch.md) shipped: `labelPosition`/
> `iconPosition`/`tooltipPosition` + the decorative `iconStyle` on `D2Shape` are now exported (the
> d2-resolved `.near` keyword). Only the render remains — no WASM rebuild needed.**
> the icon work (task 124 item 3).

## Problem
D2 can position a shape's **label** or **icon** at a corner/edge instead of the centre:
```d2
server: Server { label.near: top-center }
db: Database { shape: cylinder; icon: ...; icon.near: top-left }
```
We **always centre** the label (`textAttrs` call sites place text at `cx,cy`), and icons aren't drawn
yet (task 124). `grep label.near` = nothing — `label.near` / `icon.near` are ignored.

## Root cause
`main.go` doesn't marshal `label.near` / `icon.near`; the webview centres unconditionally.

## Approach
- **WASM:** add `labelNear` / `iconNear` to `outShape` (the 8 viewport-style constants D2 allows for
  in-shape placement: `top-left … bottom-right`, plus `outside-*` variants d2 supports). Update
  `d2-wasm.ts`.
- **toSVG:** compute the label anchor from `labelNear` (corner/edge of the shape box, with padding +
  `text-anchor`/baseline adjusted) instead of the hard-coded centre. Same for the icon box once icons
  land (task 124). Keep centre as the default.
- Note: the bespoke shapes already special-case label position (person below, cylinder below the cap,
  callout above the tail) — `label.near` should override those when set.

## Decision gates
- Scope: the 8 inside positions first; d2's `outside-*` (label outside the shape) needs extra box room
  in `dimsToFit` — defer. **Resolved: implemented all 9 (incl. `center-center`) inside keywords;
  `outside-*` confirmed deferred.**
- Interplay with the existing per-shape label offsets (person/cylinder/callout) — `label.near` wins.
  **Resolved: implemented — `labelAnchorFor` overrides lx/ly (and anchor/baseline) after the bespoke
  per-shape computation when `s.labelPosition` is set.**

## Acceptance / tests
- [x] Unit: a shape with `label.near: top-center` renders its `<text>` anchored at the top-centre of the
  box (not the middle); default (unset) stays centred (byte-stable on the 8 samples).
- [x] Keep `d2-quality.test.ts` / typecheck / lint green.

## Related
Tasks 104, 124 (icons), 121/124 (WASM bump). `textAttrs` call sites + the per-shape label offsets in
`d2-render.ts`; extraction in `main.go`.
