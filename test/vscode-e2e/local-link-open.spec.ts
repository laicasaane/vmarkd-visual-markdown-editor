import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 359 — verifies the FIX (onOpenLink: Uri.file not Uri.parse, raw href not resolved href,
// scheme allowlist, directory/missing-target handling). The probe
// (local-link-open-probe.spec.ts) measured the PRE-fix behaviour: a relative WYSIWYG/preview
// link resolved to a `https://…vscode-resource…` href and routed to `env.openExternal` instead
// of opening the file — confirmed via a host-side patch of `vscode.env.openExternal`.
//
// This spec is outcome-based (open tab / error message / no tab), matching the task's own L3
// verification wording — no webview-side message interception, which the probe found doesn't
// work in real VS Code (`acquireVsCodeApi().postMessage` is non-writable there).
//
// `../b.md` (per the task's verification list) needs a WORKSPACE FOLDER open — without one,
// onOpenLink's containment (task 148 item 2) treats the doc's own directory as the root and
// refuses ANY `../` escape from it, by design (see open-link.test.ts's "without a workspace"
// case). `baseDir` is vscode-test-playwright's launch-folder option; overriding it here (instead
// of the default throwaway temp dir) makes VS Code open with THIS fixture tree as the workspace
// root, matching how a real user (a project folder open) would hit this path.
const dir = path.join(tmpdir(), `vmarkd-link-open-${process.pid}`)
mkdirSync(path.join(dir, 'sub'), { recursive: true })
mkdirSync(path.join(dir, 'a-directory'), { recursive: true })
writeFileSync(path.join(dir, 'sub', 'a.md'), '# A\n')
writeFileSync(path.join(dir, 'b.md'), '# B\n')
writeFileSync(path.join(dir, 'my file.md'), '# Spaced\n')
const main = path.join(dir, 'sub', 'main.md')
writeFileSync(
  main,
  [
    '# Local link open',
    '',
    '- [nested](./a.md)',
    '- [up-then-sibling](../b.md)',
    '- [spaced](../my%20file.md)',
    '- [dir](../a-directory)',
    '- [missing](../does-not-exist.md)',
    '- [web](https://example.com)',
    '',
  ].join('\n'),
)

test.use({ baseDir: dir })

const wf = (w: import('@playwright/test').Page) =>
  w
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')

const settle = (f: ReturnType<typeof wf>, ms: number) =>
  f
    .locator('body')
    .evaluate((_e, d) => new Promise((r) => setTimeout(r, d as number)), ms)

async function boot(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  workbox: import('@playwright/test').Page,
) {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode')) => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    },
    [] as unknown as [string],
  )
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [main] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await settle(frame, 1500)

  // Switch to WYSIWYG through the toolbar edit-mode panel (the user's own path) — real <a
  // href> elements only exist there / in SV's preview pane, not in IR's marker spans.
  await frame.locator('body').evaluate(() => {
    const v = (
      window as unknown as {
        vditor: {
          vditor: { toolbar: { elements: Record<string, HTMLElement> } }
        }
      }
    ).vditor.vditor
    v.toolbar.elements['edit-mode']?.children[0]?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    document
      .querySelector('button[data-mode="wysiwyg"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await frame.locator('.vditor-wysiwyg').first().waitFor({ timeout: 30_000 })
  await settle(frame, 1000)

  return { frame }
}

async function openTabFsPaths(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
): Promise<string[]> {
  return evaluateInVSCode(
    async (vscode: typeof import('vscode')) => {
      return vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .map(
          (t) =>
            (t.input as { uri?: { fsPath?: string } } | undefined)?.uri?.fsPath,
        )
        .filter((p): p is string => !!p)
    },
    [] as unknown as [string],
  ) as Promise<string[]>
}

// Extension-host-side patch of showErrorMessage — plain mutable object there (unlike the
// webview's non-writable acquireVsCodeApi() handle, see local-link-open-probe.spec.ts).
async function installErrorSpy(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
) {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode')) => {
      const g = globalThis as unknown as { __linkOpenErrors?: string[] }
      g.__linkOpenErrors = []
      const orig = vscode.window.showErrorMessage.bind(vscode.window)
      vscode.window.showErrorMessage = ((msg: string, ...rest: unknown[]) => {
        g.__linkOpenErrors!.push(msg)
        return (orig as any)(msg, ...rest)
      }) as typeof vscode.window.showErrorMessage
    },
    [] as unknown as [string],
  )
}

async function readErrorSpy(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
): Promise<string[]> {
  return evaluateInVSCode(
    async () => {
      return (
        (globalThis as unknown as { __linkOpenErrors?: string[] })
          .__linkOpenErrors ?? []
      )
    },
    [] as unknown as [string],
  ) as Promise<string[]>
}

async function ctrlClickLink(
  frame: ReturnType<typeof wf>,
  hrefSubstring: string,
) {
  await frame.locator('body').evaluate((_el, needle) => {
    const a = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.vditor-wysiwyg a[href]'),
    ).find((el) => (el.getAttribute('href') ?? '').includes(needle as string))
    if (!a) throw new Error(`link containing "${needle}" not found`)
    a.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      }),
    )
  }, hrefSubstring)
}

