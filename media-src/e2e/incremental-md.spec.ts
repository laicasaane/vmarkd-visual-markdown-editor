import { expect, test } from './coverage-fixture'

/**
 * E2e for the task-69 incremental IR serializer. Drives a REAL Vditor (IR) with real
 * keystrokes — so the DOM is produced by Vditor's own SpinVditorIRDOM, the path the
 * Node spike could not exercise — and after each edit asserts the incremental markdown
 * is byte-identical to the authoritative full `editor.getValue()` (VditorIRDOM2Md).
 */

async function gotoHarness(page: any, query = '') {
  await page.addInitScript(() => {
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: () => {
        /* this spec doesn't inspect posted messages */
      },
      getState: () => undefined,
      setState: () => {
        /* vscode API stub: state persistence unused in this spec */
      },
    })
  })
  await page.goto(`/incremental-md.html${query}`)
  await page.waitForFunction(() => (window as any).__ready === true)
}

// Click into the IR editor near a piece of text so the caret lands in a real block.
async function clickInEditor(page: any, contains: string) {
  const handle = await page.evaluateHandle((text: string) => {
    const el = (window as any).vditor.vditor.ir.element as HTMLElement
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n: Node | null
    // biome-ignore lint/suspicious/noAssignInExpressions: tree-walk loop
    while ((n = walker.nextNode())) {
      if (n.textContent?.includes(text)) return n.parentElement
    }
    return el
  }, contains)
  const box = await handle.asElement()!.boundingBox()
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2)
}

async function expectConsistent(page: any) {
  const r = await page.evaluate(() => (window as any).__incrementalVsFull())
  expect(
    r.incr,
    `incremental != full blocks=${r.blockCount}\n--- incr ---\n${r.incr}\n--- full ---\n${r.full}`,
  ).toBe(r.full)
}

test('incremental markdown stays byte-identical to getValue across real edits', async ({
  page,
}) => {
  await gotoHarness(page)

  // baseline: cache must match the initial document
  await expectConsistent(page)

  // 1) in-block text edit (type into the intro paragraph)
  await clickInEditor(page, 'Intro paragraph')
  await page.keyboard.type(' EDITED')
  await expectConsistent(page)

  // 2) edit a list item
  await clickInEditor(page, 'two')
  await page.keyboard.type(' X')
  await expectConsistent(page)

  // 3) edit a table cell
  await clickInEditor(page, '2')
  await page.keyboard.type('9')
  await expectConsistent(page)

  // 4) structural: Enter to split the closing paragraph into two blocks
  await clickInEditor(page, 'Closing paragraph')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('A brand new paragraph.')
  await expectConsistent(page)

  // 5) structural: a fresh paragraph at the very end, then Backspace-merge it back
  await page.keyboard.press('Enter')
  await page.keyboard.type('temp line')
  await expectConsistent(page)
  for (const _ of 'temp line') await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace') // merge into the previous block
  await expectConsistent(page)
})

test('the gate keeps a NORMAL doc on the full-serialize path', async ({
  page,
}) => {
  await gotoHarness(page) // small doc (well under the block gate)
  const r = await page.evaluate(() => (window as any).__serializeForHost())
  expect(r.usedIncremental).toBe(false)
  expect(r.equal).toBe(true) // full getValue() — trivially consistent
})

test('the gate routes a LARGE doc through incremental, byte-identical to getValue', async ({
  page,
}) => {
  await gotoHarness(page, '?large=1') // ≥700 blocks → over the gate
  let r = await page.evaluate(() => (window as any).__serializeForHost())
  expect(r.usedIncremental).toBe(true)
  expect(r.equal).toBe(true)
  // and it stays byte-identical to the authoritative serialize after a real edit
  await clickInEditor(page, 'Paragraph number 0')
  await page.keyboard.type(' EDITED')
  r = await page.evaluate(() => (window as any).__serializeForHost())
  expect(r.usedIncremental).toBe(true)
  expect(
    r.md,
    `incremental != full on a large doc\n--- md ---\n${r.md.slice(0, 300)}\n--- full ---\n${r.full.slice(0, 300)}`,
  ).toBe(r.full)
})

