// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  filePathOfResourceUrl,
  imageMatchesPath,
  refreshChangedImages,
} from './image-refresh'

const RESOURCE = 'https://file+.vscode-resource.vscode-cdn.net'

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('filePathOfResourceUrl', () => {
  it('reads the on-disk path out of a webview resource url', () => {
    expect(filePathOfResourceUrl(`${RESOURCE}/home/me/docs/shot.png`)).toBe(
      '/home/me/docs/shot.png',
    )
  })

  it('percent-decodes and normalises a Windows drive path', () => {
    expect(filePathOfResourceUrl(`${RESOURCE}/C%3A/repo/my%20image.png`)).toBe(
      'c:/repo/my image.png',
    )
  })

  it('returns empty for a non-url', () => {
    expect(filePathOfResourceUrl('not a url')).toBe('')
  })
})

describe('imageMatchesPath', () => {
  it('matches the same file', () => {
    expect(
      imageMatchesPath(
        `${RESOURCE}/home/me/docs/shot.png`,
        '/home/me/docs/shot.png',
      ),
    ).toBe(true)
  })

  it('does not match a different file in the same folder', () => {
    expect(
      imageMatchesPath(
        `${RESOURCE}/home/me/docs/other.png`,
        '/home/me/docs/shot.png',
      ),
    ).toBe(false)
  })

  it('does not match a same-named file in another folder', () => {
    expect(
      imageMatchesPath(
        `${RESOURCE}/home/me/other/shot.png`,
        '/home/me/docs/shot.png',
      ),
    ).toBe(false)
  })

  it('is case-insensitive on the Windows drive letter only', () => {
    expect(imageMatchesPath(`${RESOURCE}/c%3A/r/a.png`, 'C:\\r\\a.png')).toBe(
      true,
    )
  })
})

describe('refreshChangedImages', () => {
  const addImage = (url: string, attr: string) => {
    const img = document.createElement('img')
    img.setAttribute('src', attr)
    // jsdom does not resolve `src` against a base href, so pin the resolved value the code reads.
    Object.defineProperty(img, 'src', { value: url, configurable: true })
    document.body.appendChild(img)
    return img
  }

  it('revalidates and re-sets only the matching images, leaving the attribute untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const hit = addImage(`${RESOURCE}/repo/shot.png`, 'shot.png')
    const miss = addImage(`${RESOURCE}/repo/other.png`, 'other.png')

    const count = await refreshChangedImages(document, ['/repo/shot.png'])

    expect(count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${RESOURCE}/repo/shot.png`, {
      cache: 'reload',
    })
    // The attribute is what Lute serializes back into the markdown — it must not gain a query.
    expect(hit.getAttribute('src')).toBe('shot.png')
    expect(miss.getAttribute('src')).toBe('other.png')
  })

  it('still re-sets the src when the revalidation fetch fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const img = addImage(`${RESOURCE}/repo/shot.png`, 'shot.png')
    const setAttribute = vi.spyOn(img, 'setAttribute')

    await refreshChangedImages(document, ['/repo/shot.png'])

    expect(setAttribute).toHaveBeenCalledWith('src', 'shot.png')
  })

  it('does nothing without paths', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    addImage(`${RESOURCE}/repo/shot.png`, 'shot.png')

    expect(await refreshChangedImages(document, [])).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
