import { test, expect } from './coverage-fixture'

// e2e for getCursorSourceOffset (task 15): uses Lute's own caret token (‸,
// Lute.Caret) inserted at the selection, round-tripped through the active mode's
// VditorIRDOM2Md, then indexOf — yielding an EXACT source offset, including
// inside markdown syntax markers (where a plain sentinel fails). Falls back to
// the table-cell mapping and the block heuristic when the caret token can't be
// placed. The harness exposes the module on window for testing.
test('getCursorSourceOffset maps a prose caret to the exact source offset', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__ready === true)
  const got = await page.evaluate(async () => {
    const v = (window as any).vditor
    v.setValue('Hello bold world.\n')
    await new Promise((r) => setTimeout(r, 80))
    const ir = v.vditor.ir.element as HTMLElement
    // caret 5 chars into "Hello"
    const walker = document.createTreeWalker(ir, NodeFilter.SHOW_TEXT)
    const tn = walker.nextNode() as Text
    const range = document.createRange()
    range.setStart(tn, 5)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    const fn = (window as any).__sourceMap.getCursorSourceOffset
    return { offset: fn(v), leftoverCaret: ir.textContent?.includes('‸') }
  })
  expect(got.offset).toBe(5) // exact
  expect(got.leftoverCaret).toBe(false) // caret token cleaned up from the DOM
})

test('getCursorSourceOffset is exact even inside a syntax marker (heading)', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__ready === true)
  const offset = await page.evaluate(async () => {
    const v = (window as any).vditor
    v.setValue('# Title here\n\nBody.\n')
    await new Promise((r) => setTimeout(r, 80))
    const ir = v.vditor.ir.element as HTMLElement
    // place caret at the start of the heading text "Title" (after "# ")
    const walker = document.createTreeWalker(ir, NodeFilter.SHOW_TEXT)
    let node: Text | null = null
    let n: Node | null
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic TreeWalker iteration loop
    while ((n = walker.nextNode())) {
      if ((n.textContent || '').includes('Title')) {
        node = n as Text
        break
      }
    }
    const idx = node!.textContent!.indexOf('Title')
    const range = document.createRange()
    range.setStart(node!, idx)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    return (window as any).__sourceMap.getCursorSourceOffset(v)
  })
  // source "# Title here" → "Title" starts at offset 2 (after "# ")
  expect(offset).toBe(2)
})

test('getCursorSourceOffset maps a table cell exactly', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__ready === true)
  const got = await page.evaluate(async () => {
    const v = (window as any).vditor
    v.setValue('Intro.\n\n| H1 | H2 |\n| - | - |\n| a | b |\n')
    await new Promise((r) => setTimeout(r, 100))
    const ir = v.vditor.ir.element as HTMLElement
    const cell = ir.querySelectorAll('td')[1] as HTMLElement // body row, col 1 ("b")
    const _tn =
      (cell.firstChild as Text) ||
      document.createTextNode(cell.textContent || '')
    const range = document.createRange()
    range.selectNodeContents(cell)
    range.collapse(true)
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    const md = v.getValue()
    const sm = (window as any).__sourceMap
    const offset = sm.getCursorSourceOffset(v)
    return { offset, md, line: sm.offsetToLine(md, offset) }
  })
  // Table mapping is exact against the real (Vditor-normalized) source: the
  // offset must land on the body row's line, inside that row's span.
  const lines = got.md.split('\n')
  const bodyLine = lines.findIndex((l: string) =>
    /\|\s*a\s*\|\s*b\s*\|/.test(l),
  )
  expect(got.line).toBe(bodyLine) // correct line
  const rowStart = lines.slice(0, bodyLine).join('\n').length + 1
  expect(got.offset).toBeGreaterThanOrEqual(rowStart)
  expect(got.offset).toBeLessThan(rowStart + lines[bodyLine].length)
})

test('source line reveal scrolls, flashes, and places the caret in the owning live block', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).__ready === true)
  const source = [
    '# Start',
    '',
    ...Array.from({ length: 24 }, (_, index) => `paragraph ${index}`),
    '',
    '```mermaid',
    'graph TD',
    '  A --> B',
    '```',
    '',
    'tail paragraph',
  ].join('\n\n')
  await page.evaluate(async (markdown) => {
    const v = (window as any).vditor
    v.setValue(markdown)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }, source)
  const fenceLine = source.split('\n').indexOf('  A --> B')
  expect(fenceLine).toBeGreaterThan(0)
  expect(
    await page.evaluate(
      ([line, lineText]) => (window as any).__revealSourceLine(line, lineText),
      [fenceLine, '  A --> B'] as [number, string],
    ),
  ).toBe(true)

  const immediate = await page.evaluate(() => {
    const editor = (window as any).vditor.vditor.ir.element as HTMLElement
    const blocks = Array.from(editor.children).filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.getAttribute('data-block') === '0',
    )
    const flashed = editor.querySelector<HTMLElement>('.heading-flash')
    const code = editor.querySelector<HTMLElement>('[data-type="code-block"]')
    return {
      flashedIndex: flashed ? blocks.indexOf(flashed) : -1,
      flashedText: flashed?.textContent ?? '',
      codeIndex: code ? blocks.indexOf(code) : -1,
      blockCount: blocks.length,
    }
  })
  expect(immediate.flashedIndex, JSON.stringify(immediate)).toBe(
    immediate.codeIndex,
  )

  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as any).vditor.vditor.ir.element as HTMLElement
        const target = editor.querySelector<HTMLElement>(
          '[data-type="code-block"]',
        )
        const selection = getSelection()
        const anchor = selection?.rangeCount ? selection.anchorNode : null
        const editorRect = editor.getBoundingClientRect()
        const targetRect = target?.getBoundingClientRect()
        return {
          flashed: target?.classList.contains('heading-flash') ?? false,
          caretInTarget: !!anchor && !!target?.contains(anchor),
          inViewport: Boolean(
            targetRect &&
              targetRect.top >= editorRect.top - 2 &&
              targetRect.top < editorRect.bottom,
          ),
        }
      }),
    )
    .toEqual({ flashed: true, caretInTarget: true, inViewport: true })
})
