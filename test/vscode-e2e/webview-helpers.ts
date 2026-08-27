// Shared helpers for the real-VS-Code spec suite. Extracted 2026-08-01 (task 483) — 187 of 190
// specs previously carried their own inline copy of these, which is why `jscpd` attributed 79% of
// the repository's duplication to this directory duplicating itself. `wf()`'s selector chain
// encodes a fact about how VS Code nests the webview's iframes; keeping it in one place means a
// nesting change is fixed once, not corrected in every spec that happens to still have a fresh copy.
//
// A handful of specs keep their own LOCAL variant instead of importing from here — that is
// deliberate, not an oversight: `caret-focused-open-probe.spec.ts` and `caret-empty-typing.spec.ts`
// use `.last()` because a donor tab can leave two vmarkd webview iframes in the DOM at once;
// `anchor-links.spec.ts` and `webview-message-origin-probe.spec.ts` add `:visible`;
// `prerender-first-open.spec.ts` uses `.locator(...).last().contentFrame()`. Each is solving a
// real, spec-specific timing/ambiguity problem — do not "fix" them to import this instead.

export function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

type EvaluateInVSCode = (fn: unknown, args: [string]) => Promise<unknown>

export async function reopenVMarkdFixture(
  evaluateInVSCode: EvaluateInVSCode,
  workbox: import('@playwright/test').Page,
  fixture: string,
  editorReadyTimeout = 60_000,
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
    [fixture] as [string],
  )
  const frame = wf(workbox)
  await frame
    .locator('.vditor-ir')
    .first()
    .waitFor({ timeout: editorReadyTimeout })
  return frame
}

export const ev = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  fn: unknown,
  arg = '',
) => evaluateInVSCode(fn, [arg] as [string])

export const settle = (frame: ReturnType<typeof wf>, ms: number) =>
  frame
    .locator('body')
    .evaluate((_el, d) => new Promise((r) => setTimeout(r, d as number)), ms)

export const docText = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  file: string,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) =>
      vscode.workspace.textDocuments
        .find((d) => d.uri.fsPath === args[0])
        ?.getText() ?? '',
    [file] as [string],
  ) as Promise<string>
