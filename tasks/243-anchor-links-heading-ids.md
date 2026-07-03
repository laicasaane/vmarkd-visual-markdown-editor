# Task 243 — FIX: in-document anchor links `[x](#heading)` + `{#custom-id}` heading IDs

**Status:** planned — BUG/fix pair · **Impact:** 🟡 med (READMEs with manual TOCs) · **Origin:** task 192 §10 (probe-verified)

## Problem

Two verified halves of one feature:
1. **Fragment links never navigate**: `onOpenLink` (`extension.ts:805-817`) resolves any
   non-http href against the doc dir — `#custom-id` becomes a FILE named `#custom-id` →
   error. The webview has zero fragment handling (grep link modules → none), and preview
   headings carry no `id` to anchor to anyway.
2. **`{#custom-id}` is a half-state**: Vditor never calls `SetHeadingID` → probe shows the
   `{#custom-id}` text is STRIPPED from display yet no `id` attribute is emitted — the
   syntax silently does nothing and the user can't even see why. With `SetHeadingID(true)`
   the probe emits `<h1 id="custom-id">` and Sanitize keeps it; IR already parses the
   marker and round-trips byte-stable.

## Scope

- [ ] Enable `SetHeadingID(true)` (setLute patch or post-init call; registry-anchored).
- [ ] Webview: intercept fragment-only hrefs in the link-click path → resolve against
      custom ids FIRST, then GitHub-style slugs of heading text → reuse the
      scroll-to-heading machinery. No host round-trip for same-doc anchors.
- [ ] Host: for `file.md#frag` strip the fragment before `vscode.open` and post a
      scroll-to-heading after the target opens.
- [ ] Share the heading-resolution helper (slugger + custom-id map) with task 203
      (`[[note#heading]]`) — ONE slugger, unit-pinned, Obsidian/GitHub-compatible.
- [ ] Slugger flavor option (added 2026-07-03, MAIO parity): `vmarkd.slugifyMode` =
      `github` (default) | `gitlab` — one flag in the shared slugger; 253's TOC and 32's
      anchor completion inherit it automatically. Add only the two; other flavors on
      request.

## Out of scope

- Anchor autocompletion in `](#` (note for task 32), `{#id}` on non-heading blocks.

## Verification

L1: slugger + resolution units (custom id beats slug, unicode/duplicate headings).
L2: click `[x](#target)` → scrolls + flashes, no `open-link` post; `{#custom-id}` heading
round-trips and carries the id. L3 real-VS-Code: same-doc anchor + `file.md#frag`
cross-doc journey.
