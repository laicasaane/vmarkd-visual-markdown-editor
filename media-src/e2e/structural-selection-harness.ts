import Vditor from 'vditor/src/index'
import { expandMarker } from 'vditor/src/ts/ir/expandMarker'
import { installStructuralSelection } from '../src/editing/selection-scope'
import { installIrMarkerReveal } from '../src/editing/editor-caret'
import { installCompositionState } from '../src/util/caret-gesture'
import { installCaretInvalidation, requestCaret } from '../src/editing/caret'
import { installEscapeToolbar } from '../src/editing/escape-toolbar'

installCompositionState()
installCaretInvalidation()
installIrMarkerReveal()
installStructuralSelection()

const value = [
  'alpha **bold scope** omega',
  '',
  '- first item',
  '  - nested item',
  '',
  '| A | B |',
  '| --- | --- |',
  '| cell one | cell two |',
  '',
  '```ts',
  'const fence = true',
  '```',
  '',
  'final paragraph',
].join('\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  height: 440,
  cdn: `${location.origin}/vditor`,
  value,
  after() {
    const inner = (editor as unknown as { vditor: IVditor }).vditor
    const surface = inner.ir.element
    ;(window as unknown as { vditor: Vditor }).vditor = editor
    installEscapeToolbar()

    ;(
      window as unknown as {
        __focusText(needle: string): boolean
      }
    ).__focusText = (needle) => {
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node.nodeValue ?? '').indexOf(needle)
        if (index < 0) continue
        surface.focus()
        const range = document.createRange()
        range.setStart(node, index + Math.floor(needle.length / 2))
        range.collapse(true)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
        return true
      }
      return false
    }

    ;(
      window as unknown as {
        __focusFenceSource(): Promise<boolean>
      }
    ).__focusFenceSource = async () => {
      const code = surface.querySelector<HTMLElement>(
        '[data-type="code-block"] > .vditor-ir__marker--pre > code',
      )
      if (!code) return false
      surface.focus()
      const place = () => {
        const text = code.firstChild
        if (!(text instanceof Text)) return null
        const range = document.createRange()
        range.setStart(text, Math.min(3, text.data.length))
        range.collapse(true)
        const selection = getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        return range
      }
      const range = place()
      if (!range) return false
      expandMarker(range, inner)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
      const text = code.firstChild
      return text instanceof Text
        ? requestCaret({ node: text, offset: Math.min(3, text.data.length) })
        : false
    }

    ;(
      window as unknown as {
        __selectFenceSourceStage(): Promise<boolean>
        __focusFenceSource(): Promise<boolean>
      }
    ).__selectFenceSourceStage = async () => {
      const ok = await (
        window as unknown as { __focusFenceSource(): Promise<boolean> }
      ).__focusFenceSource()
      if (!ok) return false
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      surface.dispatchEvent(event)
      return event.defaultPrevented
    }

    ;(
      window as unknown as {
        __selectionText(): string
      }
    ).__selectionText = () => getSelection()?.toString() ?? ''
    ;(
      window as unknown as {
        __expandedTypes(): string[]
      }
    ).__expandedTypes = () =>
      Array.from(
        surface.querySelectorAll<HTMLElement>('.vditor-ir__node--expand'),
      ).map((node) => node.getAttribute('data-type') ?? '?')
    ;(
      window as unknown as {
        __copySelection(): { plain: string; html: string }
      }
    ).__copySelection = () => {
      const data = new DataTransfer()
      data.setData('text/plain', '__UNSET__')
      data.setData('text/html', '__UNSET__')
      surface.dispatchEvent(
        new ClipboardEvent('copy', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      )
      return {
        plain: data.getData('text/plain'),
        html: data.getData('text/html'),
      }
    }
    ;(window as unknown as { __ready: boolean }).__ready = true
  },
})
