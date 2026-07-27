import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vscode-test-playwright'

// Copy and paste across every markdown element, on the real wire.
//
// The existing clipboard specs only ever exercise a paragraph, a list item and a heading in IR.
// This walks the block types a document actually contains and asserts the two directions that
// matter: copying a block puts its MARKDOWN SOURCE on the VS Code clipboard (not rendered DOM
// text), and pasting that source back reproduces the element rather than flattening it.
//
// Real keystrokes and the real VS Code clipboard throughout — a synthetic ClipboardEvent bypasses
// exactly the layer that can be broken.
const SRC = path.join(__dirname, 'fixtures', 'clipboard-elements.md')

const wf = (w: import('@playwright/test').Page) =>
  w
    .frameLocator('iframe.webview')
    .frameLocator('iframe[title="vMarkd"], #active-frame')

const settle = (f: ReturnType<typeof wf>, ms: number) =>
  f
    .locator('body')
    .evaluate((_e, d) => new Promise((r) => setTimeout(r, d as number)), ms)

let bootCount = 0

async function boot(
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  workbox: import('@playwright/test').Page,
) {
  // A unique path per test: VS Code keeps a TextDocument alive per fsPath, so a reused name hands
  // the next test the previous one's in-memory content however the file on disk is rewritten.
  const tmp = path.join(
    tmpdir(),
    `vmarkd-clip-el-${process.pid}-${bootCount++}.md`,
  )
  writeFileSync(tmp, readFileSync(SRC, 'utf8'))
  await evaluateInVSCode(
    async (vscode: typeof import('vscode')) => {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    },
    [] as unknown as [string],
  )
  await evaluateInVSCode(
    async (vscode: typeof import('vscode'), a: string[]) => {
      await vscode.extensions.getExtension('spiochacz.vmarkd')?.activate()
      await vscode.commands.executeCommand(
        'vscode.openWith',
        vscode.Uri.file(a[0]),
        'vmarkd.editor',
      )
    },
    [tmp] as [string],
  )
  const frame = wf(workbox)
  await frame.locator('.vditor-ir').first().waitFor({ timeout: 60_000 })
  await settle(frame, 2000)
  return { tmp, frame }
}

const readClip = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode')) => vscode.env.clipboard.readText(),
    [] as unknown as [string],
  ) as Promise<string>

const writeClip = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  text: string,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode'), a: string[]) => {
      await vscode.env.clipboard.writeText(a[0])
    },
    [text] as [string],
  )

const docText = (
  evaluateInVSCode: (fn: unknown, args: [string]) => Promise<unknown>,
  file: string,
) =>
  evaluateInVSCode(
    async (vscode: typeof import('vscode'), a: string[]) =>
      vscode.workspace.textDocuments
        .find((d) => d.uri.fsPath === a[0])
        ?.getText() ?? '',
    [file] as [string],
  ) as Promise<string>

/**
 * Select the element `selector` picks (the first one containing `needle`), then real Ctrl+C.
 *
 * `selectNode`, NOT `selectNodeContents`: Vditor's IR copy handler serializes
 * `range.cloneContents()` through `VditorIRDOM2Md`, and every marker a construct carries lives on or
 * inside its WRAPPER — the `##` marker span in the `<h2>`, the `**` spans in
 * `span.vditor-ir__node[data-type="strong"]`, the `<ul>` that makes an `<li>` a bullet. Selecting the
 * contents of the innermost element that happens to contain the text hands the serializer a bare
 * text fragment, so it can only ever produce the rendered text — which is why an earlier version of
 * this matrix "failed" on every inline element while the editor was behaving correctly.
 */
