# 370 — switching IR → WYSIWYG rewrites the in-memory document

**Status: ✅ DONE (2026-07-26).** Fixed at the source, with the mirror-image defect it uncovered
(task 60) fixed in the same change.

## What happened

Merely switching edit modes — no typing — changed what `getValue()` returned:

```
before:  | graphviz | ✅ | SVG post-processing`currentColor`  |
after:   | graphviz | ✅ | SVG post-processing `currentColor` |
                                             ↑ a space was inserted
```

The first version of this task called that a cosmetic normalisation. It is not. Measured through the
vendored Lute:

```
'SVG post-processing`currentColor`'   →  <p>SVG post-processing<code>currentColor</code></p>
'SVG post-processing `currentColor`'  →  <p>SVG post-processing <code>currentColor</code></p>
```

The space changes what the document renders, so a mode switch silently altered the meaning of the
user's text. The damage landed on the next edit: with a real VS Code and real keystrokes, one
character typed after an IR → WYSIWYG switch wrote **88 characters**; the same keystroke with no
switch wrote **1**.

## Root cause

`Md2VditorDOM`, Lute's markdown → WYSIWYG-DOM step, inserts a literal space between text and an
inline code element that the source had glued:

```
Md2VditorDOM('a`b`')     →  <p data-block="0">a <code data-marker="`">​b</code>​</p>
Md2VditorIRDOM('a`b`')   →  (no space — the IR path is clean here)
```

`SpinVditorDOM` re-inserts it on every keystroke, which ruled out a one-shot cleanup after the
switch. All 60-odd Lute `Set*` options were probed; none moves it. Patching `lute.min.js` (vendored
GopherJS output) stays off the table.

## Fix — `src/lute-gap-repair.ts`

The DOM can express BOTH forms: a ZWSP separator serializes back to `` a`b` ``, a plain space to
`` a `b` ``. Only the md → DOM direction is lossy — it maps both sources onto the space form. So the
repair puts back the separator the SOURCE implies, and the source is available at every call site:
`Md2VditorDOM` is handed the markdown, and a spin's output is built from `VditorDOM2Md(input)`
(spin is md-mediated: DOM → markdown → DOM). **`Md2HTML` of that markdown is the oracle** — it
renders inline code as a bare `<code>` and its gaps are faithful.

- **ZWSP, not deletion.** The repair is length-preserving, so the character offsets that
  `wysiwyg-code-highlight.ts`, `caret-preserve.ts` and the preview anchors compute do not shift. It
  is also the separator Lute itself emits before a leading code element, and `VditorDOM2Md` strips
  it.
- **Lazy oracle.** Nothing renders unless the output actually contains a space in front of an inline
  code element, so an ordinary prose keystroke pays nothing.
- **Bails out rather than guessing.** A code-span count mismatch, a throwing or cold oracle → the
  output is returned untouched. The worst case is the behaviour we shipped before.

Installed from Vditor's `setLute` through a build patch (`patchLuteHook` in
`media-src/esbuild-shared.mjs` → `window.__vmarkdPatchLute`, set in `media-src/src/preload.ts`).
That is the only hook earlier than the first render: Vditor renders the initial value from `initUI`,
before `options.after` — a document opened straight into WYSIWYG would otherwise already carry the
spaces. Putting the global in `preload.ts` also means every e2e harness gets it, so the harnesses and
the real editor cannot drift apart on this.

The host shares the same module: `renderForMode` repairs the instant-paint overlay (or the text
would shift sideways at the swap) and `reserializeMarkdown` repairs the canonical form the
minimal-diff write-back compares against.

## The mirror image, found on the way — task 60 is now fixed at the root

`Md2VditorIRDOM` **deletes** the whitespace in front of a table cell's FIRST inline element. That was
already known and contained (task 60: the cell-level write-back keeps untouched cells' bytes, with
"the cell you are typing in" recorded as an accepted residual). Measuring it here showed it is wider
than recorded — every inline type, not just `**`:

| affected | not affected |
|---|---|
| `` \| a `b` \| ``, `\| a **b** \|`, `\| a *b* \|`, `\| a [l](u) \|`, `\| a $x$ \|`, `\| a ~~s~~ \|`, `\| a ![i](u) \|` | the SECOND and later elements in the same cell |
| header cells as well as body cells | paragraphs, lists, quotes, headings (all clean) |

`SpinVditorIRDOM` re-deletes it every keystroke. **And the WYSIWYG builder trims the cell too** — it
is merely masked for inline code, which its own invented-space rule then re-spaces. `| a **b** |`
lost its space in WYSIWYG as well.

`restoreCellGaps` puts it back, cell for cell, from the same `Md2HTML` oracle, restoring the source's
whitespace verbatim (a tab comes back as a tab). It runs before the code-gap repair on the WYSIWYG
side. The task-60 tripwire in `test/backend/vditor-fidelity-bugs.test.ts` fired on this change,
exactly as it was designed to, and is now a correctness test across six inline types.

## Measurements

- **Corpus, WYSIWYG**: every `.md` in the repo (784 files) — 0 code-span count mismatches, 14 files
  improved, **0 moved away from their source**.
- **Corpus, IR cells**: **239 cells restored across 60 files, 0 made worse.**
- **Real editor**: one keystroke after a mode switch now writes **1 character**, not 88.
- **Cost**: nothing on documents without the trigger. On a 10 KB table-heavy document the IR open
  render goes 53 ms → 76 ms (the extra `Md2HTML`); a WYSIWYG keystroke in a paragraph that holds
  inline code costs +0.2 ms to +0.5 ms. Prose keystrokes are unaffected (the gate never fires).

## Verification

- **Unit** (`test/backend/lute-gap-repair.test.ts`, 70 tests, **100% of the module**): the pure
  string layer (gaps, oracle bail-outs, length preservation, laziness, the wrapper wiring and its
  call-time reader lookup) plus the REAL vendored Lute in a `vm` sandbox — 12 constructs that used to
  gain a space, 7 that must not change, the IR cell repair across every inline type, spin stability
  across repeated spins, and the keystroke that CREATES a code span.
- **e2e, real VS Code** (`test/vscode-e2e/inline-code-gap.spec.ts`, 4 tests): switch + one keystroke
  → the document grows by exactly 1 character and the glued code is still glued; a genuine space
  survives (the over-correction control); the boundary stays editable (type a space there, backspace
  it away — the caret does not jump); typing in the block re-spins it and it stays glued; and editing
  a table cell in IR keeps the space before its `**` (the task-60 residual).
  Confirmed to FAIL with the repair disabled, on the exact assertion.
- **Regression nets**: full unit suite, the Playwright harness suite, the real-VS-Code suite, Biome
  lint gate.

## Known residual

`| a  `b` |` — TWO spaces before inline code inside a table cell — collapses to one in WYSIWYG. Lute
trims both and re-adds exactly one, so the cell repair sees a space already there and leaves it
rather than making every ordinary table pay for the oracle. Pinned by a unit test so it cannot change
unnoticed.

## Not done

- `HTML2VditorDOM` / `HTML2VditorIRDOM` (paste of HTML) are not wrapped — their input is HTML, not
  markdown, so the oracle does not apply. A pasted block is repaired on the next spin of that block.
- `tasks/README.md` is still missing 360-382; backfilling the index was offered earlier and never
  answered, and adding only these would make the gap look deliberate.
