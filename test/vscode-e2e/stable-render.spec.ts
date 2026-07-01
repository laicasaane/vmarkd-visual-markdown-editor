import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 183 Phase 1 acceptance — capture/re-home "stable render". Typing a char into a diagram source
// takes the task-175 fence-skip path: no spin while typing, then ONE real spin+render on the settle
// (the synthetic fence-respin input) which rebuilds the block via `outerHTML` and DESTROYS the rendered
// <svg>. With stableRenderNode ON, the esbuild capture/re-home hooks re-inject the last render as a
// data-render="1" overlay in the SAME synchronous task (before paint), so the preview is NEVER observed
// empty — structurally, on the INSERT/settle path that the pre-183 isTyping-gated overlay dropped.
// This asserts ZERO empty frames for BOTH families (d2 = custom async, mermaid = Vditor-native) across
// the whole settle+render window, that the overlay carries data-render="1" (Lute-invisible → serialize
// stays byte-identical), and that a fresh render eventually lands.
const FIXTURE = path.join(__dirname, 'fixtures', 'render-cost-spike.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function openEditor(
  workbox: import('@playwright/test').Page,
  evaluateInVSCode: (
    fn: (vscode: typeof import('vscode'), args: string[]) => Promise<void>,
    args: [string],
  ) => Promise<void>,
) {
  await evaluateInVSCode(
    async (vscode, args) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [FIXTURE],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  // stableRenderNode ships OFF by default (task 183 Phase 1 is experimental) — force it ON so this spec
  // exercises the capture/re-home ON path it's named for (the single-keystroke case, which is correct;
  // the multi-keystroke overlay-size regression is tracked separately in the task).
  await frame.locator('body').evaluate(() => {
    ;(window as unknown as Record<string, unknown>).__vmarkdStableRenderNode =
      true
  })
  return frame
}

// Place the caret at the end of the given lang's editable source, then sample that block's preview
// every animation frame across the settle+render window while a char is typed. A "bad" frame = the
// preview shows neither a live/overlay svg|canvas NOR a terminal error box (i.e. it collapsed to raw
// source / empty — the disappear the fix must prevent).
async function measureNoEmpty(
  workbox: import('@playwright/test').Page,
  frame: ReturnType<typeof wf>,
  lang: string,
) {
  await frame
    .locator(`.language-${lang} svg, .language-${lang} canvas`)
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))

  // caret at end of this lang's source
  await frame.locator('body').evaluate((_b, l) => {
    const node = Array.from(
      document.querySelectorAll('.vditor-ir__node[data-type="code-block"]'),
    ).find((n) => n.querySelector(`code.language-${l}`)) as
      | HTMLElement
      | undefined
    const code = node?.querySelector('.vditor-ir__marker--pre code') as
      | HTMLElement
      | undefined
    if (!code) return
    const w = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
    let last: Text | null = null
    let n = w.nextNode() as Text | null
    while (n) {
      last = n
      n = w.nextNode() as Text | null
    }
    const tn: Node = last ?? code
    const r = document.createRange()
    r.setStart(tn, tn.nodeType === 3 ? (tn.textContent ?? '').length : 0)
    r.collapse(true)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    node?.focus()
  }, lang)

  const poll = frame.locator('body').evaluate(async (_b, l) => {
    const previewOf = () => {
      const node = Array.from(
        document.querySelectorAll('.vditor-ir__node[data-type="code-block"]'),
      ).find((n) => n.querySelector(`code.language-${l}`))
      return node?.querySelector('.vditor-ir__preview') as HTMLElement | null
    }
    let emptyFrames = 0
    let samples = 0
    let sawOverlay = false
    let overlayDataRender: string | null = null
    let sawFreshAfter = false
    let waited = 0
    while (waited < 2500) {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      waited += 16
      const p = previewOf()
      if (!p) continue
      samples++
      const overlay = p.querySelector('.vmarkd-stale-overlay')
      if (overlay) {
        sawOverlay = true
        overlayDataRender = overlay.getAttribute('data-render')
      }
      const hasVisual =
        !!p.querySelector('svg, canvas') ||
        !!p.querySelector('.vmarkd-diagram-error, .vmarkd-mermaid-error')
      if (!hasVisual) emptyFrames++
      // a fresh render = a live svg/canvas NOT inside our overlay
      const fresh = Array.from(p.querySelectorAll('svg, canvas')).some(
        (el) => !el.closest('.vmarkd-stale-overlay'),
      )
      if (fresh) sawFreshAfter = true
    }
    return {
      emptyFrames,
      samples,
      sawOverlay,
      overlayDataRender,
      sawFreshAfter,
    }
  }, lang)

  await new Promise((r) => setTimeout(r, 30))
  await workbox.keyboard.type(' ', { delay: 0 }) // INSERT → fence-skip → settle re-spin
  return (await poll) as {
    emptyFrames: number
    samples: number
    sawOverlay: boolean
    overlayDataRender: string | null
    sawFreshAfter: boolean
  }
}

test('d2 preview is never empty across an INSERT settle (capture/re-home)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const frame = await openEditor(workbox, evaluateInVSCode)
  const r = await measureNoEmpty(workbox, frame, 'd2')
  // eslint-disable-next-line no-console
  console.log(`[stable-render:d2] ${JSON.stringify(r)}`)
  expect(r.samples).toBeGreaterThan(0)
  expect(r.emptyFrames).toBe(0) // the diagram never disappeared
  expect(r.sawFreshAfter).toBe(true) // a real render still landed
  if (r.sawOverlay) expect(r.overlayDataRender).toBe('1') // Lute-invisible → serialize byte-identical
})

test('mermaid preview is never empty across an INSERT settle (capture/re-home)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const frame = await openEditor(workbox, evaluateInVSCode)
  const r = await measureNoEmpty(workbox, frame, 'mermaid')
  // eslint-disable-next-line no-console
  console.log(`[stable-render:mermaid] ${JSON.stringify(r)}`)
  expect(r.samples).toBeGreaterThan(0)
  expect(r.emptyFrames).toBe(0)
  expect(r.sawFreshAfter).toBe(true)
  if (r.sawOverlay) expect(r.overlayDataRender).toBe('1')
})
