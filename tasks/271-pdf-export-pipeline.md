# Task 271 — PDF export pipeline (header/footer templates, page setup) + whole-doc PNG

**Status:** planned · **Impact:** 🔴 high · **Depends:** 53 (export) + 251 (print CSS) · **Origin:** task 192 §11

## Problem

The single most-installed markdown export capability on the marketplace (Markdown PDF,
yzane, ~3.9M installs) is a PDF with header/footer/page numbers and page setup. Our 53/251
produce printable HTML, but CSS `@page` margin boxes cannot render page numbers in
Chromium — only a driven `page.pdf()` can. No PDF path exists anywhere.

## Scope

- [ ] Detect a local headless-capable Chromium (Chrome/Edge/Chromium on PATH + well-known
      install dirs — the 53 detect-pandoc pattern; **never download/bundle a browser**);
      command hidden when absent, with a one-line hint.
- [ ] `vMarkd: Export PDF…`: feed 53's standalone HTML (with 251's `@media print` block)
      to the detected browser → `page.pdf()` with settings: `vmarkd.export.pdf.*` = format
      (A4/Letter…), orientation, margins, `displayHeaderFooter`, headerTemplate/
      footerTemplate (placeholders: pageNumber/totalPages/title/date), printBackground,
      pageRanges.
- [ ] Per-document override via a `vmarkd.export` front-matter block (53's mechanism —
      coordinate; last-merge semantics).
- [ ] **Whole-doc PNG/JPEG** rides along nearly free: `page.screenshot({fullPage:true})`
      as an export-type option (the share-to-Slack/issue journey; keeps task 194 strictly
      per-diagram).
- [ ] Diagrams/math must be resolved in the exported HTML (they are — 53 exports the
      rendered DOM; verify fonts/KaTeX assets inline or are file-URL-reachable for the
      headless browser).

## Out of scope

- Bundling puppeteer/playwright (a thin CDP driver or `--print-to-pdf` flags suffice —
  decide by spike; `--print-to-pdf` alone loses header templates, so likely minimal CDP),
  TOC/bookmarks in the PDF, watermarks.

## Verification

L1: settings→CDP-params mapping + front-matter merge units; detector unit. L3 (host-side
journey): export the torture fixture → PDF file exists, page count > 1, text extractable
(cheap pdf text probe), header contains the title; PNG variant produces a decodable image.
CI guard: skip gracefully when no browser is present (assert the hint path instead).
