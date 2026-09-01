# Task 543 — Insert ordinary dropped files as Markdown links

**Status:** ✅ completed 2026-09-01 · **Impact:** 🟠 release input regression ·
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

- [x] RED/GREEN unit coverage for text/PDF/generic links, bracket/backslash-safe labels, common
      image extensions, uppercase extensions, WAV, query/fragment hrefs, and extensionless files.
- [x] Chromium drop coverage drives a real non-image File through Vditor's existing drop/upload
      wire, applies the real uploaded return mapping, and proves a normal link without image markup.
- [x] One focused real-VS-Code drop journey writes the ordinary file, inserts/saves the exact link,
      keeps the source file bytes, and retains the existing image-drop control.
- [x] Focused changed-line coverage, build, all typechecks, bundle/startup budgets, lint, and one
      final quality run are recorded; move the task to `tasks/done/` only at completion.

## Out of scope

- Text-only drop insertion, directory drops, multi-file UX redesign, media previews, or changing
  upload destination/settings.
- Inferring type from file contents or fetching/sniffing a returned href.

## Completion evidence

- `uploadedMarkup` now checks WAV first, then an explicit case-insensitive image-extension set,
  and emits an ordinary Markdown link for every remaining href. The label is the final path
  filename with backslashes and brackets escaped; query/fragment text stays in the untouched href
  and is excluded from the label and extension decision.
- RED unit evidence was recorded before the implementation: the five new image/ordinary-file
  assertions failed against the old every-non-WAV-is-an-image fallback. The final focused unit file
  passes 12/12 and the repository coverage run reports `upload-handler.ts` at 100% statements,
  functions, and lines / 92.85% branches.
- Focused Chromium coverage passes 3/3 with one worker. A real non-image `File` traverses Vditor's
  existing drop/upload handler, then the actual uploaded-return mapping inserts the expected normal
  link and no `![](...)`; the image-file and text-only-drop controls remain green. The focused V8
  report exercises 89.74% of `upload-handler.ts` lines in this live harness.
- The permanent real-VS-Code journey dispatches the drop to Vditor's actual current-mode element,
  verifies the timestamped `notes.txt` asset and its exact original bytes, polls the host document
  for the exact normal link, saves cleanly, and verifies prose plus link fidelity on disk. The first
  version of the spec incorrectly dispatched to the outer `.vditor-ir` wrapper and failed twice
  before product code was reached; after correcting that test defect, the isolated run passed 1/1
  and the final unchanged-build ordinary-file plus existing image control passed 2/2 with no retry.
- `node build.mjs`, all webview/strict/real-spec typechecks, whole-tree Biome lint, the 600 KB / 601
  KB bundle budget, and the 289-module / 29.5 KB startup budgets pass. The one final
  `npm run quality` candidate passes brand checks, lint, duplication, dependency rules, audits,
  252 coverage files / 3,670 tests, and the 13-module coverage ratchet at 76.83% statements /
  69.22% branches / 79.90% functions / 78.89% lines. Its only residual is the pre-existing Knip
  report for unlisted `yazl` in `test/backend/package-local-preview-core.test.ts`, owned by the
  release-wide Task 541 cleanup.
