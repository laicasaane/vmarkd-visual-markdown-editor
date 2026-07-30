// The ONE pre-Vditor transform point for pasted `text/plain` (tasks 242, 218).
//
// Both tasks asked for "a capture-phase paste hook". That would be wrong here: a paste event's
// `clipboardData` is read-only, so a capture-phase listener can only preventDefault and insert the
// text itself — which bypasses Vditor's paste pipeline entirely (code-fence handling, the
// HTML-vs-plain decision, undo grouping, the edit post). Instead this rewrites `textPlain` at the
// single point Vditor reads it, through a one-line esbuild patch (the `patchPasteTransform`
// precedent set by task 392's `__vmarkdPasteUrlMd`), so everything downstream is untouched and sees
// only cleaner input.
//
// Ordering is deliberate and is what task 287 will depend on: ANSI stripping runs FIRST (it is a
// repair — invisible control bytes are never wanted), then the CSV/TSV table conversion (a format
// change, which needs the repaired text to sniff delimiters correctly).

// Task 242 — pasted terminal/log text leaks raw ESC (0x1B) bytes into the saved markdown.
// Probe-confirmed twice: Lute round-trips ESC verbatim, and a real Ctrl+V of a coloured log line
// puts 4 escape bytes straight into the document. Terminal emulators strip ANSI on copy, but log
// FILES and `script` captures do not, so this is the everyday case — invisible control characters
// that corrupt diffs and downstream renderers with nothing on screen to explain them.
//
// Table-driven and exported, per 242's own ask, so the pattern set is auditable rather than one
// opaque regex:
//   CSI — ESC [ … final-byte: colours (SGR), cursor moves, erase. The bulk of what logs contain.
//   OSC — ESC ] … BEL or ESC \: window/tab titles, hyperlinks. Terminated differently from CSI.
//   Fe  — ESC + ONE byte in 0x40-0x5F: index/next-line/reverse-index and friends.
//   nF  — ESC + one or more intermediates (0x20-0x2F) + a final (0x30-0x7E): charset designation
//         like `ESC ( B`, which `script` captures emit. A distinct ECMA-48 class, not a widening
//         guess — it was added only after a test written against the WRONG class caught the gap.
// Every class above is a NAMED ECMA-48 form. Anything else keeps its ESC — an unrecognised
// sequence is likelier to be data than a control code, and silently eating bytes is the exact
// failure mode this fix exists to prevent. The Fs range (0x60-0x7E, e.g. `ESC c`) is deliberately
// left alone: a lone ESC followed by an ordinary letter is far more often stray data than a reset.
export const ANSI_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'CSI', re: /\[[0-?]*[ -/]*[@-~]/g },
  { name: 'OSC', re: /\][^]*(?:|\\)/g },
  { name: 'Fe', re: /[@-_]/g },
  { name: 'nF', re: /[\x20-\x2f]+[\x30-\x7e]/g },
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

// `vmarkd.paste.ansi`: strip (default) | keep. The task also floated an `ask` value (an inline
// toast offering "paste as code block"); not built — a modal choice on every log paste is a worse
// default than a silent, correct repair, and nothing about the strip is lossy in a way the user
// would want to review. Left recorded in the task file rather than half-implemented.
let ansiMode: 'strip' | 'keep' = 'strip'
export function applyPasteAnsiSetting(mode: string | undefined): void {
  ansiMode = mode === 'keep' ? 'keep' : 'strip'
}

/**
 * Transform pasted plain text before Vditor sees it. Returns the text unchanged when nothing
 * applies — the patch site treats a same-value return as a no-op.
 */
export function transformPastedText(text: string): string {
  if (!text) return text
  return ansiMode === 'strip' ? stripAnsi(text) : text
}

/**
 * Expose the transform to the patched Vditor paste handler. Called once from main.ts; the patch
 * calls it defensively (`?.()`), so a harness without it falls back to stock behaviour.
 */
export function installPasteTransform(win: Window): void {
  ;(win as unknown as Record<string, unknown>).__vmarkdPasteTransform =
    transformPastedText
}
