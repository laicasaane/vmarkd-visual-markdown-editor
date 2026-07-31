// Task 241 — a merge-conflicted .md file must not be edited in a WYSIWYG editor.
//
// vMarkd is THE editor for .md, so a user lands here on a conflicted file by accident rather than
// by choice. What they get today is garbage and then damage: the `=======` line turns the block
// above it into a setext H1, the `>>>>>>>` line becomes seven nested blockquotes, and a single IR
// round-trip rewrites the markers themselves — `=======` grows or shrinks, `>>>>>>> feature`
// explodes into a staircase of `>>>>>>>`/`>>>>>>`/`>>>>>`/… After a save git can no longer
// recognize the conflict, so the file is stuck: neither `git checkout --ours` nor the merge editor
// will touch it.
//
// The bundled Lute looked like it had the answer — `SetGitConflict(true)` is present and does parse
// the markers into their own node types. It is NOT usable: Lute ships no Vditor IR or WYSIWYG
// renderer for them, so with the flag on, `Md2VditorIRDOM` returns the literal string
// `not found render function for node [type=NodeGitConflict, Tokens=]…` and `VditorIRDOM2Md` writes
// THAT into the document. Probed on the vendored build, both modes, before and after a spin. So the
// richer option the task held open is rejected on evidence, and the only safe answer is to not open
// the file in this editor at all.

const OPEN = /^<{7}(?: |$)/
const MID = /^={7}$/
const CLOSE = /^>{7}(?: |$)/

/**
 * Does this text hold a git merge conflict?
 *
 * Requires the full ORDERED triple — an opening `<<<<<<<`, then `=======`, then `>>>>>>>` — because
 * any one of them alone is legal markdown: `=======` under a line of prose is a setext H1, and
 * `>>>>>>>` is just a deeply nested blockquote. All three in that order, each alone on its line, is
 * not something a person writes by hand.
 *
 * Fenced code blocks are deliberately NOT skipped. A markdown file that shows a conflict inside a
 * ``` fence (a git tutorial) is flagged, which costs the reader one click on "Open anyway"; a real
 * conflict that git wrote INSIDE a fenced block would be missed if we skipped them, and that costs
 * a destroyed file. The asymmetry decides it.
 */
export function hasGitConflictMarkers(text: string): boolean {
  let seenOpen = false
  let seenMid = false
  for (const line of text.split('\n')) {
    // Tolerate CRLF: the marker is the whole line apart from the line ending.
    const l = line.endsWith('\r') ? line.slice(0, -1) : line
    if (!seenOpen) {
      if (OPEN.test(l)) seenOpen = true
      continue
    }
    if (!seenMid) {
      // A second `<<<<<<<` before any `=======` just restarts the window; conflicts do not nest.
      if (MID.test(l)) seenMid = true
      continue
    }
    if (CLOSE.test(l)) return true
  }
  return false
}

/** The notice shown when a conflicted file is opened. Exported so a test can pin the wording. */
export const GIT_CONFLICT_MESSAGE =
  'This file has unresolved merge conflicts. vMarkd opened it in the plain text editor — ' +
  'editing it here would rewrite the conflict markers and git would stop recognizing them.'

export const GIT_CONFLICT_OVERRIDE = 'Open in vMarkd anyway'