async function copyElement(
  frame: ReturnType<typeof wf>,
  workbox: import('@playwright/test').Page,
  selector: string,
  needle: string,
) {
  await frame
    .locator('.vditor-ir')
    .first()
    .click({ position: { x: 4, y: 4 } })
  const found = await frame.locator('body').evaluate(
    (_e, args) => {
      const [sel, n] = args as [string, string]
      const root = document.querySelector('.vditor-ir .vditor-reset')
      if (!root) return false
      const el = [...root.querySelectorAll(sel)].find((x) =>
        x.textContent?.includes(n),
      )
      if (!el) return false
      const range = document.createRange()
      range.selectNode(el)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      ;(root as HTMLElement).focus()
      return (selection?.toString() ?? '') !== ''
    },
    [selector, needle] as unknown as string,
  )
  expect(found, `a selection could be made around "${needle}"`).toBe(true)
  await workbox.keyboard.press('Control+c')
  await settle(frame, 1200)
}

// What each element must put on the clipboard when copied. The point of every entry is that the
// clipboard receives markdown SOURCE — the marker survives — rather than the rendered text, so each
// expectation names the marker (`##`, `**`, `- `, `> `, the pipes) and not just the words.
const COPY_CASES: {
  name: string
  selector: string
  needle: string
  expect: RegExp
}[] = [
  {
    name: 'heading',
    selector: 'h2',
    needle: 'H2 heading to copy',
    expect: /^##\s+H2 heading to copy$/,
  },
  {
    name: 'bold',
    selector: 'span.vditor-ir__node[data-type="strong"]',
    needle: 'bold text',
    expect: /^\*\*bold text\*\*$/,
  },
  {
    name: 'italic',
    selector: 'span.vditor-ir__node[data-type="em"]',
    needle: 'italic text',
    expect: /^\*italic text\*$/,
  },
  {
    name: 'inline code',
    selector: 'span.vditor-ir__node[data-type="code"]',
    needle: 'inline code',
    expect: /^`inline code`$/,
  },
  {
    name: 'link',
    selector: 'span.vditor-ir__node[data-type="a"]',
    needle: 'link',
    expect: /^\[link\]\(https:\/\/example\.com\)$/,
  },
  {
    name: 'bullet list',
    selector: 'ul',
    needle: 'ELEM bullet one',
    expect: /^- ELEM bullet one\n- ELEM bullet two$/,
  },
  {
    name: 'ordered list',
    selector: 'ol',
    needle: 'ELEM step one',
    expect: /^1\. ELEM step one\n2\. ELEM step two$/,
  },
  {
    name: 'blockquote',
    selector: 'blockquote',
    needle: 'ELEM quoted line one',
    expect: /^> ELEM quoted line one\.\n> ELEM quoted line two\.$/,
  },
  {
    name: 'table',
    selector: 'table',
    needle: 'ELEM cell A',
    expect: /\| ELEM cell A\s*\| ELEM cell B\s*\|/,
  },
  {
    name: 'fenced code',
    selector: 'div[data-type="code-block"]',
    needle: 'ELEM fenced code',
    expect: /^```ts\nconst elem = 'ELEM fenced code'\n```$/,
  },
  {
    name: 'indented code',
    selector: 'div[data-type="code-block"]',
    needle: 'ELEM indented code',
    // A ``` fence, not four spaces — task 239's repair converts indented code on open. Same
    // rendering, different bytes; that is the documented, deliberate behaviour.
    expect: /^```\nELEM indented code\n```$/,
  },
  {
    name: 'callout',
    selector: 'blockquote',
    needle: 'ELEM callout body',
    expect: /^> \[!NOTE\]\n> ELEM callout body\.$/,
  },
  {
    name: 'math block',
    selector: 'div[data-type="math-block"]',
    needle: 'E = mc^2',
    expect: /^\$\$\nE = mc\^2\n\$\$$/,
  },
]