test.afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('a nested relative link (./a.md) opens the right file, not the OS browser', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const { frame } = await boot(evaluateInVSCode, workbox)
  const before = await openTabFsPaths(evaluateInVSCode)

  await ctrlClickLink(frame, './a.md')
  await settle(frame, 1500)

  const after = await openTabFsPaths(evaluateInVSCode)
  const newTabs = after.filter((p) => !before.includes(p))
  expect(newTabs).toEqual([path.join(dir, 'sub', 'a.md')])
})

test('"../b.md" resolves against the workspace and opens the sibling file', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const { frame } = await boot(evaluateInVSCode, workbox)
  const before = await openTabFsPaths(evaluateInVSCode)

  await ctrlClickLink(frame, '../b.md')
  await settle(frame, 1500)

  const after = await openTabFsPaths(evaluateInVSCode)
  const newTabs = after.filter((p) => !before.includes(p))
  expect(newTabs).toEqual([path.join(dir, 'b.md')])
})

test('a percent-encoded space ("my%20file.md") resolves to the real spaced filename', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const { frame } = await boot(evaluateInVSCode, workbox)
  const before = await openTabFsPaths(evaluateInVSCode)

  await ctrlClickLink(frame, 'my%20file.md')
  await settle(frame, 1500)

  const after = await openTabFsPaths(evaluateInVSCode)
  const newTabs = after.filter((p) => !before.includes(p))
  expect(newTabs).toEqual([path.join(dir, 'my file.md')])
})

test('a directory target reveals it in the Explorer, not "open as file"', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const { frame } = await boot(evaluateInVSCode, workbox)
  const before = await openTabFsPaths(evaluateInVSCode)

  await ctrlClickLink(frame, 'a-directory')
  await settle(frame, 1500)

  const after = await openTabFsPaths(evaluateInVSCode)
  // No new EDITOR tab — the directory is revealed in Explorer, not opened as a document.
  expect(after.filter((p) => !before.includes(p))).toEqual([])
})

test('a missing target shows a readable error naming the resolved path — no raw failure, no silent no-op', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const { frame } = await boot(evaluateInVSCode, workbox)
  await installErrorSpy(evaluateInVSCode)
  const before = await openTabFsPaths(evaluateInVSCode)

  await ctrlClickLink(frame, 'does-not-exist.md')
  await settle(frame, 1500)

  const after = await openTabFsPaths(evaluateInVSCode)
  expect(after.filter((p) => !before.includes(p))).toEqual([])
  const errors = await readErrorSpy(evaluateInVSCode)
  expect(errors.some((m) => m.includes('does-not-exist.md'))).toBe(true)
})

test('an https:// link does NOT open an editor tab (routes to the OS browser instead)', async ({
  workbox,
  evaluateInVSCode,
}) => {
  test.setTimeout(90_000)
  const { frame } = await boot(evaluateInVSCode, workbox)
  const before = await openTabFsPaths(evaluateInVSCode)

  await ctrlClickLink(frame, 'https://example.com')
  await settle(frame, 1500)

  const after = await openTabFsPaths(evaluateInVSCode)
  expect(after.filter((p) => !before.includes(p))).toEqual([])
})
