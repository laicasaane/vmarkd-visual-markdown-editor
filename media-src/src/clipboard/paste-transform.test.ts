import { beforeEach, describe, expect, it } from 'vitest'
import { applyPasteCsvSetting } from './paste-table'
import {
  ANSI_PATTERNS,
  hasAnsi,
  stripAnsi,
  transformPastedText,
} from './paste-transform'

const ESC = '\x1b'

// Task 242 — probe-confirmed twice that raw ESC bytes survive a real Ctrl+V into the saved
// markdown (4 of them from one coloured log line). The risk running the other way is eating bytes
// the user meant to keep, so the guards below matter as much as the strips.
describe('stripAnsi (task 242)', () => {
  it('removes SGR colour sequences and keeps the text between them', () => {
    expect(stripAnsi(`${ESC}[31mred${ESC}[0m and ${ESC}[1mbold${ESC}[0m`)).toBe(
      'red and bold',
    )
  })

  it('removes cursor-movement and erase CSI sequences', () => {
    expect(stripAnsi(`before${ESC}[2K${ESC}[1Aafter`)).toBe('beforeafter')
    expect(stripAnsi(`${ESC}[H${ESC}[2Jcleared`)).toBe('cleared')
  })

  it('removes an OSC window-title sequence with either terminator', () => {
    expect(stripAnsi(`${ESC}]0;my titletext`)).toBe('text')
    expect(stripAnsi(`${ESC}]0;my title${ESC}\\text`)).toBe('text')
  })

  it('removes an Fe escape (ESC + one byte in 0x40-0x5F)', () => {
    // ESC D = index. NOT `ESC ( B` — that is the nF class, and mislabelling it here is what
    // surfaced the missing class in the first place.
    expect(stripAnsi(`${ESC}Dplain`)).toBe('plain')
  })

  it('removes an nF charset designation, which `script` captures emit', () => {
    expect(stripAnsi(`${ESC}(Bplain`)).toBe('plain')
  })

  it('leaves the Fs range alone — ESC + an ordinary letter is usually data', () => {
    expect(stripAnsi(`${ESC}cplain`)).toBe(`${ESC}cplain`)
  })

  it('handles a realistic multi-line log capture', () => {
    const log = [
      `${ESC}[32m2026-07-30 10:00:00${ESC}[0m ${ESC}[1mINFO${ESC}[0m starting`,
      `${ESC}[31m2026-07-30 10:00:01${ESC}[0m ${ESC}[1mERROR${ESC}[0m boom`,
    ].join('\n')
    expect(stripAnsi(log)).toBe(
      '2026-07-30 10:00:00 INFO starting\n2026-07-30 10:00:01 ERROR boom',
    )
    expect(stripAnsi(log)).not.toContain(ESC)
  })

  it('leaves text with no escapes byte-identical', () => {
    const text = 'plain [31m text with literal brackets and a \\u001b mention'
    expect(stripAnsi(text)).toBe(text)
  })

  it('does not eat a lone ESC that starts no recognised sequence', () => {
    // An unrecognised sequence is likelier to be data than a control code, and silently dropping
    // bytes is the failure mode this fix exists to prevent.
    expect(stripAnsi(`a${ESC}zb`)).toBe(`a${ESC}zb`)
  })

  it('does not touch tabs or newlines — task 218 sniffs delimiters on the result', () => {
    expect(stripAnsi('a\tb\nc\td')).toBe('a\tb\nc\td')
  })

  it('is idempotent', () => {
    const once = stripAnsi(`${ESC}[31mred${ESC}[0m`)
    expect(stripAnsi(once)).toBe(once)
  })
})

describe('hasAnsi', () => {
  it('detects and rejects correctly, and is repeatable across calls', () => {
    // The patterns carry the /g flag, so a stale lastIndex would make the SECOND identical call
    // answer differently — the classic global-regex bug.
    for (let i = 0; i < 3; i++) {
      expect(hasAnsi(`${ESC}[31mred`)).toBe(true)
      expect(hasAnsi('no escapes here')).toBe(false)
    }
  })
})

describe('transformPastedText', () => {
  beforeEach(() => applyPasteCsvSetting(undefined))

  it('always strips — the repair is not gated by a setting', () => {
    // The `keep` mode task 242 specified was dropped as redundant: pasting into a code fence is
    // already literal, which is a better escape hatch than a global switch.
    expect(transformPastedText(`${ESC}[31mred${ESC}[0m`)).toBe('red')
  })

  it('passes an empty paste straight through', () => {
    expect(transformPastedText('')).toBe('')
  })

  it('leaves a paste into a CODE context completely literal', () => {
    // The task-191 P0-9 contract. Pasting a coloured log into a fence is a deliberate act to
    // preserve exact bytes — and it is also the escape hatch for anyone who wants them.
    const raw = `${ESC}[31mred${ESC}[0m`
    expect(transformPastedText(raw, true)).toBe(raw)
  })

  it('does not build a table out of a TSV paste inside a fence', () => {
    // Task 218 rides this same hook; converting there would corrupt the code block outright.
    expect(transformPastedText('a\tb\n1\t2', true)).toBe('a\tb\n1\t2')
  })

  it('converts a TSV paste outside a fence — the two tasks share ONE hook', () => {
    expect(transformPastedText('a\tb\n1\t2')).toContain('| a | b |')
  })

  it('strips escapes BEFORE sniffing delimiters, so a coloured TSV still becomes a table', () => {
    // Ordering matters: an escape sequence sitting between two tabs would break the column count.
    expect(transformPastedText(`${ESC}[32ma${ESC}[0m\tb\n1\t2`)).toContain(
      '| a | b |',
    )
  })
})

describe('ANSI_PATTERNS', () => {
  it('is exported table-driven, as task 242 asked, not one opaque regex', () => {
    expect(ANSI_PATTERNS.map((p) => p.name)).toEqual(['CSI', 'OSC', 'Fe', 'nF'])
  })
})
