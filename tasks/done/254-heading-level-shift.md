# Task 254 — Heading promote/demote (level shift, single or whole section)

**Status:** done — 2026-08-31 · **Impact:** 🟡 med · **Origin:** task 192 §10

## Problem

Restructuring means retyping `#`s per heading: Vditor's toolbar changes ONE heading with
no keybinding, nothing shifts a section subtree, and task 222 explicitly excluded level
change from its scope. MAIO ships Ctrl+Shift+]/[.

## Scope

- [x] Webview keybinding (capture-phase pattern) Ctrl+Shift+] / [ — caret in a heading →
      shift that heading's level; with a SELECTION spanning a section (or a modifier
      variant) → shift the whole subtree (reuse task 222's section engine to find it),
      ONE model edit + one undo step.
- [x] Guards: clamp at h1/h6 — a subtree shift that would push any member past the clamp
      is refused with a toast (no partial shifts); setext headings converted to ATX on
      shift (pin it).
- [x] Surface also as commands (palette + task 215 context menu) for discoverability.

## Out of scope

- Drag-based level change (222's out-of-scope stays), auto-renumber interplay (250's
  write-back command is re-run manually).

## Verification

L1: shift-engine units (clamp refusal, setext, subtree boundaries, mixed levels).
L2: keybinding in ir/wysiwyg/sv → `getValue()` exact, caret kept, one undo restores.
L3: real-webview chord (key-capture seam) + save fidelity.

## Completed implementation

The existing source-selection/caret transaction now shifts one heading, a non-collapsed selection's
root subtree, or an explicit `Alt`-modified subtree through one Markdown edit. `Ctrl+Shift+[` promotes
and `Ctrl+Shift+]` demotes in IR, WYSIWYG, and SV; the transaction preserves source caret offset,
scroll, exact host synchronization, and one-step Undo/Redo. H1/H6 overflow refuses the complete
operation and posts an informational toast. The commands are also exposed in the palette and webview
context menu without a second VS Code keybinding actor.

The shared source engine is fence-, frontmatter-, and CommonMark HTML-block-aware. It recognizes ATX
and legal setext headings without reinterpreting lists, blockquotes, indented code, thematic breaks,
raw elements/comments, block tags, or type-7 custom/inline HTML. Setext shifts convert to ATX while
preserving indentation, trailing spaces, CRLF, and logical caret position. Mixed-level subtree shifts
are all-or-nothing at the clamps and stop at the next same-or-higher heading.

Task 258 previously owned `Ctrl+Shift+[`. Its fold shortcut is now `Ctrl+Alt+[` on Windows/Linux and
`Cmd+Alt+[` on macOS, with matching manifest, direct webview ownership, unit coverage, and real VS Code
acceptance. The fold journey still proves the physical chord; its later source-reveal persistence leg
uses a local dispatch so caret placement and fold handling remain in one webview task.

### Verification evidence

- Final focused unit/backend coverage passes **184/184**, including clamps, mixed subtree boundaries,
  ATX/setext byte and caret mapping, CRLF, fences, frontmatter, CommonMark HTML block categories,
  shortcut ownership, message validation, commands/menus, and the module boundary.
- Focused Chromium passes **5/5** across IR/WYSIWYG/SV with exact `getValue()`, caret, one-step undo,
  subtree selection, clamp toast, and setext conversion.
- The final combined real-VS-Code run passes **2/2** with `--retries=0`: heading chord/subtree/undo/save
  fidelity plus Task 258's rehomed physical fold chord and persistence journey. Earlier iterative fold
  runs identified test timing and the intended saved-caret auto-unfold interaction; the final run used
  no automatic retry.
- Final build, lint, webview/strict/VS Code-e2e typechecks, brand check, jscpd, dependency boundaries,
  and the coverage ratchet pass. Full coverage passes **244 files / 3,538 tests** at **75.97% statements,
  68.74% branches, 78.58% functions, and 77.90% lines**; `section-range.ts` reaches **97.15% statements,
  92.19% branches, 100% functions, and 98.07% lines**.
- The measured eager bundle is **563.5 KB / 564 KB**. Task 254 extends already-eager section-range and
  rewrap transaction modules; no dependency, renderer, or lazy-engine boundary changed. The deliberate
  ceiling rationale is recorded beside the budget.

The aggregate quality run and final component reruns leave only the pre-existing unlisted `yazl`
finding in `test/backend/package-local-preview-core.test.ts`; npm audit remained network/policy-blocked
and no dependency files changed. Per queue policy, no full Chromium, FAST, or full real-VS-Code suite
was rerun. Final review found no remaining Critical or Important issues.