test('rebaselines correctly after the cache is invalidated', async ({
  page,
}) => {
  await gotoHarness(page)
  await clickInEditor(page, 'Intro paragraph')
  await page.keyboard.type(' one')
  await expectConsistent(page)
  // Simulate a wholesale DOM rebuild (setValue/streaming) → invalidate, then edit again.
  await page.evaluate(() => (window as any).__invalidate())
  await page.keyboard.type(' two')
  await expectConsistent(page)
})

test('a nested sub-700 document seeds in bounded batches and unchanged snapshots stay zero-serialize', async ({
  page,
}) => {
  await gotoHarness(page, '?complex=1')
  await page.waitForFunction(
    () => (window as any).__vmdeIncrementalSeedStats?.state === 'ready',
    undefined,
    { timeout: 2_000 },
  )
  const result = await page.evaluate(() => {
    const stats = (window as any).__vmdeIncrementalSeedStats
    const editor = (window as any).vditorTest
    const sync = (window as any).__task537EditSync
    const partial = (window as any).__task537PartialSnapshot
    const full = editor.getValue()
    const beforeCalls = stats.serializeCalls
    const durations: number[] = []
    let snapshot = ''
    for (let index = 0; index < 5; index++) {
      const started = performance.now()
      snapshot = sync.snapshotMarkdown()
      durations.push(performance.now() - started)
    }
    return {
      stats,
      blocks: editor.vditor.ir.element.children.length,
      partialExact: partial === full,
      snapshotExact: snapshot === full,
      unchangedSerializeCalls: stats.serializeCalls - beforeCalls,
      maxSnapshotMs: Math.max(...durations),
    }
  })

  expect(result.blocks).toBeLessThan(700)
  expect(result.stats.admissionReason).toBe('nested-structure')
  expect(result.stats.maxBatchMs).toBeLessThan(50)
  expect(result.partialExact).toBe(true)
  expect(result.snapshotExact).toBe(true)
  expect(result.unchangedSerializeCalls).toBe(0)
  expect(result.maxSnapshotMs).toBeLessThanOrEqual(10)

  const externallyUpdated = `${await page.evaluate(() => (window as any).vditorTest.getValue())}\nExternal update paragraph.\n`
  await page.evaluate(
    (next) => (window as any).__task537ExternalUpdate(next),
    externallyUpdated,
  )
  await page.waitForFunction(
    () => (window as any).__vmdeIncrementalSeedStats?.state === 'ready',
    undefined,
    { timeout: 2_000 },
  )
  const reseeded = await page.evaluate(() => {
    const stats = (window as any).__vmdeIncrementalSeedStats
    const editor = (window as any).vditorTest
    const sync = (window as any).__task537EditSync
    const beforeCalls = stats.serializeCalls
    const snapshot = sync.snapshotMarkdown()
    return {
      exact: snapshot === editor.getValue(),
      serializeCalls: stats.serializeCalls - beforeCalls,
    }
  })
  expect(reseeded).toEqual({ exact: true, serializeCalls: 0 })
})

test('a cancelled partial seed never exposes partial Markdown', async ({
  page,
}) => {
  await gotoHarness(page, '?complex=1&cancel=1')
  await page.waitForFunction(
    () => (window as any).__vmdeIncrementalSeedStats?.state === 'cancelled',
    undefined,
    { timeout: 2_000 },
  )
  const result = await page.evaluate(() => {
    const editor = (window as any).vditorTest
    const sync = (window as any).__task537EditSync
    return {
      exact: sync.snapshotMarkdown() === editor.getValue(),
      state: (window as any).__vmdeIncrementalSeedStats.state,
    }
  })
  expect(result).toEqual({ exact: true, state: 'cancelled' })
})
