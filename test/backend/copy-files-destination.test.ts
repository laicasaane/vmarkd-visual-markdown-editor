import { describe, expect, it, vi } from 'vitest'
import { resolveCopyFilesDestination } from '../../src/platform/copy-files-destination'

const context = {
  documentPath: '/workspace/docs/api/readme.md',
  workspaceFolderPath: '/workspace',
  workspaceFolderPaths: ['/workspace'],
  fileName: 'image.png',
  now: new Date('2026-09-01T12:34:56.789Z'),
}

describe('resolveCopyFilesDestination', () => {
  it('matches the official leading-workspace glob example and appends a file to a directory', () => {
    expect(
      resolveCopyFilesDestination(
        { '/docs/**/*': 'images/${documentBaseName}/' },
        context,
      ),
    ).toBe('/workspace/docs/api/images/readme/image.png')
  })

  it.each([
    ['docs/**/*.md', true],
    ['**/docs/**/readme.?d', true],
    ['**/*.{md,markdown}', true],
    ['notes/**/*', false],
  ])('matches %s with VS Code-style implicit roots', (glob, matches) => {
    expect(
      resolveCopyFilesDestination(
        { [glob]: 'matched/${fileName}' },
        context,
      ) !== undefined,
    ).toBe(matches)
  })

  it('uses the first matching map entry', () => {
    expect(
      resolveCopyFilesDestination(
        {
          '**/*.md': 'first/${fileName}',
          '/docs/**/*': 'second/${fileName}',
        },
        context,
      ),
    ).toBe('/workspace/docs/api/first/image.png')
  })

  it('expands every documented path/file/time variable', () => {
    const result = resolveCopyFilesDestination(
      {
        '**/*.md': [
          '${documentDirName}',
          '${documentRelativeDirName}',
          '${documentFileName}',
          '${documentBaseName}',
          '${documentExtName}',
          '${documentFilePath}',
          '${documentRelativeFilePath}',
          '${documentWorkspaceFolder}',
          '${fileName}',
          '${fileExtName}',
          '${unixTime}',
          '${isoTime}',
        ].join('|'),
      },
      context,
    )

    expect(result).toContain(
      '/workspace/docs/api|docs/api|readme.md|readme|md|/workspace/docs/api/readme.md|docs/api/readme.md|/workspace|image.png|png|1788266096789|2026-09-01T12:34:56.789Z',
    )
  })

  it('applies snippet-style regex transforms and preserves escaped or unknown variables', () => {
    expect(
      resolveCopyFilesDestination(
        {
          '**/*.md':
            'images/${documentBaseName/(.).*/$1/}/\\${fileName}/${unknown}',
        },
        context,
      ),
    ).toBe('/workspace/docs/api/images/r/${fileName}/${unknown}')
  })

  it('treats a leading destination slash as workspace-rooted and supports renaming', () => {
    expect(
      resolveCopyFilesDestination(
        { '/docs/**/*': '/media/${documentBaseName}.${fileExtName}' },
        context,
      ),
    ).toBe('/workspace/media/readme.png')
  })

  it('uses the document directory fallbacks outside a workspace', () => {
    expect(
      resolveCopyFilesDestination(
        { '**/*.md': '${documentWorkspaceFolder}/${documentRelativeDirName}/' },
        {
          ...context,
          workspaceFolderPath: undefined,
          workspaceFolderPaths: [],
        },
      ),
    ).toBe('/workspace/docs/api/workspace/docs/api/image.png')
  })

  it('matches a leading glob against every root in a multi-root workspace', () => {
    expect(
      resolveCopyFilesDestination(
        { '/docs/**/*': 'images/${fileName}' },
        {
          ...context,
          documentPath: '/second/docs/guide.md',
          workspaceFolderPath: '/second',
          workspaceFolderPaths: ['/first', '/second'],
        },
      ),
    ).toBe('/second/docs/images/image.png')
  })

  it('falls through cleanly on no match and reports an invalid transform', () => {
    const onTransformError = vi.fn()
    expect(
      resolveCopyFilesDestination(
        { 'notes/**/*': 'images/${fileName}' },
        { ...context, onTransformError },
      ),
    ).toBeUndefined()
    expect(
      resolveCopyFilesDestination(
        { '**/*.md': 'images/${documentBaseName/[/x/}/${fileName}' },
        { ...context, onTransformError },
      ),
    ).toBe('/workspace/docs/api/images/readme/image.png')
    expect(onTransformError).toHaveBeenCalledOnce()
  })

  it('fails closed on an invalid glob instead of breaking uploads', () => {
    expect(
      resolveCopyFilesDestination(
        { '**/[z-a].md': 'images/${fileName}' },
        context,
      ),
    ).toBeUndefined()
  })
})
