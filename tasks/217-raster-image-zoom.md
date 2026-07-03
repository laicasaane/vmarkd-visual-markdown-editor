# Task 217 — Click-to-zoom for raster images

**Status:** planned · **Impact:** 🟡 med · **Pairs with:** task 212(a) · **Origin:** task 192 §5

## Problem

A pasted screenshot can't be magnified in-editor: the ⛶ zoom/pan affordance is explicitly
diagram-only (`media-src/src/diagram-zoom.ts:1-5`), and Vditor's own image overlay is
CSP-bricked (task 212 disables it). Typora/MarkText both have per-image zoom.

## Scope

- [ ] Extend the diagram-zoom wrapper machinery to plain `<img>` in rendered surfaces
      (ir/wysiwyg preview panels, Preview mode, sv right pane): hover shows the ⛶ button →
      the existing inline-zoom overlay with pan + Ctrl-wheel zoom; Escape/click-outside
      closes (all already implemented for SVGs — reuse, don't fork).
- [ ] Interplay: must not fight the WYSIWYG image popover (src/alt editing —
      `wysiwyg/index.ts:428-429` scopes it to plain-markdown imgs) nor the dblclick path
      task 212 removes; gate the affordance to images ≥ a size threshold (tiny icons don't
      need zoom).
- [ ] Respect `allowRemoteImages` (a blocked remote img has nothing to zoom — no button).

## Out of scope

- Drag-resize persisting width (task 22), alignment controls, EXIF/rotation.

## Verification

- L1: none beyond a threshold helper if extracted.
- L2: extend `diagram-inline-zoom`-style spec — button appears on a data-URI image, zoom
  opens/pans/closes, `getValue()` untouched, editing near the image unaffected.
- L3 real-VS-Code (mandatory): same on the real pipeline (resource URIs + CSP) — the exact
  class of bug 212 exists to prevent.
