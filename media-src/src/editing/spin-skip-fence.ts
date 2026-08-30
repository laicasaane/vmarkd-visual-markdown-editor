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
// early-returns from ir/input.ts when window.__vmdeTrySkipFenceSpin returns true.

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
const isSingleCodePoint = (value: string): boolean => [...value].length === 1

const isInertProseCodePoint = (value: string): boolean =>
  /[\p{L}\p{M}]/u.test(value) ||
  (/\p{N}/u.test(value) && !/[0-9]/.test(value)) ||
  /\p{Extended_Pictographic}/u.test(value)

function followsUnicodeWord(range: Range, text: Text): boolean {
  if (range.startOffset <= 0) return false
  const before = [...(text.textContent ?? '').slice(0, range.startOffset)].at(
    -1,
  )
  return !!before && /[\p{L}\p{M}\p{N}]/u.test(before)
}

export function shouldSkipFenceSpin(
  range: Range | null | undefined,
  event: InputEvent | null | undefined,
): boolean {
  if (event?.inputType !== 'insertText') return false
  const data = event.data
  if (typeof data !== 'string' || !isSingleCodePoint(data)) return false
  if (data === '`') return false
  if (!range?.collapsed) return false
  const sc: Node | null = range.startContainer
  if (!sc) return false
  const el =
    sc.nodeType === Node.TEXT_NODE ? sc.parentElement : (sc as Element | null)
  return !!el?.closest('.vditor-ir__marker--pre')
}

// Task 180 — prose-side skip predicate. Prose is far harder than a fenced body: MANY chars are
// structural there. So we skip ONLY a provably-inert keystroke and let EVERY markdown-active char fall
// through to the real spin. The skip set:
//   - any Unicode letter/mark, non-ASCII number, or single extended pictograph — inert in prose: it
//     can't start a CommonMark block marker (`#`/`-`/`*`/`>`/ASCII digit-`.`),
//     and inside an inline construct (`*x*`, `[x]`, `` `x` ``) it's just content (the delimiters define
//     the token, and the closing delimiter — a non-letter — falls through and re-spins);
//   - a SPACE or DIGIT only MID-TOKEN (the char immediately before is alphanumeric) — an inter-word
//     space or in-word digit can't commit `## `/`- `/`1. ` or start a leading list/heading marker.
// Everything else — `#*_`~[]()!<>|\&$=-`, a space/digit at a marker position, Enter/paste/IME/delete,
// a non-collapsed range, a fenced source (task 175's domain) — falls through. The skipped char is
// already in the live text node (getMarkdown reads it → byte-correct save); a missed inline render
// (e.g. completing `*bold*`) self-heals on the 220 ms settle re-spin. ALWAYS ON (no user setting);
// `window.__vmdeFastProseEdit` is only a test seam (unset in production → the caller's `!== false` is ON).
export function shouldSkipProseSpin(
  range: Range | null | undefined,
  event: InputEvent | null | undefined,
): boolean {
  if (event?.inputType !== 'insertText') return false
  const data = event.data
  if (typeof data !== 'string' || !isSingleCodePoint(data)) return false
  if (!range?.collapsed) return false
  const sc: Node | null = range.startContainer
  if (!sc || sc.nodeType !== Node.TEXT_NODE) return false
  const el = (sc as Text).parentElement
  if (!el || el.closest('.vditor-ir__marker--pre')) return false // fenced source = task 175's domain
  if (!el.closest('p, li, h1, h2, h3, h4, h5, h6, [data-block]')) return false // a real prose block
  if (isInertProseCodePoint(data)) return true
  if (/[ 0-9]/.test(data)) {
    // space / digit only mid-token (never at a leading-marker or marker-committing position)
    return followsUnicodeWord(range, sc as Text)
  }
  return false // every markdown-active char falls through to the real spin
}
