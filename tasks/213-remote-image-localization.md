# Task 213 — Download / localize remote images to assets

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §5

## Problem

Pasted content keeps remote image URLs forever (paste-upload handles pasted FILES only,
`main.ts:509-539`; Vditor's `upload.linkToImgUrl` remote-fetch hook is never configured),
and with `vmarkd.image.allowRemoteImages` defaulting to false those images don't even
display. Typora's "copy image to ./assets when inserting from web" has no equivalent.

## Scope

- [ ] Command `vmarkd.downloadRemoteImages` (palette + later the 215 context menu): host
      scans the doc for `http(s)` image links (markdown + `<img>`), fetches HOST-SIDE
      (Node — the webview CSP forbids it), pipes bytes through the existing image pipeline
      (format/quality/maxWidth settings honored via a shared conversion path or saved as
      original when conversion is webview-bound — decide: simplest v1 saves original bytes),
      writes under `image.saveFolder`, rewrites the links via WriteBack.
- [ ] Per-image failure tolerance (keep the URL, report a summary toast); dedupe identical
      URLs; filename from URL basename through the (fixed — 191 P1-18) sanitizer.
- [ ] **Blocked-image affordance** (added 2026-07-03, persona audit): with
      `allowRemoteImages=false` (default) remote images — including README badges
      (shields.io), a first-minute dev papercut — vanish silently. Render a slim
      placeholder chip ("remote image blocked — allow / download") whose actions flip the
      setting or invoke this command for that image. The affordance is valuable even
      before the downloader ships — it may land first as its own small step.
- [ ] Optional setting `vmarkd.image.localizeOnPaste` (`off` default): after an HTML paste
      that carried remote images, run the same localizer on the pasted range. Note 191
      Probe-6 (remote-img paste crash) must be fixed first — reference it.

## Out of scope

- Auth-protected URLs, svg sanitization beyond current pipeline, reverse operation.

## Verification

- L1 backend: scanner unit (md + html forms, dedupe), rewrite mapping, failure summary —
  fetch mocked.
- L3 real-VS-Code (mandatory): fixture with two `data:`-served... remote fetch can't run
  offline — serve from a local http server started by the spec; command writes files under
  assets and the saved doc's links are relative.