for (const c of COPY_CASES) {
  test(`copy: a ${c.name} reaches the clipboard as markdown`, async ({
    workbox,
    evaluateInVSCode,
  }) => {
    const { tmp, frame } = await boot(evaluateInVSCode, workbox)
    await writeClip(evaluateInVSCode, 'SENTINEL-before-copy')
    await copyElement(frame, workbox, c.selector, c.needle)
    const clip = await readClip(evaluateInVSCode)
    expect(clip, 'the clipboard was not left at its previous value').not.toBe(
      'SENTINEL-before-copy',
    )
    expect(clip, `${c.name} copied as markdown source`).toMatch(c.expect)
    rmSync(tmp, { force: true })
  })
}

// What each element must become when its markdown is pasted into an empty paragraph. These assert
// the element SURVIVES the round trip — the marker is still there in the saved document — which is
// the failure mode that matters (a paste that flattens a list or a table into prose).
const PASTE_CASES: { name: string; source: string; expect: RegExp }[] = [
  {
    name: 'heading',
    source: '## Pasted heading\n',
    expect: /^##\s+Pasted heading$/m,
  },
  {
    name: 'bullet list',
    source: '- pasted a\n- pasted b\n',
    expect: /^[-*]\s+pasted a$/m,
  },
  {
    name: 'ordered list',
    source: '1. pasted one\n2. pasted two\n',
    expect: /^1\.\s+pasted one$/m,
  },
  {
    name: 'blockquote',
    source: '> pasted quote\n',
    expect: /^>\s+pasted quote$/m,
  },
  {
    name: 'table',
    source: '| A | B |\n| --- | --- |\n| p1 | p2 |\n',
    expect: /\|\s*p1\s*\|/,
  },
  {
    name: 'fenced code',
    source: '```js\npasted_code()\n```\n',
    expect: /```js\n?[\s\S]*pasted_code\(\)/,
  },
  {
    name: 'inline emphasis',
    source: 'a **pasted bold** b\n',
    expect: /\*\*pasted bold\*\*/,
  },
  {
    name: 'link',
    source: '[pasted link](https://p.example)\n',
    expect: /\[pasted link\]\(https:\/\/p\.example\)/,
  },
  {
    name: 'image',
    source: '![pasted alt](pic.png)\n',
    expect: /!\[pasted alt\]\(pic\.png\)/,
  },
  {
    name: 'math block',
    source: '$$\na + b\n$$\n',
    expect: /\$\$[\s\S]*a \+ b/,
  },
]

for (const c of PASTE_CASES) {
  test(`paste: ${c.name} markdown becomes a real ${c.name}`, async ({
    workbox,
    evaluateInVSCode,
  }) => {
    const { tmp, frame } = await boot(evaluateInVSCode, workbox)
    await writeClip(evaluateInVSCode, c.source)

    // Caret at the end of the dedicated target paragraph, which shares nothing with the elements
    // under test, so a failure here is about the paste and not about where it landed.
    await frame
      .locator('.vditor-ir')
      .first()
      .click({ position: { x: 4, y: 4 } })
    await frame.locator('body').evaluate(() => {
      const p = [...document.querySelectorAll('.vditor-ir p')].find((x) =>
        x.textContent?.includes('PASTE-TARGET'),
      ) as HTMLElement | undefined
      if (!p) throw new Error('PASTE-TARGET not found')
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
      let t: Text | null = null
      for (let n = walker.nextNode(); n; n = walker.nextNode()) t = n as Text
      if (!t) throw new Error('no text node in PASTE-TARGET')
      const r = document.createRange()
      r.setStart(t, (t.textContent ?? '').length)
      r.collapse(true)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
      p.focus()
    })
    await workbox.keyboard.press('Control+v')
    await settle(frame, 2500)

    const after = await docText(evaluateInVSCode, tmp)
    expect(after, `${c.name} survived the paste as markdown`).toMatch(c.expect)
    // Nothing outside the paste was destroyed.
    expect(after, 'the rest of the document survives').toContain(
      'Trailing anchor OMEGA.',
    )
    rmSync(tmp, { force: true })
  })
}
