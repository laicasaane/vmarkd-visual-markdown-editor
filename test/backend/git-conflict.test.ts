import { describe, expect, it } from 'vitest'
import { hasGitConflictMarkers } from '../../src/writeback/git-conflict'

const CONFLICT = [
  '# Title',
  '',
  '<<<<<<< HEAD',
  'our line',
  '=======',
  'their line',
  '>>>>>>> feature-branch',
  '',
].join('\n')

describe('hasGitConflictMarkers', () => {
  it('finds a conflict git actually wrote', () => {
    expect(hasGitConflictMarkers(CONFLICT)).toBe(true)
  })

  it('finds one with CRLF line endings', () => {
    expect(hasGitConflictMarkers(CONFLICT.replace(/\n/g, '\r\n'))).toBe(true)
  })

  it('finds the diff3 form, which carries an extra ||||||| section', () => {
    expect(
      hasGitConflictMarkers(
        '<<<<<<< ours\na\n||||||| base\nb\n=======\nc\n>>>>>>> theirs\n',
      ),
    ).toBe(true)
  })

  it('finds a conflict whose branch names are absent (bare markers)', () => {
    expect(hasGitConflictMarkers('<<<<<<<\na\n=======\nb\n>>>>>>>\n')).toBe(
      true,
    )
  })

  it('finds the second of two conflicts even if the first is malformed', () => {
    expect(
      hasGitConflictMarkers(
        '<<<<<<< HEAD\nonly an opener\n\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> x\n',
      ),
    ).toBe(true)
  })
})

describe('hasGitConflictMarkers — what it must NOT flag', () => {
  it('leaves ordinary markdown alone', () => {
    expect(hasGitConflictMarkers('# Title\n\nSome prose.\n')).toBe(false)
  })

  it('does not mistake a setext heading for a conflict', () => {
    // `=======` under prose is a legal setext H1 — the exact false positive the task warned about.
    expect(hasGitConflictMarkers('A heading\n=======\n\nBody.\n')).toBe(false)
  })

  it('does not mistake a deeply nested blockquote for a conflict', () => {
    expect(hasGitConflictMarkers('> > > > > > > quoted\n')).toBe(false)
  })

  it('needs the markers in ORDER, not merely present', () => {
    expect(hasGitConflictMarkers('>>>>>>> a\n=======\n<<<<<<< b\n')).toBe(false)
  })

  it('needs all three — an opener and a divider are not enough', () => {
    expect(hasGitConflictMarkers('<<<<<<< HEAD\na\n=======\nb\n')).toBe(false)
  })

  it('does not fire on a divider of the wrong length', () => {
    expect(
      hasGitConflictMarkers('<<<<<<< HEAD\na\n========\nb\n>>>>>>> x\n'),
    ).toBe(false)
  })

  it('does not fire when a marker has leading text on its line', () => {
    expect(
      hasGitConflictMarkers('x <<<<<<< HEAD\na\n=======\nb\nx >>>>>>> y\n'),
    ).toBe(false)
  })

  it('does not fire on the markers written inline in prose', () => {
    // How this repo's own task file mentions them.
    expect(
      hasGitConflictMarkers(
        'Detect `^<{7} `, `^={7}$` and `^>{7} ` on open.\n',
      ),
    ).toBe(false)
  })

  it('is empty-safe', () => {
    expect(hasGitConflictMarkers('')).toBe(false)
  })
})

describe('the documented trade-off', () => {
  it('DOES flag a conflict shown inside a fenced code block', () => {
    // Deliberate: skipping fences would let a real conflict git wrote inside one through, and a
    // destroyed file costs more than one click on "Open in vMarkd anyway". Pinned so the choice
    // cannot be reversed by accident.
    expect(
      hasGitConflictMarkers(
        '# Git tutorial\n\n```\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n```\n',
      ),
    ).toBe(true)
  })
})
