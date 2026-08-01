import { wf } from './webview-helpers'
// PlantUML multi-diagram note (task 140). The TeaVM engine's render() draws only the FIRST diagram
// when one ` ```plantuml ` fence holds several `@startuml…@enduml` pairs (verified in Step 0), so the
// rest would vanish silently. We keep rendering the first, but APPEND a note ("Only the first of N…")
// so nothing is dropped without a signal. `newpage` (multi-page within ONE @startuml) is rendered in
// full by the engine → NO note. Real-VS-Code only: the render path + resource pipeline don't reproduce
// in the harness. countPlantumlDiagrams + the note DOM are unit-tested; this proves the wiring end-to-end.
// Each case is its OWN single-block fixture so the multi-diagram engine type-stickiness (task 347)
// can't confound the run.
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

const MULTI = path.join(__dirname, 'fixtures', 'plantuml-multidiagram.md')
const NEWPAGE = path.join(__dirname, 'fixtures', 'plantuml-newpage.md')

async function open(
  evaluateInVSCode: (fn: unknown, args: unknown) => Promise<unknown>,
  uri: string,
) {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      const [u] = args
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(u),
        'vmarkd.editor',
      )
    },
    [uri],
  )
}

test('several @startuml in one fence: first renders + a note flags the dropped ones', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  await open(evaluateInVSCode, MULTI)
  const frame = wf(workbox)
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))

  const info = await frame.locator('body').evaluate(() => {
    const block = document.querySelector(
      '.vditor-ir__preview .language-plantuml',
    )
    const svg = block?.querySelector('svg')
    const svgText = svg
      ? Array.from(svg.querySelectorAll('text'))
          .map((t) => t.textContent ?? '')
          .join(' ')
      : ''
    const note = block?.querySelector('.vmarkd-diagram-note')
    return {
      hasSvg: !!svg,
      showsFirst: /FirstDiagram|Bob/.test(svgText),
      showsSecond: /SecondDiagram|Dave/.test(svgText),
      noteText: note?.textContent ?? '',
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[multidiagram] ${JSON.stringify(info)}`)

  expect(info.hasSvg).toBe(true)
  expect(info.showsFirst).toBe(true) // first diagram still renders
  expect(info.showsSecond).toBe(false) // engine dropped the second (the whole point)
  expect(info.noteText).toContain('Only the first of 2 PlantUML diagrams') // …and we flag it
  expect(info.noteText).toContain('its own code block')
})

test('newpage renders all pages with NO note (it is one diagram, not several)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(120_000)
  await open(evaluateInVSCode, NEWPAGE)
  const frame = wf(workbox)
  await frame
    .locator('.vditor-ir__preview .language-plantuml svg')
    .first()
    .waitFor({ timeout: 60_000 })
  await frame
    .locator('body')
    .evaluate(() => new Promise((r) => setTimeout(r, 1500)))

  const info = await frame.locator('body').evaluate(() => {
    const block = document.querySelector(
      '.vditor-ir__preview .language-plantuml',
    )
    const svgText = Array.from(block?.querySelectorAll('svg text') ?? [])
      .map((t) => t.textContent ?? '')
      .join(' ')
    return {
      showsPageOne: /PageOne|Frank/.test(svgText),
      showsPageTwo: /PageTwo|Heidi/.test(svgText),
      noteCount: block?.querySelectorAll('.vmarkd-diagram-note').length ?? -1,
    }
  })
  // eslint-disable-next-line no-console
  console.log(`[newpage] ${JSON.stringify(info)}`)

  expect(info.showsPageOne).toBe(true) // both pages render (engine handles newpage natively)
  expect(info.showsPageTwo).toBe(true)
  expect(info.noteCount).toBe(0) // …so NO "only the first" note
})
