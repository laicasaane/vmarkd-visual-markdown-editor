import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { wf } from './webview-helpers'

const FIXTURE = path.join(__dirname, 'fixtures', 'prerender-style-parity.md')

const probes = {
  heading: ':scope > h1',
  paragraph: ':scope > p',
  list: ':scope > ul',
  quote: ':scope > blockquote',
  table: ':scope > table',
  code: ':scope > div[data-type="code-block"]',
} as const

type Snapshot = Record<keyof typeof probes, Record<string, string | number>>

function readSnapshot(
  frame: ReturnType<typeof wf>,
  rootSelector: string,
): Promise<Snapshot> {
  return frame.locator('body').evaluate(
    (_body, { rootSelector, probes }) => {
      const root = document.querySelector(rootSelector)
      if (!root) throw new Error(`missing parity root: ${rootSelector}`)
      return Object.fromEntries(
        Object.entries(probes).map(([name, selector]) => {
          const element = root.querySelector(selector) as HTMLElement | null
          if (!element) throw new Error(`missing parity probe: ${name}`)
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return [
            name,
            {
              backgroundColor: style.backgroundColor,
              color: style.color,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              lineHeight: style.lineHeight,
              marginBottom: style.marginBottom,
              marginTop: style.marginTop,
              paddingBottom: style.paddingBottom,
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
              paddingTop: style.paddingTop,
              height: Math.round(rect.height * 100) / 100,
              width: Math.round(rect.width * 100) / 100,
              x: Math.round(rect.x * 100) / 100,
              y: Math.round(rect.y * 100) / 100,
            },
          ]
        }),
      )
    },
    { rootSelector, probes },
  ) as Promise<Snapshot>
}

test('host prerender and settled IR keep static Markdown styles identical', async ({
  workbox,
  evaluateInVSCode,
}) => {
  await evaluateInVSCode(
    async (vscode, args) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [FIXTURE] as [string],
  )

  const frame = wf(workbox)
  const overlay = frame.locator('#vmarkd-prerender')
  await overlay.waitFor({ timeout: 45_000 })
  const before = await readSnapshot(frame, '#vmarkd-prerender .vditor-reset')

  await expect
    .poll(() =>
      frame.locator('body').evaluate(
        () =>
          typeof (
            window as typeof window & {
              __vmarkdReleasePrerender?: () => void
            }
          ).__vmarkdReleasePrerender,
      ),
    )
    .toBe('function')
  await frame.locator('body').evaluate(() => {
    const release = (
      window as typeof window & {
        __vmarkdReleasePrerender?: () => void
      }
    ).__vmarkdReleasePrerender
    if (!release) throw new Error('prerender parity hold is unavailable')
    release()
  })
  await overlay.waitFor({ state: 'detached', timeout: 45_000 })

  const after = await readSnapshot(frame, '.vditor-ir .vditor-reset')
  expect(after).toEqual(before)
})
