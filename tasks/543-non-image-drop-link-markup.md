# Task 543 — Insert ordinary dropped files as Markdown links

**Status:** planned · **Impact:** 🟠 release input regression ·
**Origin:** Task 455 release-critical drag/drop probe, 2026-09-01 ·
**Related:** Tasks 191, 435 · **Blocks:** Task 541 release candidate

## Finding

A disposable real Chromium drop probe proved that a non-image `File` such as `notes.txt` reaches
Vditor's existing upload wire and is written by the host. The return path then calls
`uploadedMarkup(href)`, whose fallback treats every non-WAV extension as an image and inserts
`![](assets/notes.txt)`. The upload succeeds but the editor creates a broken image instead of a
navigable file link.

`text/plain` data without a File remains Vditor's documented no-op and is not this defect. Image
files must keep image markup, and WAV must keep its existing audio element.

## Implementation contract

- Make `uploadedMarkup` classify the returned href by a small explicit image-extension set.
- Preserve the existing case-insensitive WAV audio mapping and image `![](...)` output.
- Insert every other uploaded file as a normal Markdown link using its final href filename as the
  escaped label; do not percent-decode or normalize the href.
- Reuse the existing upload/write/`uploaded` message route. Do not add settings, dependencies,
  MIME state to the host protocol, or a second drop handler.
- Preserve exact surrounding Markdown, caret, one-step undo, save/reopen, trust/write gates, and
  image paste/drop behavior.

## Required verification

- [ ] RED/GREEN unit coverage for text/PDF/generic links, bracket/backslash-safe labels, common
      image extensions, uppercase extensions, WAV, query/fragment hrefs, and extensionless files.
- [ ] Chromium drop coverage drives a real non-image File through Vditor's existing drop/upload
      wire, applies the real uploaded return mapping, and proves a normal link without image markup.
- [ ] One focused real-VS-Code drop journey writes the ordinary file, inserts/saves the exact link,
      keeps the source file bytes, and retains the existing image-drop control.
- [ ] Focused changed-line coverage, build, all typechecks, bundle/startup budgets, lint, and one
      final quality run are recorded; move the task to `tasks/done/` only at completion.

## Out of scope

- Text-only drop insertion, directory drops, multi-file UX redesign, media previews, or changing
  upload destination/settings.
- Inferring type from file contents or fetching/sniffing a returned href.
