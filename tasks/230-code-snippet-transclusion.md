# Task 230 — Live code-snippet transclusion from source files

**Status:** planned · **Impact:** 🟡 med (docs-as-code) · **Origin:** task 192 §9

## Problem

Code examples pasted into docs rot the moment the source changes. Docs tooling solves this
with include directives; VMDE has nothing — and it's the feature that would make it a
real docs-as-code editor.

## Scope

- [ ] Fence-based directive (round-trips as a normal fence, zero new markdown syntax):
      ```` ```include ```` with a body like `src/edit-sync.ts#L12-40` or
      `src/edit-sync.ts#region:debounce` (named `// #region debounce` … `// #endregion`
      markers).
- [ ] Host: read + slice the file (path containment per the task-148 hardening rules —
      workspace-only, no `..` escape); watcher → refresh the rendered block on target save.
- [ ] Webview: render as a read-only highlighted code block (hljs by target extension)
      with a header chip: path:lines, click → opens the source (the task-229 wire); missing
      file/region → the standard diagram-error box.
- [ ] Register as an engine-registry family so it inherits the error-box/theming/cache
      contracts for free (cache keyed by target content hash, not just fence text).
- [ ] **Extension dispatch** (added 2026-07-03, MPE `@import` parity — ~9.7M installs):
      type-route the included file by extension — `.csv`/`.tsv` → a rendered markdown
      table (reuse task 218's parser), `.mermaid`/`.dot`/`.puml`/(any engine-registry
      lang's conventional extension) → route the file body into the existing engine
      registry (18 engines for free, same content-hash cache), everything else → the code
      path above. One fence syntax, zero new markdown.

## Out of scope

- Transcluding markdown notes (task 204 owns `![[note]]`), editing through the rendered
  block, multi-file globs, remote URLs.

## Verification

- L1: slice parser (line ranges, region markers, off-by-one, missing region), path
  containment.
- L2: mocked host reply — renders, header chip, error box; fence round-trips byte-stable.
- L3 real-VS-Code (mandatory): real fixture pair — snippet renders the target's lines;
  edit the target file → block refreshes; save fidelity of the doc unchanged.
