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
