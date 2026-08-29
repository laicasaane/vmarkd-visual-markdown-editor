// The ONE pre-Vditor transform point for pasted `text/plain` (tasks 242, 218).
//
// Both tasks asked for "a capture-phase paste hook". That would be wrong here: a paste event's
// `clipboardData` is read-only, so a capture-phase listener can only preventDefault and insert the
// text itself — which bypasses Vditor's paste pipeline entirely (code-fence handling, the
// HTML-vs-plain decision, undo grouping, the edit post). Instead this rewrites `textPlain` at the
// single point Vditor reads it, through a one-line esbuild patch (the `patchPasteTransform`
// precedent set by task 392's `__vmdePasteUrlMd`), so everything downstream is untouched and sees
// only cleaner input.
//
// Ordering is deliberate and is what task 287 will depend on: ANSI stripping runs FIRST (it is a
// repair — invisible control bytes are never wanted), then the CSV/TSV table conversion (a format
// change, which needs the repaired text to sniff delimiters correctly).

import { pastedTable } from './paste-table'

// Task 242 — pasted terminal/log text leaks raw ESC (0x1B) bytes into the saved markdown.
// Probe-confirmed twice: Lute round-trips ESC verbatim, and a real Ctrl+V of a coloured log line
// puts 4 escape bytes straight into the document. Terminal emulators strip ANSI on copy, but log
// FILES and `script` captures do not, so this is the everyday case — invisible control characters
// that corrupt diffs and downstream renderers with nothing on screen to explain them.
//
// Table-driven and exported, per 242's own ask, so the pattern set is auditable rather than one
// opaque regex:
//   CSI — ESC [ … final-byte: colours (SGR), cursor moves, erase. The bulk of what logs contain.
//   OSC — ESC ] … up to the next ESC (or end of string): window/tab titles, hyperlinks. When the
//         terminator is BEL it lands inside that swallowed span and is removed with it; when it is
//         the two-byte ST (ESC \), the pattern stops just short of the ST's own leading ESC
//         (`[^\x1b]*` cannot cross it) — that trailing `ESC \` is cleaned up by the Fe pass below,
//         not by this one, because `\` (0x5C) is itself inside Fe's 0x40-0x5F range. Not a gap:
//         stripAnsi runs every pattern over the FULL text in turn, so a leftover from one pass is
//         still caught by a later one.
//   Fe  — ESC + ONE byte in 0x40-0x5F: index/next-line/reverse-index and friends. MUST run after
//         CSI and OSC above — 0x40-0x5F contains both `[` (0x5B) and `]` (0x5D), so running it
//         first would swallow a CSI/OSC introducer and leave the parameter bytes as literal text.
//         The array order is load-bearing; do not alphabetise or otherwise reorder it.
//   nF  — ESC + one or more intermediates (0x20-0x2F) + a final (0x30-0x7E): charset designation
//         like `ESC ( B`, which `script` captures emit. A distinct ECMA-48 class, not a widening
//         guess — it was added only after a test written against the WRONG class caught the gap.
// Every class above is a NAMED ECMA-48 form. Anything else keeps its ESC — an unrecognised
// sequence is likelier to be data than a control code, and silently eating bytes is the exact
// failure mode this fix exists to prevent. The Fs range (0x60-0x7E, e.g. `ESC c`) is deliberately
// left alone: a lone ESC followed by an ordinary letter is far more often stray data than a reset.
export const ANSI_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI control sequences is the entire purpose of this pattern set
  { name: 'CSI', re: /\x1b\[[0-?]*[ -/]*[@-~]/g },
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI control sequences is the entire purpose of this pattern set
  { name: 'OSC', re: /\x1b\][^\x1b]*(?:|\x1b\\)/g },
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI control sequences is the entire purpose of this pattern set — must stay after CSI/OSC, see comment above
  { name: 'Fe', re: /\x1b[@-_]/g },
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI control sequences is the entire purpose of this pattern set
  { name: 'nF', re: /\x1b[\x20-\x2f]+[\x30-\x7e]/g },
]

export function hasAnsi(text: string): boolean {
  return ANSI_PATTERNS.some(({ re }) => {
    re.lastIndex = 0
    return re.test(text)
  })
}

export function stripAnsi(text: string): string {
  let out = text
  for (const { re } of ANSI_PATTERNS) {
    re.lastIndex = 0
    out = out.replace(re, '')
  }
  return out
}

// NO setting gates this. Task 242 specified `vmde.paste.ansi: strip | ask | keep`, and both of
// the non-default values were dropped on review:
//   `ask`  — a modal choice on every log paste is a worse default than a silent, correct repair,
//            and nothing about the strip is lossy in a way a user would want to review.
//   `keep` — redundant once pasting into a code fence stays literal (see `inCode` below). That is a
//            better escape hatch than a global switch: it is per-paste, needs no configuration, and
//            a fence is where raw terminal bytes belong anyway.
// A setting nobody would change is permanent surface area for nothing.

/**
 * Transform pasted plain text before Vditor sees it. Returns the text unchanged when nothing
 * applies — the patch site treats a same-value return as a no-op.
 *
 * `inCode` is computed at the patch site from vditor's own code-element expressions. A paste into a
 * fence stays LITERAL (the task-191 P0-9 contract) — including the ANSI strip: pasting a coloured
 * log into a code block is a deliberate act to preserve exact bytes, and it is also the escape
 * hatch for anyone who wants them.
 */
export function transformPastedText(text: string, inCode = false): string {
  if (!text || inCode) return text
  // ANSI first: it is a repair, and the table sniff must read repaired text or an escape sequence
  // sitting between two tabs would break the column count.
  const cleaned = stripAnsi(text)
  return pastedTable(cleaned) ?? cleaned
}

/**
 * Expose the transform to the patched Vditor paste handler. Called once from main.ts; the patch
 * calls it defensively (`?.()`), so a harness without it falls back to stock behaviour.
 */
export function installPasteTransform(win: Window): void {
  ;(win as unknown as Record<string, unknown>).__vmdePasteTransform =
    transformPastedText
}
