// Task 229 — shared code-reference tokenizer (`src/foo.ts:42[:col]`).
//
// Pure text→matches detection, used by BOTH the webview decorator (media-src, which imports this
// file directly the same way custom-renderer.ts imports wiki-core.ts) and any host-side test that
// wants to reason about the same shapes without a live editor. Resolution (does the path exist?)
// and click-to-open live in asset-link-actions.ts — this module only recognises candidate shapes.
//
// Design note (measured, tmp/229-code-ref-spike/regex-test.mjs): the regex is intentionally a bit
// permissive (e.g. it will match "www.example.com:8080" — a bare host:port with no scheme has no
// syntactic tell apart from a file path). We don't try to fully disambiguate that in the tokenizer;
// the resolution gate downstream (`unresolved paths stay plain`) is the real filter — a "path" that
// isn't a real workspace file just never gets decorated. The tokenizer's job is narrower: reject the
// shapes that are UNAMBIGUOUSLY not a code reference (no extension → not a path at all — kills "at
// 1:30", "Chapter 12:30:45"; a scheme'd URL's `//` boundary — kills "http://host:port"; a Windows
// drive/backslash path — kills "C:\Users\...", "src\foo.ts:42").
export interface CodeRefMatch {
  /** The exact matched substring, e.g. "src/foo.ts:42:7". */
  source: string
  /** The path portion only, e.g. "src/foo.ts". */
  path: string
  /** 1-based line number as written. */
  line: number
  /** 1-based column, when present. */
  col?: number
  /** Offset of `source`'s first character within the input string. */
  index: number
}

// A path segment is `name` or `name/`, repeated, ending in a filename that has a real extension
// (`\.[A-Za-z0-9]+`) directly before the `:line`. Segment/extension characters are deliberately
// narrow (alnum, `_`, `-`, `.`) — no backslash, no leading `/` reachable as a match START (see the
// lookbehind) — which is what keeps Windows paths and absolute POSIX paths out (see module doc).
//
// Lookbehind `(?<![\w./\\-])`: the match must start at a real boundary — not mid-word, not right
// after another path/URL character. This is what blocks a scheme's "//" (blocks starting past the
// slash) and a Windows path's "\" (blocks starting past the backslash) without special-casing either.
//
// Lookahead `(?![\w:/])`: nothing that would extend the match follows — blocks a third `:group`
// (ambiguous, e.g. a `12:30:45`-shaped timestamp already failed on "no extension" but this also
// guards a genuine `a.ts:1:2:3`), a trailing word character, or a trailing `/` (host:port-shaped
// URLs are usually followed by a path segment; real code refs essentially never are).
export const CODE_REF_RE =
  /(?<![\w./\\-])((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.[A-Za-z0-9]+):(\d+)(?::(\d+))?(?![\w:/])/g

/** Find every candidate `path:line[:col]` reference in a plain text string. Pure — no resolution,
 *  no DOM. Caller is responsible for not feeding it text from a code fence / math / diagram source
 *  (that's a DOM-structural concern the webview decorator handles by skipping those subtrees). */
export function findCodeRefs(text: string): CodeRefMatch[] {
  CODE_REF_RE.lastIndex = 0
  const out: CodeRefMatch[] = []
  let m: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex exec() loop, explicit `!== null`
  while ((m = CODE_REF_RE.exec(text)) !== null) {
    out.push({
      source: m[0],
      path: m[1],
      line: Number(m[2]),
      col: m[3] !== undefined ? Number(m[3]) : undefined,
      index: m.index,
    })
  }
  return out
}

/** True when `text`, trimmed, is ENTIRELY one code reference and nothing else — the shape inline
 *  code chips require (task 229: "attribute-only for inline code, no DOM injection inside `<code>`"
 *  means we only ever decorate a whole `` `src/foo.ts:42` `` span, never a substring within one).
 *  Strips U+200B first: Vditor's WYSIWYG inline-code render carries a leading zero-width-space
 *  caret anchor inside the `<code>` textContent (measured, tmp/229-code-ref-spike/spike5.mjs) —
 *  `String.trim()` does NOT remove it (not Unicode White_Space), so a naive trim would leave the
 *  whole-span check permanently false for every WYSIWYG inline code ref. */
export function matchWholeCodeRef(text: string): CodeRefMatch | null {
  const trimmed = text.replace(/\u200B/g, '').trim()
  if (!trimmed) return null
  const matches = findCodeRefs(trimmed)
  if (matches.length !== 1) return null
  const only = matches[0]
  return only.source === trimmed ? only : null
}
