import Vditor from 'vditor/src/index'
import { expandMarker } from 'vditor/src/ts/ir/expandMarker'
import { installIrMarkerReveal } from '../src/editing/editor-caret'
import { installCompositionState } from '../src/util/caret-gesture'

installCompositionState()
installIrMarkerReveal()

const value = [
  'plain-backspace-ABCDE',
  '- list-backspace-ABCDE',
  '',
  '| Header | Value |',
  '| --- | --- |',
  '| row | table-backspace-ABCDE |',
  '',
  'inline `code-backspace-ABCDE` tail',
  '',
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
    let selectionWrites = 0
    let expandedQueries = 0
    let expandedQueryStacks: string[] = []
    const selection = window.getSelection()
    if (selection) {
      const originalRemoveAllRanges = selection.removeAllRanges.bind(selection)
      const originalAddRange = selection.addRange.bind(selection)
      selection.removeAllRanges = () => {
        selectionWrites++
        originalRemoveAllRanges()
      }
      selection.addRange = (range) => {
        selectionWrites++
        originalAddRange(range)
      }
    }
    const originalQuerySelectorAll = surface.querySelectorAll.bind(surface)
    surface.querySelectorAll = ((selectors: string) => {
      if (selectors === '.vditor-ir__node--expand') {
        expandedQueries++
        expandedQueryStacks.push(new Error('expanded query').stack ?? '')
      }
      return originalQuerySelectorAll(selectors)
    }) as typeof surface.querySelectorAll
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
      const index = text.data.indexOf(needle)
      range.setStart(text, Math.min(index + offset, text.data.length))
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
        __resetMarkerMechanism(): void
      }
    ).__resetMarkerMechanism = () => {
      selectionWrites = 0
      expandedQueries = 0
      expandedQueryStacks = []
    }

    ;(
      window as unknown as {
        __markerMechanism(): {
          selectionWrites: number
          expandedQueries: number
          expandedQueryStacks: string[]
          blockText: string
          anchorOffset: number
        }
      }
    ).__markerMechanism = () => {
      const live = window.getSelection()
      const anchor = live?.rangeCount ? live.anchorNode : null
      const element =
        anchor?.nodeType === Node.ELEMENT_NODE
          ? (anchor as Element)
          : anchor?.parentElement
      return {
        selectionWrites,
        expandedQueries,
        expandedQueryStacks,
        blockText:
          element?.closest<HTMLElement>('[data-block]')?.textContent ?? '',
        anchorOffset: live?.anchorOffset ?? -1,
      }
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
