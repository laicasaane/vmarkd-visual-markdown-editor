import { expect, test } from './coverage-fixture'
import { openRewrapHarness, placeRewrapCaret } from './rewrap-helpers'

for (const mode of ['ir', 'wysiwyg', 'sv'] as const) {
  test(`auto-wrap fires after idle and owns a separate undo step in ${mode}`, async ({
    page,
  }) => {
    await openRewrapHarness(page, mode, true)
    await placeRewrapCaret(page, 'gamma', 5)

    await page.keyboard.type('z')
    if (mode === 'sv') {
      await page.evaluate(() => {
        const editor = (window as any).__rewrap.editor.vditor.sv.element
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if ((node.textContent ?? '').includes('backslash beta')) {
            ;(window as any).__svUntouchedTail = node
            return
          }
        }
        throw new Error('SV untouched tail node not found')
      })
    }
    const typedCanonical = await page.evaluate(() =>
      (window as any).__rewrap.editor.getValue(),
    )
    expect(typedCanonical).toContain('gammaz')
    const wrappedCanonical = typedCanonical.replace(
      'alpha beta gammaz delta epsilon',
      'alpha beta\ngammaz delta\nepsilon',
    )

    await expect
      .poll(() => page.evaluate(() => (window as any).__rewrap.state().syncs))
      .toBe(1)
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).__rewrap.editor.getValue()),
      )
      .toBe(wrappedCanonical)
    expect(wrappedCanonical).toContain('two-space alpha  \ntwo-space beta')
    expect(wrappedCanonical).toContain('backslash alpha\\\nbackslash beta')

    if (mode !== 'sv') {
      const identity = await page.evaluate(() => ({
        soft: document.querySelectorAll('[data-vmde-soft-break="1"]').length,
        hard: document.querySelectorAll('[data-vmde-hard-break]').length,
      }))
      expect(identity.soft).toBeGreaterThanOrEqual(2)
      expect(identity.hard).toBe(2)
    } else {
      expect(
        await page.evaluate(() => {
          const tail = (window as any).__svUntouchedTail as Node
          return tail.isConnected && tail === (window as any).__svUntouchedTail
        }),
      ).toBe(true)
    }

    await page.evaluate(() => {
      const inner = (window as any).__rewrap.editor.vditor
      inner.undo.undo(inner)
    })
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).__rewrap.editor.getValue()),
      )
      .toBe(typedCanonical)

    const initial = await page.evaluate(() => (window as any).__rewrap.initial)
    await page.evaluate(() => {
      const inner = (window as any).__rewrap.editor.vditor
      inner.undo.undo(inner)
    })
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).__rewrap.editor.getValue()),
      )
      .toBe(initial)
  })
}

test('auto-wrap changes only the active paragraph between marker-only quote lines', async ({
  page,
}) => {
  await openRewrapHarness(page, 'ir', true, false, 60)
  const markdown = [
    '> **Selected option:** A',
    '>',
    '> **Required `MonoView` members:**',
    '>',
    '> **Required `UIToolkitView` members:**',
    '>',
    '> **Lifecycle constraints:** **Notes:** Add to plan file instead of proposal',
    '',
  ].join('\n')
  const expected = [
    '> **Selected option:** A',
    '>',
    '> **Required `MonoView` members:**',
    '>',
    '> **Required `UIToolkitView` members:**',
    '>',
    '> **Lifecycle constraints:** **Notes:** Add to plan file',
    // Vditor serializes the new line as a valid lazy blockquote continuation.
    'instead of proposalx',
    '',
  ].join('\n')
  await page.evaluate((value) => {
    ;(window as any).__rewrap.editor.setValue(value)
  }, markdown)
  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.editor.getValue()))
    .toBe(markdown)
  await placeRewrapCaret(page, 'proposal', 'proposal'.length)

  await page.keyboard.type('x')

  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.state().syncs))
    .toBe(1)
  await expect
    .poll(() => page.evaluate(() => (window as any).__rewrap.editor.getValue()))
    .toBe(expected)
})
