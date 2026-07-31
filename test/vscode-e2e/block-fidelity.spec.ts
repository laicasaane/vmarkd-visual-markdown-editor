import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Tasks 239 + 240 — editing anywhere in a document must not destroy blocks elsewhere in it.
//
// Both defects live in Lute's md → editable-DOM direction, which only exists inside the webview, so
// the real editor is the only place the contract can be checked end to end. The shape of each test
// is the user's own accident: open the file, type ONE character in a paragraph that has nothing to
// do with the fragile block, and read back the TextDocument.
//
// 239: an indented code block came back as PROSE — the indent gone, the code re-parsed as a
//      paragraph. IR is the default mode, so this hit every legacy / pandoc / email markdown.
// 240: a reference definition's title was dropped, and for an image reference it was injected into
//      the body text as literal garbage (`![alt][r]"T"`).
const SRC = path.join(__dirname, 'fixtures', 'block-fidelity.md')

function wf(workbox: import('@playwright/test').Page) {
  return workbox
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')
}

async function open(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  file: string,
) {
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), args: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(args[0]),
        'vmarkd.editor',
      )
    },
    [file] as [string],
  )
}

const docText = (
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

// task 451: was a blind 1500ms sleep after `.vditor-ir` first appeared, at all 4 call sites below.
// The container existing is not the same as Lute finishing the initial md→DOM build — poll for BOTH
// things the next steps need: the code blocks rendered as `pre code` (what `IR: typing elsewhere…`
// hard-asserts right after) AND the TYPE-HERE anchor paragraph existing (what `typeElsewhere` needs
// right after that) — a single synchronous parse pass produces both together, but polling for both
// removes any doubt rather than assuming their relative order.
async function waitForInitialRender(frame: ReturnType<typeof wf>) {
  await expect
    .poll(
      () =>
        frame.locator('body').evaluate(() => ({
          code: document.querySelectorAll('.vditor-ir pre code').length > 0,
          anchor: [...document.querySelectorAll('.vditor-ir p')].some((p) =>
            p.textContent?.includes('TYPE-HERE'),
          ),
        })),
      {
        message:
          'the initial IR render finished (code rendered, anchor paragraph present)',
      },
    )
    .toEqual({ code: true, anchor: true })
}

// task 451: was a blind 2500ms sleep at each `typeElsewhere`/`typeElsewhereSv` call site, waiting
// for the keystroke to reach `vscode.workspace.textDocuments` (the writeback debounce is 250ms —
// edit-sync.ts — so 2500ms was a 10x margin). Poll for the exact suffix the caller's own assertion
// checks next, then do one more real read so the caller gets a value it can pass to
// `assertBlocksSurvived` — the poll's return is a boolean, not the document text.
async function waitForDocText(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  tmp: string,
  suffix: string,
) {
  await expect
    .poll(async () => (await docText(evaluateInVSCode, tmp)).includes(suffix), {
      message: `the keystroke reached the saved TextDocument (expected "...${suffix}")`,
    })
    .toBe(true)
  return docText(evaluateInVSCode, tmp)
}

/**
 * Type one character at the end of the TYPE-HERE paragraph — a block that shares nothing with the
 * code blocks and definitions under test. The page-level click first: `focus()` below is DOM-level
 * INSIDE the iframe while `workbox.keyboard` dispatches to the top Electron window, and without it
 * the keystroke is silently dropped (see doc-sync.spec.ts).
 *
 * task 451: this used to end with a blind 2500ms sleep waiting for the keystroke to reach
 * `vscode.workspace.textDocuments` (the writeback debounce is 250ms — edit-sync.ts — so 2500ms was
 * a 10x margin). That settle is now a poll AT EACH CALL SITE instead of in here: it needs
 * `evaluateInVSCode` + the temp file path, neither of which this helper has, and the exact string
 * to poll for differs per call site (the stable-doc test polls for `.ZY` on its second call). Every
 * call site polls `docText(...)` for the expected suffix before reading it for real.
 */
async function typeElsewhere(
  frame: ReturnType<typeof wf>,
  workbox: import('@playwright/test').Page,
  mode: '.vditor-ir' | '.vditor-wysiwyg',
) {
  await frame
    .locator(mode)
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate((_el, sel) => {
    const p = [...document.querySelectorAll(`${sel} p`)].find((x) =>
      x.textContent?.includes('TYPE-HERE'),
    ) as HTMLElement | undefined
    const t = p?.lastChild as Text | null
    if (!t) throw new Error('TYPE-HERE anchor not found')
    const r = document.createRange()
    r.setStart(t, (t.textContent ?? '').length)
    r.collapse(true)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    p?.focus()
  }, mode)
  await workbox.keyboard.type('Z', { delay: 40 })
}

/**
 * The sv equivalent of `typeElsewhere`. Split mode has no `<p>` — the source view is a flat span
 * soup — so the anchor is found by walking text nodes instead of by block selector.
 */
async function typeElsewhereSv(
  frame: ReturnType<typeof wf>,
  workbox: import('@playwright/test').Page,
) {
  await frame
    .locator('.vditor-sv')
    .first()
    .click({ position: { x: 4, y: 4 } })
  await frame.locator('body').evaluate(() => {
    const sv = document.querySelector('.vditor-sv') as HTMLElement | null
    if (!sv) throw new Error('.vditor-sv not found')
    const walker = document.createTreeWalker(sv, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? ''
      const i = text.indexOf('TYPE-HERE anchor paragraph.')
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n as Text, i + 'TYPE-HERE anchor paragraph.'.length)
      r.collapse(true)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
      sv.focus()
      return
    }
    throw new Error('TYPE-HERE anchor not found in sv')
  })
  await workbox.keyboard.type('Z', { delay: 40 })
}

