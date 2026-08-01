# Task 251 — Print stylesheet + page-break control (the missing half of PDF export)

**Status:** planned · **Impact:** 🟡 med (feeds task 53) · **Origin:** task 192 §10

## Problem

Task 53 exports HTML but there is NO `@media print` anywhere in the theme CSS and no
page-break convention support — the exported HTML prints/PDFs poorly, which guts the
"print to PDF via browser" path 53 implicitly relies on.

## Scope

- [ ] Recognize the common page-break conventions in the renderer:
      `<div style="page-break-after: always"></div>`, `<!-- pagebreak -->`, a lone
      `\newpage` line → render a subtle labeled divider in edit/preview (data-render) and
      a real `break-after: page` in print/export CSS.
- [ ] `@media print` block shipped with the standalone exported HTML (task 53's wrapper):
      `break-after: page` for the markers, `break-inside: avoid` for code blocks /
      diagrams / tables / figures (247's chrome), sensible margins, link URLs NOT expanded
      (readable docs, not webliography), toolbar/outline chrome hidden if ever present.
- [ ] The same block available in-editor so VS Code's webview print (if invoked) behaves.

## Out of scope

- Headers/footers/page numbers (browser print owns those v1), PDF generation itself
  (53's territory), paper-size settings.

## Verification

L1: marker-recognition unit. L2: divider renders for all three conventions, round-trip
byte-stable. L3: export the torture fixture via 53 → the HTML contains the print block +
markers become `break-after` elements (string-level assertions; an actual print render is
a manual check recorded once).
