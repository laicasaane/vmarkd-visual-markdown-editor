import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyPasteCsvSetting,
  pastedTable,
  sniffDelimited,
  toPipeTable,
} from './paste-table'

// Task 218 — probe-confirmed that pasting TSV today inserts literal tab-separated text. The risk
// running the other way is a false positive turning ordinary prose into a table, so the rejection
// matrix carries as much weight as the conversions.
describe('sniffDelimited (task 218)', () => {
  it('recognises a TSV block', () => {
    const t = sniffDelimited('a\tb\tc\n1\t2\t3')
    expect(t?.delimiter).toBe('\t')
    expect(t?.rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('recognises a CSV block', () => {
    expect(sniffDelimited('a,b\n1,2')?.delimiter).toBe(',')
  })

  it('prefers TAB when a block contains both', () => {
    // Excel puts tabs between cells; a cell may itself contain a comma. Guessing comma here would
    // shred every such row.
    const t = sniffDelimited('name\tnote\nAda\tone, two')
    expect(t?.delimiter).toBe('\t')
    expect(t?.rows[1]).toEqual(['Ada', 'one, two'])
  })

  it('honours quoted fields containing the delimiter', () => {
    expect(sniffDelimited('a,b\n"one, two",3')?.rows[1]).toEqual([
      'one, two',
      '3',
    ])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(sniffDelimited('a,b\n"say ""hi""",3')?.rows[1]).toEqual([
      'say "hi"',
      '3',
    ])
  })

  it('rejects a single line — one row is not a table', () => {
    expect(sniffDelimited('a\tb\tc')).toBeNull()
  })

  it('rejects a single column', () => {
    expect(sniffDelimited('one\ntwo\nthree')).toBeNull()
  })

  it('rejects a RAGGED block rather than inventing cells to pad it', () => {
    expect(sniffDelimited('a\tb\tc\n1\t2')).toBeNull()
  })

  it('rejects ordinary prose that happens to contain commas', () => {
    expect(
      sniffDelimited(
        'First, we tried it.\nThen, when that failed, we tried again.',
      ),
    ).toBeNull()
  })

  it('rejects a block of empty delimiters', () => {
    expect(sniffDelimited('\t\n\t')).toBeNull()
  })

  it('rejects a paste past the row cap instead of building an unusable table', () => {
    const huge = Array.from({ length: 500 }, (_, i) => `${i}\t${i}`).join('\n')
    expect(sniffDelimited(huge)).toBeNull()
  })

  it('tolerates CRLF and a trailing newline — both are normal on the clipboard', () => {
    expect(sniffDelimited('a\tb\r\n1\t2\r\n')?.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('toPipeTable', () => {
  it('makes the first row the header', () => {
    expect(
      toPipeTable([
        ['name', 'qty'],
        ['apple', '3'],
      ]),
    ).toBe('| name | qty |\n| --- | --- |\n| apple | 3 |')
  })

  it('escapes a pipe inside a cell, which would otherwise end the column early', () => {
    expect(
      toPipeTable([
        ['a', 'b'],
        ['x|y', '2'],
      ]),
    ).toContain('| x\\|y | 2 |')
  })

  it('flattens a newline inside a cell, which would otherwise end the ROW', () => {
    expect(
      toPipeTable([
        ['a', 'b'],
        ['x\ny', '2'],
      ]),
    ).toContain('| x y | 2 |')
  })
})

describe('pastedTable — the vmarkd.paste.csvAsTable setting', () => {
  beforeEach(() => applyPasteCsvSetting(undefined))

  it('converts TSV by default', () => {
    expect(pastedTable('a\tb\n1\t2')).toContain('| a | b |')
  })

  it('does NOT convert CSV by default — comma-ful prose genuinely matches', () => {
    expect(pastedTable('a,b\n1,2')).toBeNull()
  })

  it('converts CSV only when explicitly opted in', () => {
    applyPasteCsvSetting('always')
    expect(pastedTable('a,b\n1,2')).toContain('| a | b |')
  })

  it('converts nothing when off', () => {
    applyPasteCsvSetting('off')
    expect(pastedTable('a\tb\n1\t2')).toBeNull()
  })

  it('treats an unknown value as the default rather than the riskiest option', () => {
    applyPasteCsvSetting('nonsense')
    expect(pastedTable('a\tb\n1\t2')).toContain('| a | b |')
    expect(pastedTable('a,b\n1,2')).toBeNull()
  })

  it('leaves a non-table paste alone', () => {
    expect(pastedTable('just some prose')).toBeNull()
  })
})
