// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy/DOM deps so the handler logic (message shape + sanitized name) is unit-
// testable without a canvas: convertForUpload is a passthrough, fileToBase64 is fixed, and
// the timestamp is pinned for a deterministic name.
vi.mock('./image-convert', () => ({
  convertForUpload: vi.fn(async (f: File) => ({ blob: f, name: f.name })),
}))
vi.mock('../util/utils', () => ({ fileToBase64: vi.fn(async () => 'B64DATA') }))
vi.mock('../util/format-timestamp', () => ({
  formatTimestamp: () => '20260101_000000',
}))

import { createUploadHandler, uploadedMarkup } from './upload-handler'

const png = (name: string) =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })

describe('createUploadHandler', () => {
  let post: ReturnType<typeof vi.fn>
  beforeEach(() => {
    post = vi.fn()
    ;(window as unknown as { vscode: unknown }).vscode = { postMessage: post }
  })

  it('posts one upload with base64 + a timestamp-prefixed, sanitized name', async () => {
    await createUploadHandler(() => ({ imageFormat: 'webp' }))([
      png('photo.png'),
    ])
    expect(post).toHaveBeenCalledTimes(1)
    const msg = post.mock.calls[0][0]
    expect(msg.command).toBe('upload')
    expect(msg.files).toHaveLength(1)
    expect(msg.files[0].base64).toBe('B64DATA')
    expect(msg.files[0].name).toBe('20260101_000000_photo.png')
  })

  it('sanitizes a path-traversal file name before the wire (P1-18)', async () => {
    await createUploadHandler(() => ({}))([png('../../evil.png')])
    const name = post.mock.calls[0][0].files[0].name
    expect(name).not.toContain('..')
    expect(name).not.toContain('/')
  })

  it('carries every file of a multi-file upload in a single post', async () => {
    await createUploadHandler(() => ({}))([png('a.png'), png('b.png')])
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0].files).toHaveLength(2)
  })

  it('tolerates a missing image-options object (uses defaults)', async () => {
    await createUploadHandler(() => undefined)([png('x.png')])
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][0].files[0].name).toBe('20260101_000000_x.png')
  })
})

// The return half — what message-router inserts for an 'uploaded' href (task 435 item 2).
describe('uploadedMarkup', () => {
  it('embeds a .wav as an audio element, padded with blank lines', () => {
    expect(uploadedMarkup('assets/a.wav')).toBe(
      '\n\n<audio controls="controls" src="assets/a.wav"></audio>\n\n',
    )
  })

  it('matches the extension case-insensitively', () => {
    expect(uploadedMarkup('assets/A.WAV')).toContain('<audio')
  })

  it('keeps common image extensions as image markup', () => {
    expect(uploadedMarkup('assets/p.png')).toBe('\n\n![](assets/p.png)\n\n')
    expect(uploadedMarkup('assets/P.JPEG?rev=1#view')).toBe(
      '\n\n![](assets/P.JPEG?rev=1#view)\n\n',
    )
  })

  it.each([
    ['assets/notes.txt', '[notes.txt](assets/notes.txt)'],
    ['assets/report.PDF', '[report.PDF](assets/report.PDF)'],
    ['assets/noext', '[noext](assets/noext)'],
    [
      'assets/p.wave?download=1#part',
      '[p.wave](assets/p.wave?download=1#part)',
    ],
  ])('inserts an ordinary file link for %s', (href, link) => {
    expect(uploadedMarkup(href)).toBe(`\n\n${link}\n\n`)
  })

  it('escapes Markdown syntax in an ordinary file label without changing the href', () => {
    expect(uploadedMarkup('assets/a\\b[c].txt')).toBe(
      '\n\n[a\\\\b\\[c\\].txt](assets/a\\b[c].txt)\n\n',
    )
  })
})
