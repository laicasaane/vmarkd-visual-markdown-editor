import type { Page } from '@playwright/test'

// Shared Playwright-side helpers for the mouse-ops specs (task 191 Infra-3):
// copy-cut / paste-pipeline / mouse-selection all drive the same mouseops harness.

export type Mode = 'ir' | 'wysiwyg' | 'sv'

export async function gotoMouseops(page: Page, mode: Mode = 'ir') {
  // Installed before the bundle runs, so utils.ts's acquireVsCodeApi() picks up the
  // recording stub and window.vscode.postMessage lands on window.__posted.
  await page.addInitScript(() => {
    ;(window as any).__posted = []
    ;(window as any).acquireVsCodeApi = () => ({
      postMessage: (m: any) => (window as any).__posted.push(m),
      getState: () => undefined,
      setState: () => {},
    })
  })
  await page.goto(`/mouseops.html?mode=${mode}`)
  await page.waitForFunction(() => (window as any).__ready === true)
}

export function posted(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__posted as any[])
}

export function editPosts(page: Page): Promise<any[]> {
  return page.evaluate(() =>
    ((window as any).__posted as any[]).filter((m) => m.command === 'edit'),
  )
}

// setValue + drop the setValue-driven edit so the spec counts only the op under test.
export async function setDoc(page: Page, md: string) {
  await page.evaluate((v) => {
    ;(window as any).vditor.setValue(v)
    ;(window as any).__posted.length = 0
  }, md)
  await page.waitForTimeout(300) // let the render (chips/diagrams) settle
}

export function getValue(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).vditor.getValue() as string)
}

// Select the entire editable content of the active mode (cross-block selection).
// Focuses the editable first so a subsequent execCommand('delete') (the cut path)
// actually operates on it.
export function selectAllContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = (window as any).__modeEl() as HTMLElement
    el.focus()
    const r = document.createRange()
    r.selectNodeContents(el)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(r)
    return r.toString()
  })
}

// Select the contents of the first element matching `selector` inside the editor
// (used to land both range endpoints inside a specific CODE / A / P for the branchy
// wysiwyg copy handler). Focuses the editable so the cut path's execCommand applies.
export function selectWithin(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = (window as any).__modeEl() as HTMLElement
    el.focus()
    const target = el.querySelector(sel) as HTMLElement | null
    if (!target) throw new Error(`selectWithin: no match for ${sel}`)
    const r = document.createRange()
    r.selectNodeContents(target)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(r)
    return r.toString()
  }, selector)
}

export function collapseCaret(page: Page): Promise<void> {
  return page.evaluate(() => {
    const el = (window as any).__modeEl() as HTMLElement
    el.focus()
    const r = document.createRange()
    r.setStart(el, 0)
    r.collapse(true)
    const s = getSelection()!
    s.removeAllRanges()
    s.addRange(r)
  })
}

// Dispatch a synthetic ClipboardEvent on the active mode element and read the
// DataTransfer the handler wrote. Sentinels pre-seed the transfer so an early-return
// (e.g. the empty-selection guard) is observable as an UNTOUCHED payload.
export const UNSET = '__UNSET__'
export function syntheticClipboard(
  page: Page,
  type: 'copy' | 'cut',
): Promise<{ plain: string; html: string }> {
  return page.evaluate((evType) => {
    const el = (window as any).__modeEl() as HTMLElement
    const dt = new DataTransfer()
    dt.setData('text/plain', '__UNSET__')
    dt.setData('text/html', '__UNSET__')
    const ev = new ClipboardEvent(evType, {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    })
    el.dispatchEvent(ev)
    return { plain: dt.getData('text/plain'), html: dt.getData('text/html') }
  }, type)
}

// Real triple-click selects the whole line under the pointer (marker-inclusive in IR).
export async function tripleClick(page: Page, selector: string) {
  await page.locator(selector).first().click({ clickCount: 3 })
}
