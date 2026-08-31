import { describe, expect, it, vi } from 'vitest'

describe('incremental seed source preparation', () => {
  it('extracts a cheap deterministic source signature', async () => {
    const module = (await import(
      '../../src/shared/incremental-admission'
    )) as any
    expect(typeof module.sourceComplexitySignature).toBe('function')
    if (typeof module.sourceComplexitySignature !== 'function') return
    const markdown = [
      '# Title',
      '',
      'paragraph **bold** [link](./note.md) `code`',
      '',
      '- one',
      '  - nested',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
    ].join('\n')

    expect(module.sourceComplexitySignature(markdown)).toEqual({
      chars: markdown.length,
      lines: 15,
      blockHints: 5,
      listItems: 2,
      tableRows: 3,
      inlineRich: 3,
      fencedBlocks: 1,
    })
  })

  it('prepares nested and 700-block candidates but rejects a small control', async () => {
    const module = (await import(
      '../../src/shared/incremental-admission'
    )) as any
    expect(typeof module.incrementalSeedPreparation).toBe('function')
    if (
      typeof module.sourceComplexitySignature !== 'function' ||
      typeof module.incrementalSeedPreparation !== 'function'
    )
      return

    const nested = Array.from(
      { length: 180 },
      (_, index) =>
        `## Section ${index}\n\n- first **bold** [link](./n.md)\n  - nested \`code\`\n\nparagraph paragraph paragraph paragraph paragraph paragraph paragraph paragraph`,
    ).join('\n\n')
    const flat = Array.from(
      { length: 700 },
      (_, index) => `plain paragraph ${index}`,
    ).join('\n\n')
    const small = '# Small\n\nordinary text\n'

    expect(
      module.incrementalSeedPreparation(
        module.sourceComplexitySignature(nested),
      ),
    ).toEqual({ prepare: true, reason: 'source-structure' })
    expect(
      module.incrementalSeedPreparation(module.sourceComplexitySignature(flat)),
    ).toEqual({ prepare: true, reason: 'source-blocks' })
    expect(
      module.incrementalSeedPreparation(
        module.sourceComplexitySignature(small),
      ),
    ).toEqual({ prepare: false, reason: 'ordinary' })
  })

  it('builds an exact seed payload only for eligible source', async () => {
    const module = (await import(
      '../../src/shared/incremental-admission'
    )) as any
    expect(typeof module.buildIncrementalSeedPayload).toBe('function')
    if (typeof module.buildIncrementalSeedPayload !== 'function') return
    const large = Array.from(
      { length: 700 },
      (_, index) => `paragraph ${index}`,
    ).join('\n\n')
    const canonicalize = vi.fn(() => 'CANONICAL\n')
    const times = [10, 35]

    expect(
      module.buildIncrementalSeedPayload(
        large,
        canonicalize,
        () => times.shift()!,
      ),
    ).toMatchObject({
      markdown: 'CANONICAL\n',
      reason: 'source-blocks',
      hostMs: 25,
      source: module.sourceComplexitySignature(large),
    })
    expect(canonicalize).toHaveBeenCalledTimes(1)

    canonicalize.mockClear()
    expect(
      module.buildIncrementalSeedPayload(
        '# Small\n\ntext\n',
        canonicalize,
        () => 0,
      ),
    ).toBeUndefined()
    expect(canonicalize).not.toHaveBeenCalled()

    expect(
      module.buildIncrementalSeedPayload(
        large,
        () => undefined,
        () => 0,
      ),
    ).toBeUndefined()
  })
})
