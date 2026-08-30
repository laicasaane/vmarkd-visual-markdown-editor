import Vditor from 'vditor/src/index'
import { expandMarker } from 'vditor/src/ts/ir/expandMarker'
import { installIrMarkerReveal } from '../src/editing/editor-caret'
import { installCompositionState } from '../src/util/caret-gesture'

installCompositionState()
installIrMarkerReveal()

const value = [
  '**home-bold** tail',
  '[home-link](https://example.com) tail',
  '`home-code` tail',
  ...Array.from({ length: 18 }, (_, index) => `**page-bold-${index}**`),
  'tail **end-bold**',
  'tail [end-link](https://example.com)',
  'tail `end-code`',
].join('\n\n')

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  height: 320,
  cdn: `${location.origin}/vditor`,
  value,
  after() {
    const inner = (editor as unknown as { vditor: IVditor }).vditor
    const surface = inner.ir.element
    let markerClassMutations = 0
    new MutationObserver((records) => {
      markerClassMutations += records.filter(
        (record) =>
          record.target instanceof HTMLElement &&
          record.target.classList.contains('vditor-ir__node'),
      ).length
    }).observe(surface, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    })
    ;(window as unknown as { vditor: Vditor }).vditor = editor

    ;(
      window as unknown as {
        __focusInline(needle: string, offset: number): boolean
      }
    ).__focusInline = (needle, offset) => {
      const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT)
      let text: Text | null = null
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node.nodeValue ?? '').includes(needle)) {
          text = node as Text
          break
        }
      }
      if (!text) return false
      surface.focus()
      const range = document.createRange()
      range.setStart(text, Math.min(offset, text.data.length))
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      expandMarker(range, inner)
      selection?.removeAllRanges()
      selection?.addRange(range)
      return true
    }

    ;(
      window as unknown as {
        __placeInsideMarker(type: string): boolean
      }
    ).__placeInsideMarker = (type) => {
      const marker = surface.querySelector<HTMLElement>(
        `.vditor-ir__node[data-type="${type}"] .vditor-ir__marker`,
      )
      const text = marker?.firstChild
      if (!(text instanceof Text)) return false
      surface.focus()
      const range = document.createRange()
      range.setStart(text, Math.min(1, text.data.length))
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      return true
    }

    ;(
      window as unknown as {
        __composition(active: boolean): void
      }
    ).__composition = (active) => {
      document.dispatchEvent(
        new CompositionEvent(active ? 'compositionstart' : 'compositionend', {
          bubbles: true,
        }),
      )
    }

    ;(
      window as unknown as {
        __resetMarkerMutations(): void
      }
    ).__resetMarkerMutations = () => {
      markerClassMutations = 0
    }

    ;(
      window as unknown as {
        __markerState(): {
          parentClass: string
          parentText: string
          expanded: string[]
          classMutations: number
        } | null
      }
    ).__markerState = () => {
      const selection = window.getSelection()
      if (!selection?.rangeCount) return null
      const parent =
        selection.anchorNode?.nodeType === Node.TEXT_NODE
          ? selection.anchorNode.parentElement
          : (selection.anchorNode as HTMLElement | null)
      return {
        parentClass: parent?.className ?? '',
        parentText: parent?.textContent ?? '',
        expanded: Array.from(
          surface.querySelectorAll<HTMLElement>('.vditor-ir__node--expand'),
        ).map((node) => node.getAttribute('data-type') ?? '?'),
        classMutations: markerClassMutations,
      }
    }
    ;(window as unknown as { __ready: boolean }).__ready = true
  },
})
