# Task 55 — Markdown diagnostics / lint (Problems + squiggles in WYSIWYG)

**Status:** planned (idea — needs design before building)

## Origin

Spotted in the `phfsantos/vscode-markdown-editor` fork (branch
`feature/vscode-obsidian-release`, an "Obsidian-like" rebuild). It adds a markdown
linter in two halves:

- **Host** `src/diagnostics/MarkdownDiagnosticProvider.ts` (~5 KB): a
  `languages.createDiagnosticCollection('markdown-editor')` that scans the document
  on open/change and emits diagnostics (squiggles in the text editor + the Problems
  panel) for: broken links, malformed table rows, missing image alt-text.
- **Webview** `packages/media/src/diagnostic-visualizer.ts` (~88 KB!): a
  `DiagnosticVisualizer` that mirrors those diagnostics *inside* the Vditor WYSIWYG
  surface — underlining the offending token/span, with tooltips/quick-fixes, token→
  span caching, overlap tracking, and a lot of "focus-aware" machinery to avoid
  moving the caret while the user types.

The idea is good: surface markdown problems both the normal VS Code way AND in the
visual editor. **Do not copy their implementation** — borrow the concept, write our
own (see "Why not port theirs").

## Why not port theirs

- **Host is naive.** `isValidFilePath()` always returns `true` (their own comment:
  "you could add actual file existence check here"), so the broken-link rule never
  catches actually-missing files — only malformed URLs. The table rule
  (`cells.length < 3`) false-positives on any line containing a single `|` (prose
  `a | b`, inline code, separator rows). The "debounce" is a bare `setTimeout(…,500)`
  with no `clearTimeout`, so every keystroke schedules another full re-analysis.
- **Webview is over-engineered.** 88 KB of defensive code ("CRITICAL: prevent
  overlapping", "prevent cursor jumping", hashing to skip re-applies) — the inherent
  pain of decorating a `contenteditable`. We can do far less.

## Scope (proposed — design first)

### Part A — host-side lint → DiagnosticCollection (the valuable half)
- A `MarkdownLintProvider`: one `DiagnosticCollection`, fed from a set of **pure,
  unit-testable rule functions** `(text, uri) => Diagnostic[]`.
- Real rules, not heuristics:
  - **broken relative link / image** — resolve `[..](path)` / `![..](path)` against
    the doc dir and actually `fs.stat` it (file scheme + trusted only; skip
    http(s)/anchors/mailto). This is the rule with real value.
  - **missing image alt-text** — `![](...)` empty alt → Information (a11y). Cheap,
    accurate.
  - Reuse our existing markdown parse (Lute / `lute-host.ts`) or a token pass rather
    than line regexes, so tables/links inside code fences aren't flagged.
- Scope to our docs: gate on the custom editor / supported extensions, debounce
  **properly** (cancel the prior timer), and only for `file`-scheme + trusted (matches
  `ensureCanWriteFiles` posture). Live-config flag `vmarkd.lint.enable` (default ?).

### Part B — mirror squiggles into the WYSIWYG editor (optional, harder)
- Only after Part A. Drive it off our existing `media-src/src/source-map.ts`
  (offset↔block↔line) so a diagnostic's range maps to a block/inline span — much
  lighter than their 88 KB visualizer.
- Underline the mapped span (a class + tooltip), recompute on the same
  `config-changed` / content-update path. Must not disturb the caret (the hard part —
  why Part B is optional and second).

## Option to weigh (added 2026-07-03): adopt the `markdownlint` engine

Assessed + probed (session note — an OPTION for the design phase, not a decision):

**Layering** — three different things: `markdownlint` = the rule engine (~50+ rules
MD001–MD059, micromark parser → accurate positions, MIT, pure JS, custom-rule API +
`fixInfo` autofixes); `markdownlint-cli2` = a file/glob CLI wrapper (config discovery:
`.markdownlint.json[c]`, `.markdownlint-cli2.jsonc`, …) — the WRONG layer for linting a
live open document; `vscode-markdownlint` = the popular extension, cli2 inside, lints
TextDocuments.

**Probe results (2026-07-03, cli2 v0.23.0 / lint v0.41.0 on `torture.md` + its Lute
round-trip — artifacts in `tmp/lint-probe/`):**
- Default-profile noise on our docs is LOW: original flags only MD013 (line-length 80)
  and MD059 (descriptive-link-text) — both stylistic.
- **The Lute round-trip INTRODUCES MD012** (multiple blank lines): the serializer emits
  an extra blank after a heading before a table (`## A table\n\n\n| Name…`). Hard
  evidence of the lint↔save **ping-pong risk**: a user with markdownlint fix-on-save in
  the text editor and vMarkd would rewrite each other's output in a loop.

**Recommended shape IF adopted:**
1. **Part B engine-agnostic**: our docs are real TextDocuments, so vscode-markdownlint
   users ALREADY get Problems entries for docs open in vMarkd. Mirror
   `vscode.languages.getDiagnostics(uri)` + `onDidChangeDiagnostics` into webview
   decorations (via source-map) — works with ANY provider (markdownlint, LTeX, cSpell),
   and is the real differentiator anyway.
2. **Part A = bundle the `markdownlint` LIBRARY** (not cli2) as an optional built-in
   engine, auto-disabled when the vscode-markdownlint extension is active (no double
   diagnostics). Adopt cli2's CONFIG COMPATIBILITY so repo/CI `.markdownlint.json` gives
   identical errors in-editor.
3. **Curated default profile — mandatory**: in a WYSIWYG editor the SERIALIZER owns
   source style, not the user. Default to correctness rules (MD011 reversed link, MD042
   empty link, MD052/53 reference definitions) + our custom dead-link rule (this task's
   Part A rule plugs into the same custom-rule API — one pipeline); style rules
   (MD012/MD013/marker-style…) off or aligned with what Lute emits.
4. **No `fixInfo` autofix-on-save** — guaranteed conflict with Lute normalization; the
   serializer IS our style fixer.
5. Practical: MIT → vendorable offline like the render engines; recent versions are
   ESM-only (esbuild fine); version-pin like mermaid/echarts.

**Side-finding (independent of lint):** the heading→table double-blank is a Lute
serializer normalization quirk — stable across round-trips, but lint-visible and
diff-noisy. Consider a serializer-side fix in the round-trip-fidelity family (239/240
neighbourhood); low priority.

## Out of scope / decisions to make

- Full markdownlint rule set (heading levels, list style, line length, …) — separate,
  larger; this task is link/image/a11y correctness, not style.
- Quick-fixes / code actions — defer; diagnostics first.
- **Decide:** is Part A even wanted given users already get the Problems panel from
  other markdown extensions? The differentiator is Part B (lint in the *visual*
  editor), which is also the expensive half. Sequence accordingly.

## Verification

- Unit: each rule fn over fixtures (broken vs ok link, missing vs present alt, link
  inside a code fence is NOT flagged, table row not mis-flagged).
- Backend: provider sets/clears the collection on open/change/close; debounce cancels.
- (Part B) e2e: a known-broken link gets an underline on the right block; typing
  doesn't move the caret.
- `tsc` + `biome` + full vitest (+ Playwright for Part B) green.
