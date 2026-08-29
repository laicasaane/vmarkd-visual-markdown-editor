# Task 270 — draw.io / Excalidraw editable-image bridge

**Status:** planned · **Impact:** 🔴 high (freeform-diagram story) · **Origin:** task 192 §11 (marketplace mining)

## Problem

VMDE has 18 text-to-diagram engines but ZERO freeform/hand-drawn diagram story. The
ecosystem solved this with dual-nature files: `.drawio.svg` / `.excalidraw.svg` are valid
images (embed via `![](x.drawio.svg)`, render anywhere incl. GitHub) that carry the full
diagram source inside for lossless re-editing. Draw.io Integration (hediet, ~3.96M installs)
and Excalidraw (pomdtr, ~506K) own the editors; we own nothing of the flow (grep drawio/
excalidraw → 0 hits).

## Scope (a cheap BRIDGE — do NOT embed the editors)

- [ ] Command/toolbar `Insert new draw.io diagram` / `Insert new Excalidraw sketch`: write a
      minimal empty template file under `vmde.image.saveFolder`, insert
      `![](assets/x.drawio.svg)` — renders inline like any local SVG today.
- [ ] `Edit diagram` affordance (task-215 context menu entry + hover button on images whose
      filename matches the dual-nature patterns) → `vscode.openWith` the registered custom
      editor; soft detection with a prompt-to-install fallback when the extension is
      missing (no `extensionDependencies`).
- [ ] Live refresh: fs-watch the referenced file → cache-busted resource URI swap on the
      `<img>` when it saves (no full re-render).
- [ ] Interplay: the hover Edit button must not fight the task-217 zoom affordance (one
      shared hover-chrome slot).

## Out of scope

- Embedding either editor in our webview, .tldr (not an embeddable image), converting
  between formats, bundling the extensions.

## Verification

L1: pattern detection + template content units. L2: insert command posts the right
markdown; hover affordance appears only on matching images. L3 real-VS-Code (mandatory):
insert → file exists + image renders; simulate an external save of the file → img
refreshes; `openWith` invoked with the expected viewType (spy via evaluateInVSCode).
