import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Task 457 — wiki chips are <span>s; without an explicit tabindex a bare span is never
// keyboard-focusable, so main.css's `.wiki-link-chip:focus-visible` rule (outline from
// --vscode-focusBorder) was DEAD CSS — nothing could ever trigger it. This spec proves the fix in
// the REAL webview, where the harness's synthetic focus/CSS environment (media-src/e2e/
// wiki-keyboard-focus.spec.ts, L2) can't stand in for VS Code's injected theme CSS: Tab reaches the
// chip, the focus ring's outline actually PAINTS (getComputedStyle, not just element identity), and
// Enter activates it via the same open-wikilink path the click handler already uses.
//
// MUST run inside a real workspace folder: asset-link-actions.ts's getWikiRoot needs
// vscode.workspace.getWorkspaceFolder(uri) to resolve, or wiki links are disabled entirely
// (getWikiDocumentContext returns {enabled:false}, custom-renderer.ts never installs the chip
// renderer, and no `.wiki-link-chip` is ever rendered — an earlier version of this spec opened its
// fixture from os.tmpdir(), OUTSIDE the harness's own workspace folder, and timed out for exactly
// this reason; it never actually ran green). The `baseDir` fixture IS the workspace folder VS Code
// is launched with (vscode-test-playwright's electronApp fixture passes it as the folder arg) — a
// real filesystem path this test can write directly into. `Home.md` is pre-created in that SAME
// root so the target resolves to exactly one match: `open-wikilink`'s single-match branch calls
// `vscode.openWith` directly, a clean, deterministic, non-interactive effect to assert on (the
// zero/multi-match branches show an interactive notification/quick-pick instead).
function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

test('Tab reaches a wiki chip, the focus ring paints, and Enter activates it via the shared open path', async ({
  workbox,
  evaluateInVSCode,
  baseDir,
}) => {
  test.setTimeout(90_000)

  const homePath = path.join(baseDir, 'Home.md')
  const docPath = path.join(baseDir, 'wiki-chip-focus.md')
  writeFileSync(homePath, '# Home\n\nThe target page.\n')
  const docContent =
    '# Wiki chip keyboard focus (task 457)\n\nSee the [[Home]] page for details.\n'
  writeFileSync(docPath, docContent)

  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [docPath] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  // Wiki chips are INLINE spans in the editable paragraph's own text flow — not nested inside a
  // `.vditor-ir__preview` block-preview wrapper (that class is for block-level renders like
  // fenced diagrams/tables, a different structure). Matches wiki-click.spec.ts's own selector.
  const chip = frame.locator('.wiki-link-chip[data-wiki-target="Home"]')
  await chip.waitFor({ timeout: 60_000 })
  // `getValue()` goes through `this.vditor.lute.VditorIRDOM2Md`, and the WASM Lute instance is
  // assigned asynchronously — a rendered `.vditor-ir` and a rendered chip do NOT imply it has landed
  // (measured: this threw `Cannot read properties of undefined (reading 'VditorIRDOM2Md')` at ~6s
  // with both already present). Note the DOUBLE `.vditor`: `window.vditor` is the outer instance,
  // `window.vditor.vditor` the inner one that owns `lute` (same shape perf-observer-fleet.spec.ts
  // reads). Poll for it rather than adding a fixed settle — task 451's convention.
  await frame.locator('body').evaluate(async () => {
    const ready = () => !!(window as any).vditor?.vditor?.lute
    for (let i = 0; i < 300 && !ready(); i++) {
      await new Promise((r) => setTimeout(r, 100))
    }
    if (!ready())
      throw new Error('Lute never became available on window.vditor.vditor')
  })
  // Baseline from the WEBVIEW's own getValue() (not the raw file bytes) — Lute's on-open
  // canonicalization could legitimately differ from disk even with zero edits, which would make a
  // disk-bytes comparison a false positive unrelated to the Tab walk this test actually checks.
  const baselineValue = await frame
    .locator('body')
    .evaluate(() => (window as any).vditor.getValue())

  // Establish real keyboard-focus context INSIDE the webview iframe first — click near (not on)
  // the chip, at the start of the heading above it, so the very next Tab stops are inside the
  // document flow. workbox's top-level keyboard then dispatches real OS-level key events that
  // cross the iframe boundary correctly once focus is inside it (unlike a synthetic dispatchEvent
  // from evaluate()).
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })

  let reached = false
  for (let i = 0; i < 40; i++) {
    await workbox.keyboard.press('Tab')
    if (await chip.evaluate((el) => el === document.activeElement)) {
      reached = true
      break
    }
  }
  expect(reached, 'Tab must reach the wiki chip').toBe(true)

  // Tabbing through a contenteditable is exactly where a stray character or a swallowed key can
  // silently edit the document — check getValue() is unchanged by the TAB WALK ALONE, before
  // Enter is even pressed, not just after the whole sequence.
  const afterTabs = await frame
    .locator('body')
    .evaluate(() => (window as any).vditor.getValue())
  expect(
    afterTabs,
    'the Tab walk alone (before any activation) must not change the document',
  ).toBe(baselineValue)

  // The dead-CSS-comes-alive proof: main.css's `.wiki-link-chip:focus-visible` sets a real
  // outline (not `none`) — only observable in the real webview, where VS Code's injected theme
  // CSS + `--vscode-focusBorder` are actually present (the harness can't reproduce this).
  const outlineStyle = await chip.evaluate(
    (el) => getComputedStyle(el).outlineStyle,
  )
  expect(outlineStyle, 'the focus-visible outline must actually paint').toBe(
    'solid',
  )

  // Enter activates via the SAME path the click handler uses (link-click-fix.ts's
  // activateWikiLink → open-wikilink → asset-link-actions.ts's single-match branch, which opens
  // Home.md directly with no dialog since it's the only match in this workspace).
  await workbox.keyboard.press('Enter')

  // Both wiki-chip-focus.md (opened at the start) and Home.md (opened by Enter) are vmarkd.editor
  // tabs, so the check must find the ONE whose URI is Home.md specifically, not just "any
  // vmarkd.editor tab" — the original document's own tab would otherwise false-positive this.
  await expect
    .poll(
      async () =>
        evaluateInVSCode(
          async (vscode: typeof import('vscode'), args: string[]) =>
            vscode.window.tabGroups.all
              .flatMap((g) => g.tabs)
              .some(
                (t) =>
                  t.input instanceof vscode.TabInputCustom &&
                  t.input.viewType === 'vmarkd.editor' &&
                  t.input.uri.fsPath === args[0],
              ),
          [homePath] as [string],
        ),
      { timeout: 15_000, intervals: [300, 600, 1000] },
    )
    .toBe(true)

  // getValue() on the (still-open) FIRST document must also be untouched — Enter navigating away
  // must not have gone through any write path on the document it activated FROM.
  const originalDocText = await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) =>
      vscode.workspace.textDocuments
        .find((d) => d.uri.fsPath === args[0])
        ?.getText() ?? '',
    [docPath] as [string],
  )
  expect(
    originalDocText,
    'keyboard activation must not change the source document',
  ).toBe(docContent)
})
