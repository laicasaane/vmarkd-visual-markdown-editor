import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Arrow navigation between a thematic break and an adjacent ATOMIC block (hr-nav.ts's gap slot).
// Fixture: front-matter | hr | p("para") | hr | code-block | hr | p("tail"). A rule next to an
// atomic block used to leave NO reachable caret position between the two — arrowing across the rule
// jumped straight into (or out of) the code block / front matter, and there is no Enter-at-the-edge
// escape from inside one. Now the crossing stops in a transient gap paragraph.

async function open(page: Page) {
  await page.goto('/gap-cursor.html', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForTimeout(250)
}

const where = (page: Page) => page.evaluate(() => (window as any).__where())
const shape = (page: Page) => page.evaluate(() => (window as any).__shape())
const md = (page: Page) =>
  page.evaluate(() => (window as any).vditor.getValue())
const place = (page: Page, needle: string, atEnd: boolean) =>
  page.evaluate(([n, e]) => (window as any).__place(n, e), [needle, atEnd] as [
    string,
    boolean,
  ])
const press = async (page: Page, key: string) => {
  await page.keyboard.press(key)
  await page.waitForTimeout(150)
}

test('ArrowDown from a paragraph stops between the rule and the code block, then enters it', async ({
  page,
}) => {
  await open(page)
  const before = await md(page)
  await place(page, 'para', true)
  await press(page, 'ArrowDown')
  // the stop: a gap paragraph spliced AFTER the rule (index 4), before the code block
  expect(await where(page)).toBe('4:p')
  expect(await shape(page)).toContain('hr | p("") | code-block')
  await press(page, 'ArrowDown')
  // moving on enters the code block and the untouched gap is reclaimed — markdown unchanged
  expect(await where(page)).toBe('4:code-block')
  expect(await md(page)).toBe(before)
})

test('typing in the gap keeps it: the text lands between the rule and the code block', async ({
  page,
}) => {
  await open(page)
  await place(page, 'para', true)
  await press(page, 'ArrowDown')
  await page.keyboard.type('between')
  await page.waitForTimeout(300)
  // caret leaves the (now non-empty) paragraph — it must survive the cleanup
  await place(page, 'tail', true)
  await page.waitForTimeout(300)
  expect(await md(page)).toContain('---\n\nbetween\n\n```js')
})

test('ArrowUp out of the code block stops between it and the rule above', async ({
  page,
}) => {
  await open(page)
  const before = await md(page)
  await place(page, 'const a = 1', false)
  await press(page, 'ArrowUp')
  // the stop: a gap paragraph spliced BEFORE the code block (index 4)
  expect(await where(page)).toBe('4:p')
  expect(await shape(page)).toContain('hr | p("") | code-block')
  await press(page, 'ArrowUp')
  expect(await where(page)).toBe('2:p') // "para", above the rule
  expect(await md(page)).toBe(before)
})

test('ArrowDown out of the front matter stops between it and the rule below', async ({
  page,
}) => {
  await open(page)
  await place(page, 'title: x', true)
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('1:p')
  expect(await shape(page)).toContain('yaml-front-matter | p("") | hr')
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('2:p') // "para", past the rule
})

test('ArrowDown out of the code block stops before the rule below it', async ({
  page,
}) => {
  await open(page)
  await place(page, 'const a = 1', true)
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('5:p')
  expect(await shape(page)).toContain('code-block | p("") | hr')
})

// hr-nav is wired against activeModeElement (main.ts), not the IR element — WYSIWYG lays the same
// fixture out with the same `data-type` atomic blocks, so the stop has to appear there too.
test('WYSIWYG: ArrowDown from a paragraph stops between the rule and the code block', async ({
  page,
}) => {
  await page.goto('/gap-cursor.html?mode=wysiwyg', {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.waitForTimeout(250)
  await place(page, 'para', true)
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('4:p')
  expect(await shape(page)).toContain('hr | p("") | code-block')
})

// ---------------------------------------------------------------------------------------
// Task 292 phase 2: the same handler now owns EVERY void boundary, not just the ones next to a
// rule. These drive documents the fixture doesn't contain, via setValue.
const load = async (page: Page, md: string) => {
  await page.goto('/gap-cursor.html', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => (window as any).__ready === true)
  await page.evaluate((v) => (window as any).vditor.setValue(v), md)
  await page.waitForTimeout(400)
}
const FENCE = '```'

test('a document STARTING with a code block: ArrowUp opens a line above it', async ({
  page,
}) => {
  await load(page, `${FENCE}js\nconst a = 1\n${FENCE}\n\ntail\n`)
  // caret at the very start of the fence's editable source
  await place(page, 'const a = 1', false)
  await press(page, 'ArrowUp')
  expect(await where(page)).toBe('0:p') // a gap ABOVE the first block — there was nothing here
  await page.keyboard.type('title')
  await page.waitForTimeout(300)
  expect(await md(page)).toContain('title\n\n```js')
})

test('two adjacent rules: the caret stops between them (nothing else can)', async ({
  page,
}) => {
  await load(page, `para\n\n---\n\n---\n\ntail\n`)
  await place(page, 'para', true)
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('2:p') // between the two rules
  expect(await shape(page)).toContain('hr | p("") | hr')
})

test('blockquote above a code block: the boundary behaves as before the takeover', async ({
  page,
}) => {
  const before = `> quote\n\n${FENCE}js\nconst a = 1\n${FENCE}\n\ntail\n`
  await load(page, before)
  await place(page, 'quote', true)
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('1:p') // typeable slot between the quote and the fence
  await press(page, 'ArrowDown')
  expect(await where(page)).toBe('1:code-block') // moving on reclaims it
  expect(await md(page)).toBe(before)
})

// ---------------------------------------------------------------------------------------
// Task 292 phase 3: the mouse. The strips are thin (measured: 24px above the first block, ~14px
// between two fences), so the tests aim at the middle of the strip via the real rects.
const clickStrip = async (page: Page, which: 'above-first' | 'between-0-1') => {
  const pt = await page.evaluate((w) => {
    const el = (window as any).__el() as HTMLElement
    const r = (i: number) => el.children[i].getBoundingClientRect()
    const y =
      w === 'above-first'
        ? (el.getBoundingClientRect().top + r(0).top) / 2
        : (r(0).bottom + r(1).top) / 2
    return { x: r(0).left + 40, y }
  }, which)
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(250)
}

test('click above a document that STARTS with a code block opens a line there', async ({
  page,
}) => {
  await load(page, `${FENCE}js\nconst a = 1\n${FENCE}\n\ntail\n`)
  await clickStrip(page, 'above-first')
  expect(await where(page)).toBe('0:p')
  await page.keyboard.type('title')
  await page.waitForTimeout(300)
  expect(await md(page)).toContain('title\n\n```js')
})

test('click in the strip between two code blocks lands between them', async ({
  page,
}) => {
  await load(
    page,
    `${FENCE}js\nconst a = 1\n${FENCE}\n\n${FENCE}js\nconst b = 2\n${FENCE}\n`,
  )
  await clickStrip(page, 'between-0-1')
  expect(await where(page)).toBe('1:p')
  expect(await shape(page)).toContain('code-block | p("") | code-block')
})

test('click in the wide side margin next to a paragraph is left to the browser', async ({
  page,
}) => {
  const before = `para one\n\npara two\n`
  await load(page, before)
  const pt = await page.evaluate(() => {
    const r = (
      (window as any).__el() as HTMLElement
    ).children[0].getBoundingClientRect()
    return { x: r.left - 60, y: r.top + r.height / 2 } // margin beside the first paragraph
  })
  await page.mouse.click(pt.x, pt.y)
  await page.waitForTimeout(250)
  expect(await where(page)).toBe('0:p') // the paragraph itself, no gap manufactured
  expect(await shape(page)).toBe('p("para one") | p("para two")')
  expect(await md(page)).toBe(before)
})
