import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as marketplaceImages from '../../scripts/marketplace-images.mjs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const baseImagesUrl =
  marketplaceImages.marketplaceImagesBaseFromManifest(manifest)
const validate = (markdown: string, documentName: string) =>
  marketplaceImages.validateMarketplaceImages(
    markdown,
    documentName,
    baseImagesUrl,
  )

describe('Marketplace Markdown image contract', () => {
  it('derives the image base from the manifest repository', () => {
    expect(
      marketplaceImages.marketplaceImagesBaseFromManifest({
        repository: {
          type: 'git',
          url: 'https://github.com/laicasaane/vmde.git',
        },
      }),
    ).toBe('https://github.com/laicasaane/vmde/raw/HEAD')
  })

  it('resolves relative raster images through the explicit HTTPS base', () => {
    expect(validate('![Screenshot](media/vmde.png)', 'README.md')).toEqual([
      `${baseImagesUrl}/media/vmde.png`,
    ])
  })

  it('uses the repository-derived base supplied by the package workflow', () => {
    const base = marketplaceImages.marketplaceImagesBaseFromManifest({
      repository: 'https://github.com/example/extension.git',
    })
    expect(
      marketplaceImages.validateMarketplaceImages(
        '![Screenshot](media/example.png)',
        'README.md',
        base,
      ),
    ).toEqual([
      'https://github.com/example/extension/raw/HEAD/media/example.png',
    ])
  })

  it.each([
    ['Markdown HTTP image', '![x](http://example.com/x.png)', 'HTTPS'],
    ['HTML HTTP image', '<img src="http://example.com/x.png">', 'HTTPS'],
    ['local SVG', '![x](media/x.svg)', 'SVG'],
    ['SVG data URL', '![x](data:image/svg+xml;base64,PHN2Zy8+)', 'SVG'],
    ['inline SVG', '<svg viewBox="0 0 1 1"></svg>', 'SVG'],
    [
      'unapproved SVG host',
      '![x](https://example.com/status.svg)',
      'approved badge provider',
    ],
    [
      'non-workflow GitHub SVG',
      '![x](https://github.com/org/repo/raw/HEAD/logo.svg)',
      'approved badge provider',
    ],
  ])('rejects %s', (_name, markdown, message) => {
    expect(() => validate(markdown, 'README.md')).toThrow(message)
  })

  it.each([
    'https://img.shields.io/badge/build-passing.svg',
    'https://github.com/org/repo/actions/workflows/ci.yml/badge.svg',
  ])('accepts an approved SVG badge: %s', (url) => {
    expect(validate(`![status](${url})`, 'README.md')).toEqual([url])
  })

  it('accepts the current README and CHANGELOG image references', () => {
    expect(
      marketplaceImages.validateMarketplaceImageFiles(undefined, baseImagesUrl),
    ).toEqual([
      `${baseImagesUrl}/media/vmde.png`,
      `${baseImagesUrl}/media/settings.png`,
    ])
  })
})
