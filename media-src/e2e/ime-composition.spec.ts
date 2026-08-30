import { expect, test } from './coverage-fixture'

const COMMITTED_TEXT = '日本'

type ImeCase = {
  mode: 'ir' | 'wysiwyg'
  markdown: string
  needle: string
  target: 'prose' | 'code' | 'table'
  expected?: string
}

const cases: ImeCase[] = [
  {
    mode: 'ir',
    markdown: 'prose before\n',
    needle: 'prose before',
    target: 'prose',
  },
  {
    mode: 'wysiwyg',
    markdown: '```js\nconst ime = IMEPOINT\n```\n',
    needle: 'IMEPOINT',
    target: 'code',
  },
  {
    mode: 'ir',
    markdown: '| Header |\n| --- |\n| table cell |\n',
    needle: 'table cell',
    target: 'table',
    expected: '| Header         |\n| -------------- |\n| table cell日本 |\n',
  },
]

test('real Chromium IME composition stays byte-exact and caret-stable across editor surfaces', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page)

  for (const entry of cases) {
    await page.goto(`/ime.html?mode=${entry.mode}`)
    await page.waitForFunction(() => (window as any).__ready === true)
    const before = await page.evaluate(({ markdown, needle, target }) => {
      return (window as any).__imePrepare(markdown, needle, target)
    }, entry)
    const prepared = await page.evaluate(() => (window as any).__imeState())
    expect(prepared).toMatchObject({
      collapsed: true,
      focused: true,
      target: entry.target,
    })
    expect(prepared.textBeforeCaret.endsWith(entry.needle)).toBe(true)

    await cdp.send('Input.imeSetComposition', {
      text: '日',
      selectionStart: 1,
      selectionEnd: 1,
    })
    await cdp.send('Input.imeSetComposition', {
      text: COMMITTED_TEXT,
      selectionStart: COMMITTED_TEXT.length,
      selectionEnd: COMMITTED_TEXT.length,
    })

    const composingUi = await page.evaluate(() => {
      const probe = document.querySelector<HTMLElement>('[data-vmde-overlay]')!
      return {
        active: document.documentElement.hasAttribute('data-vmde-composing'),
        overlayDisplay: getComputedStyle(probe).display,
      }
    })
    expect(composingUi).toEqual({ active: true, overlayDisplay: 'none' })

    await cdp.send('Input.insertText', { text: COMMITTED_TEXT })

    await expect
      .poll(() => page.evaluate(() => (window as any).vditor.getValue()))
      .toBe(
        entry.expected ??
          before.replace(entry.needle, `${entry.needle}${COMMITTED_TEXT}`),
      )
    const state = await page.evaluate(() => (window as any).__imeState())
    expect(state).toMatchObject({
      composing: false,
      collapsed: true,
      focused: true,
      target: entry.target,
    })
    expect(state.textBeforeCaret.endsWith(COMMITTED_TEXT)).toBe(true)
  }
})
