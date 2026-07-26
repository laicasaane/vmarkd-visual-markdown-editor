# 370 — switching IR → WYSIWYG rewrites the in-memory document

**Status: 🔍 OPEN — root-caused and scoped, no fix written.** Investigated 2026-07-26. The original
severity assessment below was WRONG on the point that matters; it is corrected here.

## What happens

Merely switching edit modes — no typing — changes what `getValue()` returns:

```
before:  | graphviz | ✅ | SVG post-processing`currentColor`  |
after:   | graphviz | ✅ | SVG post-processing `currentColor` |
                                             ↑ a space was inserted
```

## Correction: this is NOT a cosmetic normalisation

The first version of this task said "the rendered output is identical, and a space before inline code
is the conventional form". **That is false.** Measured through the vendored Lute:

```
'SVG post-processing`currentColor`'   →  <p>SVG post-processing<code>currentColor</code></p>
'SVG post-processing `currentColor`'  →  <p>SVG post-processing <code>currentColor</code></p>
```

The space changes what the document renders. It is a content change, not a reflow, and that is what
sets the severity: a mode switch silently alters the meaning of the user's text.

## Consequence — measured, and it is the bad one

The task previously flagged "what happens on the NEXT edit" as unverified. It is now verified, in a
real VS Code editor, with real keystrokes:

| | file | one keystroke writes |
|---|---|---|
| type WITHOUT a mode switch | 175 chars | **+1 char** |
| type AFTER an IR → WYSIWYG switch | 175 chars | **+88 chars** |

So: after a mode switch, typing a single character rewrites the whole affected region of the file.
The document is NOT dirty from the switch alone (version stayed 1, `isDirty === false`) — the damage
lands on the first edit.

## The sync layer is INNOCENT — do not "fix" it there

The control run is the important one: with no mode switch, one keystroke writes exactly one
character, even though `getValue()` already differs from the file by 78 characters at open (table
padding). The task-61 minimal-diff write-back is doing its job and suppressing that drift.

After the switch it writes 88 characters because the content genuinely changed — it is propagating a
real edit, correctly. Widening its notion of "unchanged" to swallow this would make it swallow
genuine user edits too. The defect is upstream of it.

## Root cause — located

`Md2VditorDOM`, Lute's markdown → WYSIWYG-DOM step, inserts a literal space:

```
Md2VditorDOM('a`b`')     →  <p data-block="0">a <code data-marker="`">​b</code>​</p>
Md2VditorIRDOM('a`b`')   →  (no space — the IR path is clean)
```

**And `SpinVditorDOM` re-inserts it.** Fed a hand-built DOM that has NO space, spin returns one WITH
a space. This is the finding that decides the fix: a one-shot DOM cleanup after the mode switch would
be undone by the first keystroke, because spin runs on every edit. The fix cannot live there.

### Scope — narrow and precise

12 inline constructs round-tripped through both paths. Only **inline code directly preceded by text**
is affected:

| affected | unaffected |
|---|---|
| `` a`b` `` → `` a `b` `` | `x**b**`, `x*b*`, `x[l](u)`, `x~~s~~`, `a$x$` |
| `` a`b`c ``, `` a``b`` ``, `` foo`bar`baz `` | `` `b`a `` (trailing side), `` `b` `` (alone), `` a `b` `` (already spaced) |

The IR path round-trips all 12 unchanged.

## Also checked, and clean

Zero-width spaces (U+200B) appear around `<code>` in the WYSIWYG DOM but `VditorDOM2Md` strips them —
a ZWSP in a text node does not reach the markdown. No second leak of this class.

## Where a fix could go — not decided

- NOT `minimal-diff-writeback` (see above), and NOT a patch to `lute.min.js` (vendored GopherJS
  output; a bad trade for a bug this narrow — see ADR on the vendored copies).
- Spin runs on every edit, so any DOM-level correction has to be re-applied on every spin, not once
  after the switch. That points at the same observer shape used elsewhere in this codebase, or at
  intercepting the serialize step rather than the DOM.
- Worth checking first whether upstream Vditor/Lute already track this; the reproduction above is
  small enough to file as-is.

## Reproduction assets

The throwaway probes are not committed. To rebuild them: a real-VS-Code spec that opens a temp file
containing `` post-processing`currentColor` `` in a table, reads `getValue()` + the TextDocument
before/after a toolbar mode switch, then types one character with `workbox.keyboard.type` and diffs
the document. The Lute checks run in a plain node `vm` sandbox seeded with `TextEncoder`/`TextDecoder`
(see `src/lute-host.ts`).
