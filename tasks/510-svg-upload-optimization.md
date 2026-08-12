# Task 510 — Optional conservative SVG optimization on upload

**Status:** 📋 TODO · **Impact:** ⚪ optional asset-size improvement · **Depends on:** task 74

## Goal

When enabled, optimize uploaded or pasted SVG files with SVGO before they are written to the
document's assets folder. The default remains byte-preserving and off:

- setting: `vmarkd.image.optimizeSvg`
- default: `false`
- scope: resource/document, matching the other `vmarkd.image.*` upload settings

The output keeps the original `.svg` filename and the inserted Markdown link remains unchanged.

## Safety contract

- Use SVGO as a pure-JavaScript dependency; do not add native codecs or `sharp`.
- Use an explicit conservative plugin allow-list, not the unrestricted `preset-default`.
- Preserve `viewBox`, width/height, namespaces, IDs and all ID references (`url(#...)`, `href`),
  `<foreignObject>`, text, styles, and geometry-affecting numeric precision.
- Do not merge paths, collapse groups, rename/remove IDs, round coordinates, or otherwise trade
  rendering fidelity for a smaller file without a fixture proving that it is safe.
- This is optimization, not SVG sanitization: do not add or claim a security boundary here.
- If parsing or optimization fails, write the original bytes verbatim and keep the original link.
- With the setting off, the SVG must remain byte-identical.

## Scope

1. Add the setting and pass it through the existing image-upload configuration.
2. Run the SVGO pass only for SVG uploads; raster conversion from task 74 is unchanged.
3. Keep the original filename and `uploaded` reply contract.
4. Keep the implementation in the existing upload pipeline so paste and file-drop paths share the
   same behaviour.

Existing SVGs already referenced by a document are out of scope. Batch optimization belongs in a
separate task so enabling this setting cannot rewrite unrelated files.

## Verification

- Unit tests for setting resolution, disabled byte-preserving behaviour, conservative plugin options,
  preservation of IDs/references/viewBox/foreignObject, filename handling, and failure fallback.
- Chromium harness test: upload an SVG with redundant metadata/whitespace and verify that enabled
  optimization produces a smaller valid SVG while the inserted link still points to `.svg`.
- Real-VS-Code e2e: upload the same fixture with the setting off and on, proving the off result is
  byte-identical and the on result preserves the critical SVG attributes.
- Test a deliberately invalid SVG and verify that the original bytes are written.
- Build, typecheck, Biome, and the relevant unit/e2e suites pass.

## Out of scope

- SVG sanitization or script/content security policy changes.
- Raster-to-SVG conversion.
- Re-encoding existing document images.
- AVIF support from the original task 74 plan; benchmark results deliberately dropped it.
