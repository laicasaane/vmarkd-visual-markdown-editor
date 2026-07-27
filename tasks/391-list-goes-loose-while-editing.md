# Task 391 — a list silently goes "loose" while being edited (a blank line appears under the parent item)

**Status: 🔴 OPEN — reported by the user, not yet reproduced here.**

**Impact:** 🟠 medium — no data is lost, but the file on disk is reformatted without the user asking,
which shows up as noise in a diff/commit and changes how the list renders elsewhere ·
**Origin:** user report 2026-07-27

## What the user reports

While editing a list — adding items, deleting items, switching bullets to numbered — the formatting
changed on its own at some point. Before:

```markdown
1. Analysis of email threads
   * [https://aclanthology.org/2026.acl-long.1486/](https://aclanthology.org/2026.acl-long.1486/)
   * Contextual Summarization of Email Threads - [https://publications.quest.edu.pk/ojs/index.php/qrj/article/view/148](https://publications.quest.edu.pk/ojs/index.php/qrj/article/view/148)
   *
```

After:

```markdown
1. Analysis of email threads

   * [https://aclanthology.org/2026.acl-long.1486/](https://aclanthology.org/2026.acl-long.1486/)
   * Contextual Summarization of Email Threads - [https://publications.quest.edu.pk/ojs/index.php/qrj/article/view/148](https://publications.quest.edu.pk/ojs/index.php/qrj/article/view/148)
   *
```

One blank line, inserted between the parent item's text and its nested sublist. Nothing else changed.

## What this is, in CommonMark terms

That blank line is the difference between a **tight** and a **loose** list. A list is loose if any of
its items are separated by a blank line, or if any item contains two block-level children separated
by one; a loose list renders each item's content wrapped in `<p>`, a tight list does not. So this is
not cosmetic whitespace — it changes the rendered output, and it rewrites lines the user never
touched.

The direction of the flip matters for the diagnosis: **tight → loose**. Something during the edit
made the list contain a blank line, and the serializer then re-emitted the WHOLE list in loose form,
because looseness is a property of the list, not of one item.

## Hypothesis (NOT yet verified — verify before fixing)

The trailing empty item (`   *` on the last line, which the user was in the middle of typing) is the
prime suspect: an empty list item is a plausible way for a blank line to enter the block, and the
document is re-serialized through Lute on every edit, so one blank line anywhere in the list is
enough for the round trip to normalise every item to the loose form. That is a hypothesis built from
the report's shape, not a measurement — the first job is to reproduce, not to act on it.

Note the edit sequence the user described also included **switching bullets to numbered**, which
rebuilds the list node. Either that or the empty item could be the trigger; do not assume the empty
item just because it is visible in the paste.

## Scope

- [ ] Reproduce: start from the tight list above and replay the reported edits one at a time
      (add an item, delete an item, toggle bullet↔numbered, leave a trailing empty item), checking
      the document on disk after EACH step. The step that flips it is the whole finding.
- [ ] Determine whether the flip comes from Lute's md→DOM→md round trip (probe it directly in Node —
      see the `lute-runs-in-node` pattern) or from an editor-side list operation building the DOM in
      loose form.
- [ ] Fix so a tight list stays tight across the whole edit sequence. A list the user wrote loose
      must equally stay loose — the invariant is "do not change what was not edited", not "always
      emit tight".
- [ ] Check both IR and WYSIWYG; sv is a source view and is not expected to be affected, but confirm
      rather than assume.

## Verification

- A serialization unit test (Node + Lute, no browser) pinning the tight list through the round trip.
- A real-VS-Code e2e replaying the edit sequence and asserting the document ON DISK is byte-identical
  apart from the intended change — a DOM-level assertion would not catch a whitespace-only rewrite.
