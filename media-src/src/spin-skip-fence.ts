// Task 175 — defer the per-keystroke Lute spin + DOM rebuild while typing inside a fenced diagram/code
// BODY. Vditor re-spins the edited block on every keystroke to keep markdown structure live (typing `## `
// → heading, `*x*` → emphasis). But a plain character typed inside a ```fence body is OPAQUE to the block
// grammar — it cannot change structure — so the spin (and the `blockElement.outerHTML` rebuild + the
// task-161 keep-last overlay re-LAYOUT that ride on it) is pure cost. Measured: a mermaid-label edit
// dropped from ~63 ms/keystroke to ~0 with the spin skipped (0 ms typing-phase blocking across d2 /
// mermaid / graphviz / echarts / flowchart / stl — see tasks/175). The typed char is already in the live
// source text node (native contenteditable), and `getMarkdown` serialises from that text node, so the
// SAVE stays byte-correct even with the spin skipped; ONE real spin+render runs on the 220 ms settle to
// reconcile the structure + re-render the diagram.
//
// This module is the PURE escape-hatch predicate (unit-tested in isolation). The handler that schedules
// the settle re-spin lives in edit-activity.ts (it owns the quiet-timer); the esbuild patchIrFenceSpinSkip
// early-returns from ir/input.ts when window.__vmarkdTrySkipFenceSpin returns true.

/**
 * True when this keystroke can be safely deferred: a single plain character INSERTED (not a structural
 * event) with a COLLAPSED caret strictly inside a fenced source (`.vditor-ir__marker--pre`). Everything
 * else falls through to the real spin:
 *  - non-`insertText` (Enter/insertParagraph, paste/drop, IME composition, delete*, format) → spin;
 *  - composed / multi-char `data` → spin;
 *  - a backtick (could open/close the fence → structural) → spin;
 *  - a non-collapsed range (selection replace) → spin;
 *  - caret outside a fenced source body (prose, where any char can be structural) → spin.
 */
export function shouldSkipFenceSpin(
  range: Range | null | undefined,
  event: InputEvent | null | undefined,
): boolean {
  if (!event || event.inputType !== 'insertText') return false
  const data = event.data
  if (typeof data !== 'string' || data.length !== 1) return false
  if (data === '`') return false
  if (!range || !range.collapsed) return false
  const sc: Node | null = range.startContainer
  if (!sc) return false
  const el =
    sc.nodeType === Node.TEXT_NODE ? sc.parentElement : (sc as Element | null)
  return !!el?.closest('.vditor-ir__marker--pre')
}
