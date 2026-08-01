# Task 194 — Diagram export (copy/save SVG · PNG)

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §1

## Problem

18 offline render engines and no way to get a rendered diagram OUT — no command, no menu,
`diagram-zoom.ts` is view-only. Users screenshot diagrams to put them in slides/docs.

## Scope

- [ ] Per-diagram actions: **Copy as SVG**, **Save as PNG…** (host `showSaveDialog` +
      `workspace.fs.writeFile`). Entry points: the diagram hover toolbar (where the ⛶ zoom
      affordance lives) and, once task 215 lands, the right-click context menu.
- [ ] SVG path: serialize the rendered `<svg>` (strip our wrapper attrs/data-render marks,
      inline the computed theme colours so the file is standalone).
- [ ] PNG path: rasterize host-agnostically — SVG → canvas → `toDataURL` in the webview,
      post base64 to the host for the save dialog. Canvas-based engines need their native
      APIs: echarts `getDataURL()`, STL/three `renderer.domElement.toDataURL()`.
- [ ] Declare export capability per family in `engine-registry.ts` (svg | canvas | none)
      so the buttons only appear where supported.

## Out of scope

- PDF/document export (task 53), batch "export all diagrams", clipboard-image copy
  (`vscode.env.clipboard` is text-only; PNG goes via save dialog).

## Approach notes

- Theme baking: exported SVG must not depend on `--vmarkd-*` variables — resolve them via
  `getComputedStyle` at export time (same trick the retheme fingerprints use).
- Respect the render cache: export reads the LIVE DOM node, never the cache.

## Verification

- L1: SVG serializer unit — wrapper/data-render stripped, CSS vars resolved.
- L2: button click → posted `save-diagram` payload is valid SVG/PNG base64 for one svg
  engine + echarts.
- L3: real-VS-Code — save flow writes a decodable PNG file for mermaid + echarts fixtures
  (webview feature ⇒ real-VS-Code e2e mandatory).
