import Vditor from 'vditor/src/index'
import {
  installReadingPosition,
  type ReadingPositionController,
} from '../src/nav/reading-position'
import { blockModeElement } from '../src/util/source-map'
import { topLevelBlocks } from '../src/nav/section-range'
import { findScroller } from '../src/chrome/toolbar-scroll-guard'
import type { ReadingPositionState, VsCodeApi } from '../../src/shared/protocol'

const paragraphs = Array.from(
  { length: 70 },
  (_, index) => `Paragraph ${index}: ${'reading position '.repeat(8)}`,
)
const initial = ['# Reading position fixture', '', ...paragraphs].join('\n\n')

let webviewState: Record<string, unknown> = {}
let hostState: ReadingPositionState | undefined
const api: Pick<VsCodeApi, 'getState' | 'setState'> = {
  getState: () => webviewState,
  setState: (state) => {
    webviewState = state as Record<string, unknown>
    return state
  },
}
let controller: ReadingPositionController

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  height: 420,
  cdn: `${location.origin}/vditor`,
  value: initial,
  toolbar: [],
  customWysiwygToolbar: () => {
    /* Vditor calls this while constructing WYSIWYG controls. */
  },
  after() {
    ;(window as any).vditor = editor
    const install = () => {
      controller = installReadingPosition(
        editor,
        hostState,
        (state) => {
          hostState = state
        },
        true,
        api,
      )
    }
    install()

    const findBlock = (needle: string) =>
      topLevelBlocks(blockModeElement(editor)!).find((block) =>
        (block.textContent ?? '').includes(needle),
      )
    const placeCaret = (block: HTMLElement) => {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      const node = walker.nextNode()
      if (!node) return
      const range = document.createRange()
      range.setStart(node, Math.min(5, node.textContent?.length ?? 0))
      range.collapse(true)
      const selection = getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    }

    ;(window as any).__captureAt = (needle: string) => {
      const surface = blockModeElement(editor)!
      const block = findBlock(needle)
      if (!block) return false
      const scroller = findScroller(surface)
      const viewportTop =
        scroller === document.scrollingElement ||
        scroller === document.documentElement ||
        scroller === document.body
          ? 0
          : scroller.getBoundingClientRect().top
      scroller.scrollTop = Math.max(
        0,
        scroller.scrollTop +
          block.getBoundingClientRect().top -
          viewportTop -
          37,
      )
      placeCaret(block)
      controller.save()
      return true
    }
    ;(window as any).__rebootAfterInsert = async () => {
      controller.dispose()
      editor.setValue(`# Inserted above\n\n${initial}`)
      await new Promise((resolve) => setTimeout(resolve, 100))
      install()
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    ;(window as any).__positionView = () => {
      const surface = blockModeElement(editor)!
      const scroller = findScroller(surface)
      const top =
        scroller === document.scrollingElement ||
        scroller === document.documentElement ||
        scroller === document.body
          ? 0
          : scroller.getBoundingClientRect().top
      const visible = topLevelBlocks(surface).find(
        (block) => block.getBoundingClientRect().bottom > top + 1,
      )
      const selection = getSelection()
      const caretBlock =
        selection?.anchorNode?.parentElement?.closest('[data-block]')
      return {
        visibleText: visible?.textContent?.trim() ?? '',
        caretText: caretBlock?.textContent?.trim() ?? '',
        scrollTop: scroller.scrollTop,
        savedHash: hostState?.anchor.hash ?? '',
      }
    }
    ;(window as any).__ready = true
  },
})
