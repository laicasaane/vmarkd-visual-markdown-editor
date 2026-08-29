import { expect, test } from './coverage-fixture'

for (const mode of ['ir', 'wysiwyg'] as const) {
  for (const softBreak2HardBreak of [true, false]) {
    test(`${mode} preserves soft and explicit hard-break identity through render, spin, and serialize with SetSoftBreak2HardBreak(${softBreak2HardBreak})`, async ({
      page,
    }) => {
      await page.goto('/auto-wrap-softbreak.html')
      await page.waitForFunction(() => (window as any).__ready === true)

      const result = await page.evaluate(
        ({ mode, softBreak2HardBreak }) => {
          const harness = (window as any).__autoWrapSoftbreak
          return {
            markdown: harness.markdown,
            ...harness.probe(mode, softBreak2HardBreak),
          }
        },
        { mode, softBreak2HardBreak },
      )

      expect(result.dom.match(/data-vmde-soft-break="1"/gu)).toHaveLength(1)
      expect(result.dom.match(/data-vmde-hard-break=/gu)).toHaveLength(2)
      expect(result.serialized).toBe(`${result.markdown}\n`)
      expect(result.spunDom.match(/data-vmde-soft-break="1"/gu)).toHaveLength(1)
      expect(result.spunDom.match(/data-vmde-hard-break=/gu)).toHaveLength(2)
      expect(result.spunSerialized).toBe(`${result.markdown}\n`)
    })
  }
}
