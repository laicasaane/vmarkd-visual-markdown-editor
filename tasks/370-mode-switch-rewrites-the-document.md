# 370 — switching IR → WYSIWYG rewrites the in-memory document

**Status: 🔍 OPEN — measured, not investigated further. Found while working task 369.**

## What happens

Merely switching edit modes — no typing — changes what `getValue()` returns:

```
before:  | graphviz         |   ✅   | SVG post-processing`currentColor`      |
after:   | graphviz         |   ✅   | SVG post-processing `currentColor`     |
                                                        ↑ a space was inserted
document length: 18281 → 18266   (net −15 chars, so the table padding was re-flowed too)
```

Lute re-serialises the document on the mode switch and normalises it: a space is inserted between
text and an inline-code span that was glued to it, and the table's column padding is rewritten.

## Severity — needs deciding

The document is **NOT dirty** afterwards (measured: `isDirty === false` on the TextDocument), so
nothing reaches disk from the switch alone. The open question is what happens on the NEXT edit: the
edit sync posts `getValue()`, so a subsequent keystroke would plausibly carry the whole normalised
text to the file — turning "I typed one letter" into "the file got reformatted". **That path was NOT
verified** — do not assert it without measuring.

Normalising markdown is not wrong in itself (the rendered output is identical, and a space before
inline code is the conventional form). The issue is doing it silently, as a side effect of a mode
switch the user made for viewing.

## Why it matters beyond fidelity

It is the root cause of task 369's numbers, and it is why they looked inconsistent between runs:

| path | table height | inline code |
|---|---|---|
| IR (as opened) | 1062.88 | whole |
| IR → Preview | **1067.17** | split mid-word (`currentCo` / `lor`) |
| IR → Preview, rendered twice | 1067.17 | unchanged — not a stale first render |
| IR → WYSIWYG | 1068.03 | whole |
| IR → WYSIWYG → Preview | **1062.88** | whole |

The last row matches IR exactly — because by then the source has the inserted space, which gives the
line a break opportunity. So the Preview is faithful to whatever source it is handed; what changed
between the two Preview renders was the DOCUMENT, not the CSS.

Ruled out along the way: webfont timing (`document.fonts.status === 'loaded'`, mononoki resolvable at
both moments) and a stale first render (a second `preview.render()` produced the identical 1067.17).

## Where to start

- `getMarkdown` / the Lute round trip invoked by the mode switch: is the normalisation Lute's
  `SpinVditorDOM`/`VditorDOM2Md` output, and can the switch avoid re-serialising at all when nothing
  was edited?
- Then measure the edit-sync path: type one character after a switch and diff the file on disk.
