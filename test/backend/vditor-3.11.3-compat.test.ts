import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string) =>
  readFileSync(
    fileURLToPath(
      new URL(
        `../../media-src/node_modules/vditor/${relative}`,
        import.meta.url,
      ),
    ),
    'utf8',
  )

describe('Vditor 3.11.3 upstream compatibility contracts', () => {
  it('loads the isolated 3.11.3 trial source', () => {
    expect(JSON.parse(read('package.json')).version).toBe('3.11.3')
  })

  it('ships the empty-list exit helper used by Enter and Backspace', () => {
    const source = read('src/ts/util/fixBrowserBehavior.ts')
    expect(source).toContain('export const exitEmptyListItem =')
    expect(source.match(/exitEmptyListItem\(liElement\)/g)).toHaveLength(2)
  })

  it('suppresses duplicate render destinations for reference links', () => {
    const source = read('src/ts/util/fixBrowserBehavior.ts')
    expect(source).toContain('parent.Type === 33 && parent.LinkType === 3')
  })

  it('widens WYSIWYG spin input to the enclosing callout', () => {
    const source = read('src/ts/wysiwyg/input.ts')
    expect(source).toContain(
      'hasClosestByAttribute(range.startContainer, "data-type", "callout")',
    )
    expect(source).toContain('blockElement = calloutElement')
  })
})
