import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// REPRO (task 183 regression) — the user reports that WITH stableRenderNode ON, real editing makes
// diagrams DISAPPEAR then reappear, and mermaid GROWS/SHRINKS after an edit. My single-space e2e
// (stable-render.spec) missed this. Hypothesis to expose: multi-keystroke typing with realistic gaps
// (~180ms > RENDER_MS=140) fires the settle BETWEEN keystrokes → repeated spin/destroy/re-home/render/
// reveal churn → empty frames and/or size jumps. This test types a burst into the mermaid + d2 source
// and samples the preview EVERY frame through the whole burst+settle window, reporting empty frames and
// the range of svg sizes seen (grow/shrink). Diagnostic — logs numbers, doesn't hard-assert the bug.
const FIXTURE = path.join(__dirname, 'fixtures', 'render-cost-spike.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function reproTyping(
  workbox: import('@playwright/test').Page,
  evaluateInVSCode: (
    fn: (vscode: typeof import('vscode'), args: string[]) => Promise<void>,
    args: [string],
  ) => Promise<void>,
  lang: string,
  flagOff = false,
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
  await frame
    .locator(`.language-${lang} svg`)
    .first()
    .waitFor({ timeout: 60_000 })
  // BASELINE isolation: flagOff disables capture/re-home (falls back to the pre-183 task-161 overlay).
  if (flagOff) {
    await frame.locator('body').evaluate(() => {
      ;(window as unknown as Record<string, unknown>).__vmarkdStableRenderNode =
        false
    })
  }
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 2000)))

  // caret at end of the lang's source
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

  // start sampling the preview every frame for ~5s
  const poll = frame.locator('body').evaluate(async (_b, l) => {
    const previewOf = () => {
      const node = Array.from(
        document.querySelectorAll('.vditor-ir__node[data-type="code-block"]'),
      ).find((n) => n.querySelector(`code.language-${l}`))
      return node?.querySelector('.vditor-ir__preview') as HTMLElement | null
    }
    let emptyFrames = 0
    let samples = 0
    const overlaySizes = new Set<string>()
    const liveSizes = new Set<string>()
    let transitions = 0
    let prevKind = ''
    let waited = 0
    const box = (el: Element | null | undefined) => {
      if (!el) return ''
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
        ? `${Math.round(r.width)}x${Math.round(r.height)}`
        : ''
    }
    while (waited < 5000) {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      waited += 16
      const p = previewOf()
      if (!p) continue
      samples++
      const overlay = p.querySelector('.vmarkd-stale-overlay')
      const liveSvg = Array.from(p.querySelectorAll('svg')).find(
        (el) => !el.closest('.vmarkd-stale-overlay'),
      )
      const kind = liveSvg ? 'live' : overlay ? 'overlay' : 'EMPTY'
      if (kind !== prevKind) {
        transitions++
        prevKind = kind
      }
      if (kind === 'EMPTY') emptyFrames++
      const os = box(overlay?.querySelector('svg'))
      if (os) overlaySizes.add(os)
      const ls = box(liveSvg)
      if (ls) liveSizes.add(ls)
    }
    return {
      emptyFrames,
      samples,
      transitions,
      overlaySizes: [...overlaySizes],
      liveSizes: [...liveSizes],
    }
  }, lang)

  await new Promise((r) => setTimeout(r, 30))
  // realistic burst: 6 chars, ~180ms apart (a slower-than-QUIET_MS typing cadence)
  await workbox.keyboard.type('XYZabc', { delay: 180 })
  const r = (await poll) as {
    emptyFrames: number
    samples: number
    transitions: number
    overlaySizes: string[]
    liveSizes: string[]
  }
  return r
}

test('REPRO: mermaid multi-keystroke — flag ON (capture/re-home)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const r = await reproTyping(workbox, evaluateInVSCode, 'mermaid')
  // eslint-disable-next-line no-console
  console.log(`[repro:mermaid:ON] ${JSON.stringify(r)}`)
  expect(r.samples).toBeGreaterThan(0)
})

test('REPRO: mermaid multi-keystroke — flag OFF baseline (pre-183 overlay)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const r = await reproTyping(workbox, evaluateInVSCode, 'mermaid', true)
  // eslint-disable-next-line no-console
  console.log(`[repro:mermaid:OFF] ${JSON.stringify(r)}`)
  expect(r.samples).toBeGreaterThan(0)
})

test('REPRO: d2 multi-keystroke — empty frames + grow/shrink', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const r = await reproTyping(workbox, evaluateInVSCode, 'd2')
  // eslint-disable-next-line no-console
  console.log(`[repro:d2] ${JSON.stringify(r)}`)
  expect(r.samples).toBeGreaterThan(0)
})
