# Task 391 — a list silently goes "loose" while being edited (a blank line appears under the parent item)

**Status: ✅ DONE (2026-07-27)** — reproduced, root cause measured, fixed, RED-checked.

**Impact:** 🟠 medium — no data is lost, but the file on disk is reformatted without the user asking,
which shows up as noise in a diff/commit and changes how the list renders elsewhere ·
**Origin:** user report 2026-07-27

## What the user reported

While editing a list — adding items, deleting items, switching bullets to numbered — the formatting
changed on its own. One blank line appeared between the parent item's text and its nested sublist:

```markdown
1. Analysis of email threads          1. Analysis of email threads
   * [url](url)               →                                      ← this line
   * Contextual … - [url](url)           * [url](url)
   *                                     * Contextual … - [url](url)
                                         *
```

That blank line is the difference between a **tight** and a **loose** list in CommonMark — not
whitespace noise. A loose list wraps every item's content in `<p>`, so it renders differently, and it
rewrote lines the user never touched.

## Root cause — measured, one operation at a time

The hypothesis this task shipped with (the trailing empty item) was **wrong**, and so was the second
one (the bullet↔numbered toggle). Both were tested and cleared:

| checked | result |
| --- | --- |
| Lute round trip of the tight list (`Md2VditorIRDOM` → `VditorIRDOM2Md`) | stable |
| the per-keystroke spin (`SpinVditorIRDOM`) | stable |
| a trailing empty item **loaded from disk**, then toggled | stays tight |
| bullets↔numbered on the sublist, and on the parent, from a fresh document | stays tight |
| adding items, typing in them, deleting them | stays tight |

The trigger is **Backspace at the start of a nested item** — the ordinary way to delete a bullet. It
merges the item into its parent and leaves the merged text wrapped in a paragraph:

```html
<ol data-tight="true" data-marker="1." data-block="0">
  <li data-marker="1.">Analysis of email threads<p data-block="0">first entry</p><ul data-tight="true">…</ul></li>
</ol>
```

That DOM **contradicts itself**: the list still declares `data-tight="true"` while one of its items is
block-wrapped. Lute serialises it as the loose form, and the re-spin does not undo it, so the blank
line is permanent.

Sharpest detail: **Delete-forward performs the same merge and does NOT leave the wrapper.** The two
directions of one operation disagree, which is why this looked random to the user.

## The fix

`media-src/src/list-tight.ts` — the contradiction, stated as an invariant: **in a list still marked
`data-tight="true"`, no item may be `<p>`-wrapped.** `repairTightLists` unwraps such paragraphs
(moving the child nodes, not rebuilding them, so the caret sitting in the merged text survives);
`observeTightLists` runs it rAF-debounced off a MutationObserver bound to the stable `#app`, wired in
`finish-init.ts` next to the other DOM repairs so it survives mode switches and re-inits.

Repairing the **invariant** rather than the keystroke is deliberate: Backspace is the operation that
was caught, but any path that block-wraps an item in a tight list produces the same corruption and is
fixed by the same rule.

**Why this cannot flatten a list the user meant to be loose:** verified against our pinned Lute in
both edit modes — a genuinely loose list carries **no** `data-tight` attribute and wraps **every**
item, so the repair never looks at it.

## Two things worth knowing, found on the way

- **Lute normalises a FLAT loose list to tight on its own round trip** (`* one\n\n* two` →
  `* one\n* two`), while the NESTED loose form is stable. Nothing to do with this fix — it happens on
  open — but it means a flat loose list cannot be used as a test fixture here, and it is worth
  remembering before anyone reports "my blank lines disappeared".
- A separate, more destructive list defect exists: after an edit sequence, toggling the parent list
  type can flatten the nesting entirely (parent item → plain paragraph, sublist promoted to top
  level). It is deterministic but needs its own investigation; **not** filed as a task yet because the
  repro still runs through several steps and the minimal trigger is not isolated.

## Scope

- [x] Reproduce and identify the flipping step.
- [x] Determine whether it is Lute's round trip or an editor-side operation — it is the editor.
- [x] Fix so a tight list stays tight; a list written loose stays loose.
- [x] Check IR and WYSIWYG (the invariant is identical in both — verified against Lute); sv is a
      source view and has no list DOM.

## Verification

- **Unit** — `media-src/src/list-tight.test.ts` (9): unwraps the measured corrupted DOM, keeps the
  nested sublist in place, leaves a genuinely loose list and an undamaged tight list untouched, is
  idempotent, moves the caret-bearing text node rather than re-creating it, repairs a damaged list
  without touching a loose sibling, and the observer repairs after attach + stops on dispose.
- **Real-VS-Code e2e** — `test/vscode-e2e/list-tight.spec.ts` (3): the Backspace merge keeps the
  document tight and the sublist nested; typing after the repair still lands in the merged item (the
  caret was not dropped by the DOM surgery); a nested loose list survives an edit unchanged.
- **RED-checked:** with the observer unwired, the Backspace test fails on every retry.