// task 451 follow-up: `waitForInitialRender` (below) went from a blind 1500ms sleep to a poll that
// resolves as soon as the IR content is parsed — much sooner than 1500ms. That exposed a real race:
// dispatching the edit-mode toolbar click before Vditor has finished wiring the toolbar's own click
// handlers is a LOST click, not a slow one — `.vditor-wysiwyg`/`.vditor-sv` then never appears and
// the subsequent `.waitFor` times out on a permanently-hidden element (measured: 1 flake in 11
// converted attempts vs 0 in 29 baseline attempts, incl. a same-shape full-file×3 baseline run that
// stayed clean — see task 451). Fix is the same doctrine as everywhere else in this file: poll for
// the completion marker of the thing about to happen (the toolbar panel + mode button existing in
// the DOM) instead of re-adding a fixed sleep before the click.
async function waitForModeToolbarReady(
  frame: ReturnType<typeof wf>,
  mode: string,
) {
  await expect
    .poll(
      () =>
        frame.locator('body').evaluate((_el, m) => {
          const v = (
            window as unknown as {
              vditor?: {
                vditor?: {
                  toolbar?: { elements?: Record<string, HTMLElement> }
                }
              }
            }
          ).vditor?.vditor
          const panelReady = !!v?.toolbar?.elements?.['edit-mode']?.children[0]
          const buttonReady = !!document.querySelector(
            `button[data-mode="${m}"]`,
          )
          return panelReady && buttonReady
        }, mode),
      {
        message: `the edit-mode toolbar panel and "${mode}" button are wired up`,
      },
    )
    .toBe(true)
}

/** Switch to WYSIWYG through the edit-mode toolbar panel — the user's own path. */
async function switchToWysiwyg(frame: ReturnType<typeof wf>) {
  await waitForModeToolbarReady(frame, 'wysiwyg')
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
  // task 451: was a blind 2500ms sleep after the container appeared. The container mounting is not
  // the same as Lute finishing the md→DOM rebuild into it — poll for the EXACT thing `typeElsewhere`
  // needs next (the TYPE-HERE paragraph existing), so "settled" means "ready for the next step",
  // not "some fixed margin elapsed".
  await expect
    .poll(
      () =>
        frame
          .locator('body')
          .evaluate(() =>
            [...document.querySelectorAll('.vditor-wysiwyg p')].some((p) =>
              p.textContent?.includes('TYPE-HERE'),
            ),
          ),
      { message: 'WYSIWYG finished rebuilding the document from source' },
    )
    .toBe(true)
}

