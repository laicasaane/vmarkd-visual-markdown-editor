import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'
import { largeMixedMarkdown } from './large-mixed-markdown'
import {
  docText,
  ExtensionId,
  MarkdownEditorViewType,
  waitForE2EReadiness,
  wf,
} from './webview-helpers'

type PerfSample = {
  id: string
  renderer?: Record<string, number | string>
  host: Record<string, number | string | boolean>
  followers?: Record<string, number | string | boolean>
  status: string
}

const hash = (text: string): string =>
  createHash('sha256').update(text).digest('hex')

function genericComplexMarkdown(): string {
  const lines: string[] = [
    '# Generic complex control',
    '',
    'Task 538 generic edit target sentence.',
    '',
  ]
  for (let section = 0; section < 75; section++) {
    lines.push(`## Section ${section}`, '')
    for (let paragraph = 0; paragraph < 5; paragraph++)
      lines.push(
        `Paragraph ${section}.${paragraph} has **bold**, *emphasis*, [link](./note.md), and \`code\`.`,
        '',
      )
    lines.push(
      `- list ${section} first`,
      `  - list ${section} nested one`,
      `  - list ${section} nested two`,
      `- list ${section} peer`,
      '',
    )
    if (section % 5 === 0)
      lines.push(
        `| Section ${section} | Value |`,
        '| --- | --- |',
        '| alpha | beta |',
        '',
      )
  }
  return `${lines.join('\n')}\n`
}

