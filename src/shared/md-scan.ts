// Line-level markdown scanning primitives shared by the pure host modules
// (audit 185/3e — these existed as three near-identical FENCE copies and two
// table-row-split copies that could drift independently).

/** Opening/closing fence of a code block (``` or ~~~), CommonMark-strict: at most
 *  3 leading spaces (4+ is an indented code block). Group 1 = the fence marker. */
export const FENCE = /^\s{0,3}(`{3,}|~{3,})/

/** Loose fence variant for heading scans: ANY indent flips the fence state, so a
 *  `# comment` inside a list-indented fence never becomes an outline heading.
 *  Deliberately NOT the CommonMark opener rule — group 2 = the fence marker
 *  (group 1 = the indent). Consumer: outline-tree.ts. */
export const FENCE_ANY_INDENT = /^(\s*)(`{3,}|~{3,})/

/** Split one table row into raw cell strings: strip the optional leading/trailing
 *  `|`, split on unescaped `|`. Cells are NOT trimmed — byte-fidelity callers need
 *  the raw text; trim at the call site when comparing. */
export function splitRowCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split(/(?<!\\)\|/)
}

/** ATX heading line: `#` through `######`, a space, then the text, with an optional
 *  closing `##…` sequence stripped. Group 1 = the `#` run (level), group 2 = the
 *  heading text (may still carry a trailing `{#custom-id}` marker — callers that
 *  care, e.g. heading-slug.ts, strip that separately). Shared by outline-tree.ts
 *  (task 78, vscode.TextDocument) and heading-slug.ts (task 243, raw markdown
 *  string) — moved here so the two heading scanners can't drift on what counts as
 *  a heading line. */
export const ATX_HEADING = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/

/** Fence-toggle state machine for a line-by-line heading scan: feed it lines in order via
 *  `consume`, which flips fence state on an opening/closing FENCE_ANY_INDENT line and reports
 *  whether the CURRENT line should be skipped (fence delimiter itself, or fence interior) so a
 *  `# comment` inside a fence is never mistaken for a heading. Shared by outline-tree.ts (task
 *  78, vscode.TextDocument) and heading-slug.ts (task 243, raw markdown string) — the two heading
 *  scanners' loop bodies differ (line source, record shape) but this fence bookkeeping doesn't,
 *  and jscpd (task 502) flagged the two copies drifting apart as a real risk. */
export function createFenceTracker(): { consume(line: string): boolean } {
  let fence: string | null = null
  return {
    consume(line: string): boolean {
      const f = FENCE_ANY_INDENT.exec(line)
      if (f) {
        const marker = f[2][0]
        if (fence === null) fence = marker
        else if (marker === fence) fence = null
        return true
      }
      return fence !== null
    },
  }
}
