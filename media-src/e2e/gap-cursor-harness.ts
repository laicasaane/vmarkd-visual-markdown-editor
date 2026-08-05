// Harness for arrow navigation BETWEEN a thematic break and an adjacent ATOMIC block
// (code block / YAML front matter). Real Vditor (IR, from source so our patches apply) laid out
// as: front matter → hr → paragraph → hr → code block → hr → paragraph, with setupGapNav +
// observeGapParagraphs + observeTrailingParagraph + setupTrailingNav wired exactly as main.ts
// does. The spec drives real arrow keys and asserts the caret can STOP between the rule and the
// atomic block (a typeable gap paragraph) instead of jumping straight across it.
import Vditor from 'vditor/src/index'
import { installCaretInvalidation } from '../src/editing/caret'
import {
  observeGapParagraphs,
  observeTrailingParagraph,
  setupTrailingNav,
} from '../src/editing/gap-paragraph'
import { setupGapClick } from '../src/editing/gap-click'
import { setupGapNav } from '../src/editing/gap-nav'

// FIRST, exactly as main.ts wires it (and before any nav handler): a caret intent stays ARMED,
// re-asserting itself every frame, until a real user gesture drops it — so without this the next
// arrow key gets undone by the previous intent and the caret looks stuck. Order matters: the
// authority's keydown listener must be registered before the nav handlers' own.
installCaretInvalidation()

const FENCE = '```'
const value = `---\ntitle: x\n---\n\n---\n\npara\n\n---\n\n${FENCE}js\nconst a = 1\n${FENCE}\n\n---\n\ntail\n`

// `?mode=wysiwyg` runs the same fixture in the other mode gap-nav is wired for (main.ts hands it
// activeModeElement, not the IR element) — the atomic blocks are the same `data-type` divs there.
const mode =
  new URLSearchParams(location.search).get('mode') === 'wysiwyg'
    ? 'wysiwyg'
    : 'ir'

const editor = new Vditor('app', {
  cache: { enable: false },
  mode,
  height: 500,
  cdn: `${location.origin}/vditor`,
  value,
  after() {
    const iv = (editor as any).vditor
    const ir = iv[mode].element as HTMLElement
    observeGapParagraphs(() => ir)
    observeTrailingParagraph(ir)
    setupTrailingNav(() => ir)
    setupGapNav(() => ir)
    setupGapClick(() => ir)
    ;(window as any).vditor = editor
    ;(window as any).__el = () => ir
    // Place the caret at the start/end of the top-level block whose textContent contains `needle`.
    ;(window as any).__place = (needle: string, atEnd: boolean) => {
      const block = Array.from(ir.children).find((c) =>
        (c.textContent || '').includes(needle),
      ) as HTMLElement | undefined
      if (!block) return false
      ir.focus()
      const r = document.createRange()
      r.selectNodeContents(block)
      r.collapse(!atEnd)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
      return true
    }
    // A compact description of where the caret sits: index of the top-level block + its tag/type.
    ;(window as any).__where = () => {
      const s = window.getSelection()
      if (!s?.rangeCount) return 'no-selection'
      let n: Node | null = s.getRangeAt(0).startContainer
      while (n && n.parentElement !== ir) n = n.parentElement
      if (!n) return 'outside'
      const el = n as HTMLElement
      const idx = Array.from(ir.children).indexOf(el)
      const type = el.getAttribute('data-type') || el.tagName.toLowerCase()
      return `${idx}:${type}`
    }
    ;(window as any).__shape = () =>
      Array.from(ir.children)
        .map(
          (c) =>
            `${c.getAttribute('data-type') || c.tagName.toLowerCase()}${
              c.tagName === 'P'
                ? `(${JSON.stringify((c.textContent || '').replace(/​/g, ''))})`
                : ''
            }`,
        )
        .join(' | ')
    ;(window as any).__ready = true
  },
})
