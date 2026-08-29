# Task 277 — Paste-image filename template + confirm prompt

**Status:** planned · **Impact:** 🟡 med (mushan Paste Image class, ~715K installs) · **Origin:** task 192 §11

## Problem

The pasted-image filename is HARDCODED: `${formatTimestamp(new Date())}_${name}`
(media-src/src/upload-handler.ts:31) — no pattern, no prefix, no prompt. Assets land in
git, so controllable names matter; the 715K-install incumbent ships defaultName patterns,
prefix/suffix variables and an optional confirm input box.

## Scope

- [ ] `vmde.image.fileName` template with tokens: date/time parts (`{yyyy}{MM}{dd}`…),
      `{docBasename}`, `{originalName}`, `{counter}` (dedupe within the assets folder);
      default = current behaviour exactly (no silent change). Share/extend the token
      expander task 209 builds (`{{date}}`-family) — one expander repo-wide.
- [ ] `vmde.image.confirmName` (default off): a host-side input box pre-filled with the
      generated name before the write — round-trips through the existing upload bridge;
      Escape cancels the paste cleanly (no orphan file, no link inserted).
- [ ] Optional insert-template refinement: seed the alt text from the final filename
      (softens the task-64 empty-alt class); keep path-encoding of spaces in mind
      (Vditor #1872 per task 64).
- [ ] Applies to BOTH paste and drop paths; the (fixed — 191 P1-18) sanitizer runs LAST on
      the final name; webp rename logic keeps working on top.

## Out of scope

- Destination-folder templating (task 88 owns `copyFiles.destination` conventions),
  remote upload targets (task 278), selected-text-as-filename magic.

## Verification

L1: template expander + counter/dedupe + sanitize-order units. L2: paste with a template
set → posted `upload` name matches; confirm-cancel inserts nothing. L3 real-VS-Code:
paste → file on disk with templated name, link's alt seeded.