/** Same path, into split mode. */
async function switchToSv(frame: ReturnType<typeof wf>) {
  await waitForModeToolbarReady(frame, 'sv')
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
      .querySelector('button[data-mode="sv"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await frame.locator('.vditor-sv').first().waitFor({ timeout: 30_000 })
  // task 451: was a blind 2500ms sleep — same reasoning as switchToWysiwyg above, poll for
  // `typeElsewhereSv`'s own precondition (the anchor text findable by its text-node walk).
  await expect
    .poll(
      () =>
        frame.locator('body').evaluate(() => {
          const sv = document.querySelector('.vditor-sv')
          return (
            !!sv &&
            (sv.textContent ?? '').includes('TYPE-HERE anchor paragraph.')
          )
        }),
      { message: 'split (sv) finished rebuilding the document from source' },
    )
    .toBe(true)
}

/** Everything both modes must guarantee about the saved file. */
function assertBlocksSurvived(after: string) {
  // 239 — still a code block. It may be a fence rather than four spaces (the repair makes IR agree
  // with WYSIWYG, which has always fenced), but the CONTENT and its block-ness must be intact.
  // What must never appear again is the content sitting at column 0 as ordinary prose.
  expect(after, 'the indented block is still code').toMatch(
    /(?:^ {4}indented code line|```\n?indented code line)/m,
  )
  expect(after, 'the block did not degrade to prose').not.toMatch(
    /^indented code line$/m,
  )
  expect(after, 'its second line came along').toContain('second indented line')
  // The block whose content holds a fence must not have been split into several blocks.
  expect(after, 'the inner fence is still inside one block').toMatch(
    /(?:^ {4}inner fence|````\n```\ninner fence)/m,
  )

  // 240 — the definition titles are still on the definitions.
  expect(after, 'the link definition kept its title').toContain(
    '[ref]: https://example.com "Ref Title"',
  )
  expect(after, 'the image definition kept its title').toContain(
    "[imgref]: pic.png 'Image Title'",
  )
  // …and the image title did NOT leak into the prose as literal text.
  expect(after, 'no title injected into the body').not.toContain(
    '![the image][imgref]"',
  )
  expect(after, 'the image reference is unchanged').toContain(
    '![the image][imgref]',
  )
  // An untitled definition must not gain one.
  expect(after, 'an untitled definition stays untitled').toContain(
    '[plainref]: https://plain.example\n',
  )
}

test('IR: typing elsewhere leaves indented code and titled definitions intact', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const tmp = path.join(tmpdir(), 'vmarkd-block-fidelity-ir.md')
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  await open(evaluateInVSCode, tmp)
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await waitForInitialRender(frame)

  // The code block must already be rendered as code — the parse is where it used to die.
  expect(
    await frame.locator('.vditor-ir pre code').count(),
    'the indented blocks render as code, not paragraphs',
  ).toBeGreaterThan(0)

  await typeElsewhere(frame, workbox, '.vditor-ir')
  const after = await waitForDocText(
    evaluateInVSCode,
    tmp,
    'TYPE-HERE anchor paragraph.Z',
  )
  assertBlocksSurvived(after)
  rmSync(tmp, { force: true })
})

test('WYSIWYG: the same document survives a mode switch and a keystroke', async ({
  workbox,
  evaluateInVSCode,
}) => {
  const tmp = path.join(tmpdir(), 'vmarkd-block-fidelity-wy.md')
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  await open(evaluateInVSCode, tmp)
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await waitForInitialRender(frame)
  await switchToWysiwyg(frame)

  await typeElsewhere(frame, workbox, '.vditor-wysiwyg')
  const after = await waitForDocText(
    evaluateInVSCode,
    tmp,
    'TYPE-HERE anchor paragraph.Z',
  )
  assertBlocksSurvived(after)
  rmSync(tmp, { force: true })
})

test('SPLIT (sv): the same document survives a mode switch and a keystroke', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // Added after the full suite caught 239/240 shipping with sv untouched. sv is a SOURCE view whose
  // markdown is `element.textContent` verbatim, so a defect in the DOM Lute builds for it lands
  // straight in the file — and split mode had BOTH defects: it dropped the definition titles, leaked
  // the image title into the prose, and hardcoded ``` around an indented block whose content holds
  // its own fence (one block re-parsing as three). This is sv's `block-fidelity` net; it had none.
  const tmp = path.join(tmpdir(), 'vmarkd-block-fidelity-sv.md')
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  await open(evaluateInVSCode, tmp)
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await waitForInitialRender(frame)
  await switchToSv(frame)

  await typeElsewhereSv(frame, workbox)
  const after = await waitForDocText(
    evaluateInVSCode,
    tmp,
    'TYPE-HERE anchor paragraph.Z',
  )
  assertBlocksSurvived(after)
  rmSync(tmp, { force: true })
})

test('the repaired document is STABLE: a second edit changes nothing more', async ({
  workbox,
  evaluateInVSCode,
}) => {
  // The property that makes the fix safe to ship: whatever normalization the first save applies
  // (four spaces → a fence), the second save must be a no-op beyond the typed character. Otherwise
  // every edit would keep churning the file and the minimal-diff write-back would never settle.
  const tmp = path.join(tmpdir(), 'vmarkd-block-fidelity-stable.md')
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  await open(evaluateInVSCode, tmp)
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await waitForInitialRender(frame)

  await typeElsewhere(frame, workbox, '.vditor-ir')
  const first = await waitForDocText(
    evaluateInVSCode,
    tmp,
    'TYPE-HERE anchor paragraph.Z',
  )
  await workbox.keyboard.type('Y', { delay: 40 })
  const second = await waitForDocText(
    evaluateInVSCode,
    tmp,
    'TYPE-HERE anchor paragraph.ZY',
  )

  expect(
    second.replace('.ZY', '.Z'),
    'the second edit adds one char, nothing else',
  ).toBe(first)
  assertBlocksSurvived(second)
  rmSync(tmp, { force: true })
})