test('attributes edit propagation stages across the Task 538 corpus', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(300_000)
  const fixtureDir = path.resolve(process.cwd(), 'fixtures')
  const generatedComplex = path.join(baseDir, 'propagation-complex.md')
  const generatedLarge = path.join(baseDir, 'propagation-large.md')
  writeFileSync(generatedComplex, genericComplexMarkdown())
  writeFileSync(generatedLarge, largeMixedMarkdown())
  const scenarios = [
    {
      label: 'small-tracked',
      file: path.join(fixtureDir, 'perf-edit.md'),
      target: 'edit here',
    },
    {
      label: 'complex-generated',
      file: generatedComplex,
      target: 'Task 538 generic edit target sentence.',
    },
    { label: 'mixed-2000', file: generatedLarge, target: 'TARGET alpha beta' },
    {
      label: 'structured-tracked',
      file: path.join(fixtureDir, 'large-structured-synthetic.md'),
      target: undefined,
    },
  ]

  const perfApi = async (action: 'clear' | 'snapshot') =>
    evaluateInVSCode(
      async (vscode, args: [string, string]) => {
        const extension = vscode.extensions.getExtension(args[0])
        await extension?.activate()
        const api = (extension?.exports as any)?.editPerf
        if (!api) throw new Error('Task 538 editPerf E2E API unavailable')
        return args[1] === 'clear' ? api.clear() : api.snapshot()
      },
      [ExtensionId, action] as [string, string],
    ) as Promise<PerfSample[] | undefined>

  const results: Array<Record<string, number | string | boolean>> = []
  for (const scenario of scenarios) {
    const original = readFileSync(scenario.file, 'utf8')
    const originalHash = hash(original)
    const targetNeedle =
      scenario.target ??
      original
        .split(/\r?\n/)
        .find(
          (line) =>
            line.length >= 90 &&
            /^[A-Za-z]/.test(line) &&
            !/[`*[\]|#]/.test(line),
        )
        ?.slice(0, 60)
    expect(targetNeedle).toBeTruthy()
    await evaluateInVSCode(async (vscode) => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    })
    await evaluateInVSCode(
      async (vscode, args: [string, string, string]) => {
        await vscode.extensions.getExtension(args[1])?.activate()
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(args[0]),
          args[2],
        )
      },
      [scenario.file, ExtensionId, MarkdownEditorViewType] as [
        string,
        string,
        string,
      ],
    )
    const frame = wf(workbox)
    await frame.locator('.vditor-ir').waitFor({ timeout: 120_000 })
    await waitForE2EReadiness(
      frame,
      (state) =>
        state.routerReady &&
        state.editorEpoch > 0 &&
        state.mode === 'ir' &&
        Object.values(state.pending).every((count) => count === 0),
      { timeout: 120_000, message: `Task 538 ${scenario.label} readiness` },
    )
    const seedState = await frame
      .locator('body')
      .evaluate(() => (window as any).__vmdeIncrementalSeedStats?.state)
    if (seedState === 'pending')
      await expect
        .poll(
          () =>
            frame
              .locator('body')
              .evaluate(
                () => (window as any).__vmdeIncrementalSeedStats?.state,
              ),
          { timeout: 120_000 },
        )
        .toBe('ready')

    // Vditor may emit one render-only input after mount. Let that callback finish so clearing the
    // host collector also starts from a renderer generation boundary.
    await frame
      .locator('body')
      .evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
    await perfApi('clear')
    const targetParagraph = frame
      .locator('.vditor-ir p')
      .filter({ hasText: targetNeedle! })
      .first()
    await expect(targetParagraph).toBeVisible()
    await targetParagraph.scrollIntoViewIfNeeded()
    await targetParagraph.click()
    await workbox.keyboard.press('End')

    const propagationStarted = performance.now()
    await workbox.keyboard.type('X')
    await expect
      .poll(
        async () =>
          (await perfApi('snapshot'))?.some(
            (candidate) =>
              candidate.status === 'complete' &&
              candidate.host.applied === true,
          ),
        { timeout: 120_000 },
      )
      .toBe(true)
    const propagationMs = performance.now() - propagationStarted
    await frame
      .locator('body')
      .evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
    const samples = (await perfApi('snapshot')) ?? []
    const sample = [...samples]
      .reverse()
      .find((candidate) => candidate.host.applied === true)
    const observed = {
      hostLength: (await docText(evaluateInVSCode, scenario.file)).length,
      webviewLength: await frame
        .locator('body')
        .evaluate(() => (window as any).vditor.getValue().length),
    }
    expect(observed, `${scenario.label} edit did not propagate`).toMatchObject({
      hostLength: original.length + 1,
    })
    console.log(`[task538-sample:${scenario.label}] ${JSON.stringify(sample)}`)
    expect(sample).toBeDefined()
    expect(sample?.renderer?.payloadBytes).toBeGreaterThan(0)
    expect(sample?.host.applied).toBe(true)
    expect(sample?.followers?.documentVersion).toBeGreaterThan(0)
    results.push({
      scenario: scenario.label,
      propagationMs,
      generations: samples.length,
      noWriteGenerations: samples.filter((candidate) => candidate.host.noWrite)
        .length,
      ...sample!.renderer,
      ...sample!.host,
      ...sample!.followers,
    })

    await evaluateInVSCode(
      async (vscode, args: [string, string]) => {
        const document = vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.fsPath === args[0],
        )
        if (!document) throw new Error('Task 538 document is not open')
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          ),
          args[1],
        )
        if (!(await vscode.workspace.applyEdit(edit)))
          throw new Error('Task 538 baseline restore failed')
      },
      [scenario.file, original] as [string, string],
    )
    await expect
      .poll(async () => hash(await docText(evaluateInVSCode, scenario.file)), {
        timeout: 120_000,
      })
      .toBe(originalHash)
    expect(hash(readFileSync(scenario.file, 'utf8'))).toBe(originalHash)
  }

  console.log(`[task538-baseline] ${JSON.stringify(results)}`)
})

test('prewarmed writeback preserves Backspace, save, external update, and gutters', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(300_000)
  const file = path.join(baseDir, 'task538-correctness.md')
  const original = readFileSync(
    path.resolve(process.cwd(), 'fixtures/large-structured-synthetic.md'),
    'utf8',
  )
  const originalHash = hash(original)
  writeFileSync(file, original)
  execFileSync('git', ['init', '--quiet'], { cwd: baseDir })
  execFileSync('git', ['config', 'user.name', 'VMDE E2E'], { cwd: baseDir })
  execFileSync('git', ['config', 'user.email', 'vmde-e2e@example.invalid'], {
    cwd: baseDir,
  })
  execFileSync('git', ['add', path.basename(file)], { cwd: baseDir })
  execFileSync(
    'git',
    ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'baseline'],
    { cwd: baseDir },
  )

  const open = async () => {
    await evaluateInVSCode(
      async (vscode, args: [string, string, string]) => {
        await vscode.extensions.getExtension('vscode.git')?.activate()
        await vscode.extensions.getExtension(args[1])?.activate()
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.file(args[0]),
          args[2],
        )
      },
      [file, ExtensionId, MarkdownEditorViewType] as [string, string, string],
    )
    const frame = wf(workbox)
    await frame.locator('.vditor-ir').waitFor({ timeout: 120_000 })
    await waitForE2EReadiness(
      frame,
      (state) =>
        state.routerReady &&
        state.editorEpoch > 0 &&
        state.mode === 'ir' &&
        Object.values(state.pending).every((count) => count === 0),
      { timeout: 120_000, message: 'Task 538 correctness readiness' },
    )
    await expect
      .poll(
        () =>
          frame
            .locator('body')
            .evaluate(() => (window as any).__vmdeIncrementalSeedStats?.state),
        { timeout: 120_000 },
      )
      .toBe('ready')
    await frame
      .locator('body')
      .evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)))
    return frame
  }
  const documentState = () =>
    evaluateInVSCode(
      async (vscode, args: [string]) => {
        const document = vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.fsPath === args[0],
        )
        if (!document) throw new Error('Task 538 document is not open')
        return {
          text: document.getText(),
          dirty: document.isDirty,
          version: document.version,
        }
      },
      [file] as [string],
    ) as Promise<{ text: string; dirty: boolean; version: number }>
  const replaceDocument = (text: string) =>
    evaluateInVSCode(
      async (vscode, args: [string, string]) => {
        const document = vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.fsPath === args[0],
        )!
        const edit = new vscode.WorkspaceEdit()
        edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          ),
          args[1],
        )
        if (!(await vscode.workspace.applyEdit(edit)))
          throw new Error('Task 538 document restore failed')
      },
      [file, text] as [string, string],
    )
  const correctnessPerf = (action: 'clear' | 'snapshot') =>
    evaluateInVSCode(
      async (vscode, args: [string, string]) => {
        const extension = vscode.extensions.getExtension(args[0])
        await extension?.activate()
        const api = (extension?.exports as any)?.editPerf
        if (!api) throw new Error('Task 538 editPerf E2E API unavailable')
        return args[1] === 'clear' ? api.clear() : api.snapshot()
      },
      [ExtensionId, action] as [string, string],
    ) as Promise<PerfSample[] | undefined>

  let frame = await open()
  await expect
    .poll(() =>
      evaluateInVSCode(
        async (vscode, args: [string]) => {
          const git = vscode.extensions.getExtension('vscode.git')
          const repositories = git?.exports?.getAPI?.(1)?.repositories ?? []
          return repositories.some(
            (repository: { rootUri: { fsPath: string } }) =>
              repository.rootUri.fsPath === args[0],
          )
        },
        [baseDir] as [string],
      ),
    )
    .toBe(true)
  const targetLine = original
    .split(/\r?\n/)
    .find(
      (line) =>
        line.length >= 90 && /^[A-Za-z]/.test(line) && !/[`*[\]|#]/.test(line),
    )!
  const placeTarget = () =>
    frame.locator('body').evaluate(
      (_body, needle) => {
        const surface = document.querySelector<HTMLElement>('.vditor-ir')!
        const paragraph = Array.from(
          document.querySelectorAll<HTMLElement>('.vditor-ir p'),
        ).find((candidate) => candidate.textContent?.includes(needle as string))
        if (!paragraph) return false
        const walker = document.createTreeWalker(
          paragraph,
          NodeFilter.SHOW_TEXT,
        )
        let node = walker.nextNode() as Text | null
        let target: Text | null = null
        while (node) {
          if (node.data.trim()) target = node
          node = walker.nextNode() as Text | null
        }
        if (!target) return false
        surface.focus({ preventScroll: true })
        const range = document.createRange()
        range.setStart(target, target.data.length)
        range.collapse(true)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      },
      targetLine.slice(0, 60),
    )
  await correctnessPerf('clear')
  await frame.locator('.vditor-ir').click({ position: { x: 8, y: 8 } })
  expect(await placeTarget()).toBe(true)
  await workbox.keyboard.type('X')
  await expect
    .poll(async () => (await documentState()).text.length)
    .toBe(original.length + 1)
  expect((await documentState()).dirty).toBe(true)
  await expect
    .poll(
      async () =>
        (await correctnessPerf('snapshot'))?.some(
          (sample) => Number(sample.followers?.gitChangeCount ?? 0) > 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(true)

  await replaceDocument(original)
  await expect
    .poll(async () => hash((await documentState()).text), { timeout: 30_000 })
    .toBe(originalHash)

  await frame.locator('.vditor-ir').click({ position: { x: 8, y: 8 } })
  expect(await placeTarget()).toBe(true)
  await workbox.keyboard.type('X')
  await expect
    .poll(async () => (await documentState()).text.length)
    .toBe(original.length + 1)
  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  const saved = await documentState()
  const savedHash = hash(saved.text)
  expect(saved.dirty).toBe(false)
  expect(hash(readFileSync(file, 'utf8'))).toBe(savedHash)

  const backspaceAndUndo = async (
    locator: ReturnType<ReturnType<typeof wf>['locator']>,
  ) => {
    const before = await documentState()
    await frame.locator('.vditor-ir').click({ position: { x: 8, y: 8 } })
    expect(
      await locator.first().evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode() as Text | null
        let target: Text | null = null
        while (node) {
          if (node.data.trim()) target = node
          node = walker.nextNode() as Text | null
        }
        if (!target) return false
        const surface = element.closest<HTMLElement>('.vditor-ir')!
        surface.focus({ preventScroll: true })
        const range = document.createRange()
        range.setStart(target, target.data.length)
        range.collapse(true)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      }),
    ).toBe(true)
    await workbox.keyboard.press('Backspace')
    await expect
      .poll(async () => (await documentState()).version)
      .toBeGreaterThan(before.version)
    await replaceDocument(saved.text)
    await expect
      .poll(async () => hash((await documentState()).text), { timeout: 30_000 })
      .toBe(savedHash)
  }
  await backspaceAndUndo(frame.locator('.vditor-ir li'))

  const external = `${saved.text}Task 538 external update.\n`
  await evaluateInVSCode(
    async (vscode, args: [string, string]) => {
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.fsPath === args[0],
      )!
      const edit = new vscode.WorkspaceEdit()
      edit.insert(
        document.uri,
        document.positionAt(document.getText().length),
        args[1],
      )
      if (!(await vscode.workspace.applyEdit(edit)))
        throw new Error('Task 538 external edit failed')
    },
    [file, 'Task 538 external update.\n'] as [string, string],
  )
  await expect.poll(async () => (await documentState()).text).toBe(external)
  await expect
    .poll(() =>
      frame
        .locator('body')
        .evaluate(() => (window as any).vditor.getValue().length),
    )
    .toBeGreaterThan(saved.text.length)
  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.files.save')
  })
  expect(hash(readFileSync(file, 'utf8'))).toBe(hash(external))

  await evaluateInVSCode(async (vscode) => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })
  frame = await open()
  await expect(frame.locator('.vditor-ir')).toBeVisible()
  expect((await documentState()).text).toBe(external)
})
