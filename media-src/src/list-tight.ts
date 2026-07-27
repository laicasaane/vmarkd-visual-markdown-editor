// Task 391 — a list silently goes "loose" while being edited.
//
// Reported symptom: editing a list (adding items, deleting items, switching bullets to numbered)
// makes a blank line appear between a parent item's text and its nested sublist, rewriting lines the
// user never touched. That blank line is not whitespace noise — tight vs loose is a structural
// property in CommonMark, and a loose list renders every item's content wrapped in `<p>`.
//
// MEASURED, in a real VS Code, one operation at a time. The trigger is **Backspace at the start of a
// nested item** — i.e. the ordinary way to delete a bullet. It merges the item into its parent and
// leaves the merged text wrapped in a paragraph:
//
//   <ol data-tight="true">
//     <li>Analysis of email threads<p data-block="0">first entry</p><ul data-tight="true">…</ul></li>
//   </ol>
//
// That DOM contradicts itself: the list still says it is tight while one of its items is
// block-wrapped. Lute serialises it as the loose form, and the re-spin does not undo it — the blank
// line is permanent. (Delete-forward performs the same merge and does NOT leave the wrapper, so the
// two directions of one operation disagree.)
//
// The repair is that contradiction, stated as an invariant: in a list still marked
// `data-tight="true"`, no item may be `<p>`-wrapped. Verified against our pinned Lute in both edit
// modes — a genuinely loose list carries NO `data-tight` attribute and wraps EVERY item, so this can
// only ever unwrap the artifact, never flatten a list the user meant to be loose.
//
// Repairing the invariant rather than the keystroke is deliberate: Backspace is the operation that
// was caught, but any code path that block-wraps an item in a tight list produces the same corruption
// and is fixed by the same rule.

/**
 * Unwrap `<p>` children of items in lists still marked tight. Returns how many were unwrapped, so
 * callers (and tests) can tell a repair from a no-op.
 */
export function repairTightLists(root: ParentNode): number {
  let repaired = 0
  const lists = root.querySelectorAll(
    'ol[data-tight="true"], ul[data-tight="true"]',
  )
  for (const list of Array.from(lists)) {
    // Direct children only: a nested list carries its own data-tight and is visited in its own right.
    for (const item of Array.from(list.children)) {
      if (item.tagName !== 'LI') continue
      for (const child of Array.from(item.children)) {
        if (child.tagName !== 'P') continue
        // Move the paragraph's nodes up, keeping the SAME text nodes — the caret sits in one of them
        // right after the merge, and cloning would drop it.
        while (child.firstChild) item.insertBefore(child.firstChild, child)
        child.remove()
        repaired++
      }
    }
  }
  return repaired
}

/**
 * Watch the editor for the corruption and repair it as it appears.
 *
 * Bound to a stable root and rAF-debounced, the way the other DOM repairs here are: the damage is
 * done by an edit, so it has to be caught after the edit rather than in front of it, and the
 * observer must survive mode switches and re-inits.
 */
export function observeTightLists(
  getEditor: () => HTMLElement | null | undefined,
): () => void {
  let scheduled = false
  let disposed = false
  const run = () => {
    if (scheduled || disposed) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      // A repair queued before dispose must not land after it — the caller disposes precisely
      // because this editor is going away, and a late DOM write into a torn-down mode is exactly
      // the kind of thing that outlives its owner.
      if (disposed) return
      const editor = getEditor()
      if (editor) repairTightLists(editor)
    })
  }
  const observer = new MutationObserver(run)
  const editor = getEditor()
  if (editor)
    observer.observe(editor, {
      childList: true,
      subtree: true,
    })
  // The first repair covers damage already present when the observer is attached.
  run()
  return () => {
    disposed = true
    observer.disconnect()
  }
}
