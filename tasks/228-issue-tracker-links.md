# Task 228 — Issue-tracker smart links (`#123`, `PROJ-456`)

**Status:** planned · **Impact:** 🔴 high (dev+PM, daily) · **Origin:** task 192 §9 (persona addendum)

## Problem

Ticket references in notes — `#123`, `PROJ-456`, `GH-42` — are plain text. Verified: zero
autolink code anywhere (grep autolink/issue/jira in `media-src/src` + `src` → only an
unrelated d2 comment); Lute's `gfmAutoLink` handles URLs only. Developers and PMs living in
GitHub/JIRA/ADO reference tickets in every meeting note and design doc.

## Scope

- [ ] Setting `vmarkd.links.trackers`: array of `{pattern, url}` (regex with one capture →
      URL template, e.g. `"#(\\d+)"` → `https://github.com/org/repo/issues/$1`;
      `"([A-Z][A-Z0-9]+-\\d+)"` → `https://jira.example.com/browse/$1`). Empty (default) =
      feature off.
- [ ] Optional nicety: auto-derive a GitHub `#123` rule from the workspace's `origin`
      remote when no config is set and the user opts in (`vmarkd.links.autoGitHub`).
- [ ] Webview: render matches as link chips (the `custom-renderer.ts` wiki-chip pattern —
      Lute-invisible `data-render` span; serialization round-trips the plain text).
      Context guards: not inside code/math/links/URLs/headings' leading `#`.
- [ ] Click policy follows the existing link policy (plain vs Ctrl+click setting); open via
      the `open-link` wire → `env.openExternal`.

## Out of scope

- Fetching ticket status/titles from the tracker API (offline posture; maybe a later
  hover), tracker autocomplete, two-way sync.

## Verification

- L1: tokenizer + config-compile units (pattern matrix, guards, template expansion,
  invalid-regex tolerance).
- L2: chips render in ir/wysiwyg/preview, round-trip byte-stable, Ctrl+click posts exactly
  one `open-link` with the resolved URL, typing next to a chip doesn't corrupt.
- L3 real-VS-Code (mandatory): chips over the real pipeline; click routes to
  `openExternal` (spy via `evaluateInVSCode`).
