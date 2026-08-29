import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

interface LuteInstance {
  Md2VditorDOM(markdown: string): string
  Md2VditorIRDOM(markdown: string): string
  SetSpin(value: boolean): void
  SetVditorWYSIWYG(value: boolean): void
  VditorDOM2Md(dom: string): string
  VditorIRDOM2Md(dom: string): string
}

let lute: LuteInstance
const trimTail = (value: string) => value.replace(/\n+$/, '')
const roundTrip = (markdown: string, mode: 'ir' | 'wysiwyg') =>
  trimTail(
    mode === 'ir'
      ? lute.VditorIRDOM2Md(lute.Md2VditorIRDOM(markdown))
      : lute.VditorDOM2Md(lute.Md2VditorDOM(markdown)),
  )

beforeAll(() => {
  const source = readFileSync(
    fileURLToPath(
      new URL('../../media-src/vendor/lute/lute.min.js', import.meta.url),
    ),
    'utf8',
  )
  const sandbox: Record<string, unknown> = {
    TextDecoder,
    TextEncoder,
    clearInterval,
    clearTimeout,
    console,
    setInterval,
    setTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lute.min.js' })
  lute = (sandbox as { Lute: { New(): LuteInstance } }).Lute.New()
  lute.SetVditorWYSIWYG(true)
  lute.SetSpin(true)
})

describe.each(['ir', 'wysiwyg'] as const)(
  'refreshed Lute %s serializer contracts',
  (mode) => {
    it.each([
      ['comments', '<!-- kept -->\n\nparagraph'],
      ['callouts', '> [!NOTE]\n> body'],
      ['wiki nodes', 'before [[Page Name|Label]] after'],
      ['ordered-list ordinals', '3. third\n4. fourth'],
    ])('preserves %s', (_name, markdown) => {
      expect(roundTrip(markdown, mode)).toBe(markdown)
    })

    it('keeps soft-break line count and reaches stable bytes', () => {
      const once = roundTrip('soft alpha\nsoft beta  \nhard gamma', mode)
      expect(once.split('\n')).toHaveLength(3)
      expect(roundTrip(once, mode)).toBe(once)
    })

    it('preserves whole-list looseness and ordinals at stable bytes', () => {
      const once = roundTrip(
        '3. third paragraph\n\n   continuation\n\n4. fourth paragraph',
        mode,
      )
      expect(once).toContain('3. third paragraph')
      expect(once).toContain('4. fourth paragraph')
      expect(once).toContain('\n\n')
      expect(roundTrip(once, mode)).toBe(once)
    })

    it('normalizes ambiguous inline-mark spacing inside a table', () => {
      const fixture = readFileSync(
        fileURLToPath(
          new URL('../vscode-e2e/fixtures/inline-code-gap.md', import.meta.url),
        ),
        'utf8',
      )
      expect(roundTrip(fixture, mode)).toContain('CELL-EDIT see **notes** here')
    })

    it('escapes list-marker-shaped continuation text instead of changing its structure', () => {
      const markdown =
        '- **Shared helper.** Details:\n' +
        '      `test/backend/lute-artifact.ts`:\n' +
        '      - `isLuteArtifactBuilt(root)` keeps the literal evidence line'
      expect(roundTrip(markdown, mode)).toContain(
        '  \\- `isLuteArtifactBuilt(root)`',
      )
    })
  },
)

it('drops injected data-render preview DOM from IR serialization', () => {
  const ir = lute.Md2VditorIRDOM('before')
  const decorated = `${ir}<pre class="vditor-ir__preview" data-render="2"><code>injected preview</code></pre>`
  expect(trimTail(lute.VditorIRDOM2Md(decorated))).toBe('before')
})
