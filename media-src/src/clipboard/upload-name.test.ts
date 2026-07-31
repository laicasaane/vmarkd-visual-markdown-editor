import { describe, expect, it } from 'vitest'
import { sanitizeUploadName } from './upload-name'

// task 191 P1-18 — the webview's first line of defense for a pasted/dropped image name.
describe('sanitizeUploadName', () => {
  it('leaves an already-safe name untouched (incl. multi-dot extensions + the timestamp prefix)', () => {
    expect(sanitizeUploadName('20260703_120000_pic.png')).toBe(
      '20260703_120000_pic.png',
    )
    expect(sanitizeUploadName('shot.webp')).toBe('shot.webp')
    expect(sanitizeUploadName('my-file_v2.tar.gz')).toBe('my-file_v2.tar.gz')
  })

  it('replaces EVERY run of disallowed chars, not just the first (the /g the old inline regex lacked)', () => {
    // Two separated bad runs → two underscores. The old `.replace(/[^\w-_.]+/, "_")`
    // (no /g) left the second run intact.
    expect(sanitizeUploadName('a b c.png')).toBe('a_b_c.png')
    expect(sanitizeUploadName('x@@y##z.png')).toBe('x_y_z.png')
  })

  it('kills every path-traversal segment: no `..` and no separators survive', () => {
    for (const evil of [
      '..',
      '../../etc/passwd',
      'a/../b.png',
      '..\\..\\win.ini',
      'foo/../../bar',
    ]) {
      const out = sanitizeUploadName(evil)
      expect(out, `no .. in ${evil} → ${out}`).not.toContain('..')
      expect(out, `no / in ${evil} → ${out}`).not.toContain('/')
      expect(out, `no \\ in ${evil} → ${out}`).not.toContain('\\')
    }
  })

  it('never returns an empty string (always a usable single segment)', () => {
    expect(sanitizeUploadName('')).toBe('_')
    expect(sanitizeUploadName('///')).not.toBe('')
    expect(sanitizeUploadName('..')).not.toBe('')
  })
})
