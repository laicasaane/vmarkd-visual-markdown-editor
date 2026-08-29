// Task 218 — pasting spreadsheet data (TSV from Excel/Sheets, or CSV) inserts plain text. A
// "paste from spreadsheet" affordance is standard in markdown editors and there was zero csv
// handling anywhere. Rides the shared pre-Vditor hook built for task 242 (paste-transform.ts), so
// there is ONE transform point, not two competing paste interceptors.

// Hard cap. A pathological paste (a whole exported sheet) should fall back to plain text rather
// than build a megabyte of pipe table the editor then has to re-render on every keystroke. Rows and
// columns are capped separately because either one alone is enough to make the table unusable.
const MAX_ROWS = 200
const MAX_COLS = 50
const MAX_CHARS = 200_000

interface DelimitedTable {
  rows: string[][]
  delimiter: '\t' | ','
}

// Split ONE line on `delim`, honouring RFC4180 double-quoted fields (a quoted field may contain the
// delimiter, and "" is a literal quote). Tab-separated exports do not quote, but running both
// through the same parser means a quoted CSV and a plain TSV cannot diverge in cell splitting.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: char-by-char CSV/TSV cell splitter with quote/escape/delimiter state; pre-existing (task 469 baseline)
function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cur += c
      }
    } else if (c === '"' && cur === '') {
      quoted = true
    } else if (c === delim) {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

/**
 * Recognise `text` as delimited data, or return null. Tab is tried FIRST and is the only delimiter
 * that can be trusted blind: a block whose every line splits into the same 2+ tab-separated fields
 * is spreadsheet data, essentially never prose. Comma is the same shape but a real false-positive
 * risk (any two lines of comma-ful prose), which is why the SETTING — not this function — decides
 * whether comma is even offered.
 */
export function sniffDelimited(text: string): DelimitedTable | null {
  if (!text || text.length > MAX_CHARS) return null
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length < 2 || lines.length > MAX_ROWS) return null
  for (const delim of ['\t', ','] as const) {
    const rows = lines.map((l) => splitLine(l, delim))
    const width = rows[0].length
    if (width < 2 || width > MAX_COLS) continue
    // EVERY row must have the same width. A ragged block is not a table, and guessing how to pad it
    // would silently invent cells the user never wrote.
    if (!rows.every((r) => r.length === width)) continue
    // At least one cell must hold something — a block of empty delimiters is not data.
    if (!rows.some((r) => r.some((c) => c.trim() !== ''))) continue
    return { rows, delimiter: delim }
  }
  return null
}

// A cell's own `|` would end the column early, and a newline inside a quoted field would end the
// ROW — both silently corrupt the table rather than failing visibly.
function escapeCell(cell: string): string {
  return cell.trim().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * GFM pipe table. The FIRST row becomes the header, because that is what a spreadsheet selection
 * almost always leads with and GFM has no headerless table — a table with an empty header row is
 * uglier than a wrong guess the user can fix by typing.
 */
export function toPipeTable(rows: string[][]): string {
  const width = rows[0].length
  const line = (cells: string[]) => `| ${cells.map(escapeCell).join(' | ')} |`
  return [
    line(rows[0]),
    `|${' --- |'.repeat(width)}`,
    ...rows.slice(1).map(line),
  ].join('\n')
}

// `vmde.paste.csvFormat`. The task floated `ask | always | off` with `ask` as default, and said
// TSV could default to always-convert safely — "decide + pin". Decided: NO `ask`. An inline
// toast/choice on every spreadsheet paste is a lot of machinery to make the common case slower, and
// the false-positive risk is not uniform across delimiters. So the axis is WHICH DELIMITER is
// trusted, not whether to interrupt:
//   tsv (default) — convert tab-separated only. A 2+ column, 2+ row tab-separated block is
//                   spreadsheet data; prose does not contain aligned tabs.
//   always        — also convert comma-separated. Opt-in, because two lines of comma-ful prose
//                   genuinely match.
//   off           — never convert.
type CsvMode = 'tsv' | 'always' | 'off'
let csvMode: CsvMode = 'tsv'
export function applyPasteCsvSetting(mode: string | undefined): void {
  csvMode = mode === 'always' || mode === 'off' ? mode : 'tsv'
}

/** The markdown table `text` should become, or null to leave the paste alone. */
export function pastedTable(text: string): string | null {
  if (csvMode === 'off') return null
  const found = sniffDelimited(text)
  if (!found) return null
  if (found.delimiter === ',' && csvMode !== 'always') return null
  return toPipeTable(found.rows)
}
