import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 184 Phase 3 acceptance (real VS Code, headless) — the Vditor-NATIVE SVG engines served from
// the persistent host cache with ZERO fresh render on reopen: mermaid, graphviz, abc, flowchart.
// Unlike the d2 path (a custom observer), these are rendered by Vditor's OWN deferred
// `addScript().then()` pass; we reserve each preview target (`data-processed="true"`) synchronously
// on open — before that deferred pass fires — so a cache HIT paints the stored SVG and the engine
// never runs it. A MISS (cold cache) renders the source offscreen (renderNativeJobs) and caches it.
//
// Zero-render proof: `data-vmarkd-cache-hit` is set ONLY by our cache paint, and only on a block we
// reserved (data-processed set before the engine's deferred pass) → its presence on reopen means the
// engine was blocked. For mermaid we ALSO assert a byte-identical svg (mermaid stamps every render a
// fresh `"mermaid"+genUUID()` id — vditor mermaidRender.ts:47 — so identical markup can only be the
// reused cached svg). Plus a byte-identical whole-doc `getValue()` (injected svgs carry data-render="1").
const FIXTURE = path.join(__dirname, 'fixtures', 'diagram-cache.md')
const NATIVE_LANGS = ['mermaid', 'abc', 'flowchart']

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function open(
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
  return frame
}

async function closeActive(
  evaluateInVSCode: (
    fn: (vscode: typeof import('vscode')) => Promise<void>,
  ) => Promise<void>,
) {
  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand(
      'workbench.action.revertAndCloseActiveEditor',
    )
  })
}

// Wait until every native engine's preview target holds a rendered <svg>, then settle.
async function waitNative(frame: ReturnType<typeof wf>) {
  for (const lang of NATIVE_LANGS) {
    await frame
      .locator(`.vditor-ir__preview .language-${lang} svg`)
      .first()
      .waitFor({ timeout: 60_000 })
  }
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))
}

// Per-lang snapshot of the native preview target + the whole-doc getValue.
async function snapshot(frame: ReturnType<typeof wf>) {
  return frame.locator('body').evaluate((_b, langs) => {
    const byLang: Record<
      string,
      { cacheHit: boolean; svgId: string; svgHTML: string; width: number }
    > = {}
    for (const lang of langs) {
      const target = document.querySelector(
        `.vditor-ir__preview .language-${lang}`,
      )
      const svg = target?.querySelector('svg')
      byLang[lang] = {
        cacheHit: target?.getAttribute('data-vmarkd-cache-hit') === '1',
        svgId: svg?.id ?? '',
        svgHTML: svg?.outerHTML ?? '',
        width: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
      }
    }
    const vditor = (window as unknown as { vditor?: { getValue(): string } })
      .vditor
    return { byLang, value: vditor ? vditor.getValue() : '' }
  }, NATIVE_LANGS)
}

test('reopen serves every native engine (mermaid/graphviz/abc/flowchart) from cache with zero fresh render', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const frame1 = await open(workbox, evaluateInVSCode)
  await waitNative(frame1)
  const before = await snapshot(frame1)
  for (const lang of NATIVE_LANGS) {
    expect(
      before.byLang[lang].svgHTML.length,
      `${lang} rendered`,
    ).toBeGreaterThan(0)
    expect(before.byLang[lang].width, `${lang} width`).toBeGreaterThan(0)
  }

  await closeActive(evaluateInVSCode)
  await new Promise((r) => setTimeout(r, 500))
  const frame2 = await open(workbox, evaluateInVSCode)
  await waitNative(frame2)
  const after = await snapshot(frame2)

  for (const lang of NATIVE_LANGS) {
    const b = before.byLang[lang]
    const a = after.byLang[lang]
    // eslint-disable-next-line no-console
    console.log(
      `[native-cache:${lang}] hit=${a.cacheHit} w=${b.width}/${a.width} id=${a.svgId === b.svgId}`,
    )
    // Served from the host cache (marker set only by our cache paint on a reserved/blocked block).
    expect(a.cacheHit, `${lang} cache-hit on reopen`).toBe(true)
    // Correct size — no task-183 grow/shrink (painted into the live constrained preview node).
    expect(
      Math.abs(a.width - b.width),
      `${lang} size stable`,
    ).toBeLessThanOrEqual(2)
  }
  // mermaid: byte-identical svg (fresh genUUID ids per render) ⟹ the CACHED svg was reused.
  expect(after.byLang.mermaid.svgId).toBe(before.byLang.mermaid.svgId)
  expect(after.byLang.mermaid.svgHTML).toBe(before.byLang.mermaid.svgHTML)
  // getValue() byte-identical with the cached svgs injected (data-render="1" → Lute-invisible).
  expect(after.value).toBe(before.value)
})
