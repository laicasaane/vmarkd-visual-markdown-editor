// Responsive-table normalization (split out of utils.ts, 185/3g).
//
// Vditor (and pasted HTML) pins tables with explicit width attributes/styles; normalize them
// to fluid `table-layout:fixed; width:100%` so tables track the column. Re-asserted on window
// resize, DOM mutations (Vditor rebuilds tables per keystroke), and container resizes.

import { debounce } from '../util/debounce'

let responsiveTableCleanup: (() => void) | null = null

function normalizeResponsiveTables(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLTableElement>('.vditor-reset table')
    .forEach((table) => {
      table.removeAttribute('width')
      table.style.setProperty('display', 'table', 'important')
      table.style.setProperty('table-layout', 'fixed', 'important')
      table.style.setProperty('width', '100%', 'important')
      table.style.setProperty('max-width', '100%', 'important')
      table.style.setProperty('min-width', '0', 'important')
      table.style.setProperty('box-sizing', 'border-box')
    })

  root
    .querySelectorAll<HTMLElement>(
      '.vditor-reset table colgroup col, .vditor-reset table th, .vditor-reset table td',
    )
    .forEach((element) => {
      element.removeAttribute('width')
      element.style.removeProperty('width')
      element.style.removeProperty('min-width')
      element.style.removeProperty('max-width')
      element.style.removeProperty('white-space')
    })
}

export function fixResponsiveTables() {
  responsiveTableCleanup?.()

  const root = document.querySelector('.vditor') ?? document.body
  const syncTables = debounce(() => {
    normalizeResponsiveTables(root)
  }, 16)

  syncTables()

  const onResize = () => {
    syncTables()
  }

  window.addEventListener('resize', onResize)

  // This observer watches the attributes it also mutates (style/width) — the debounce plus
  // the idempotent normalization (re-setting identical values fires no mutation record) are
  // what keep it from looping. Don't widen the attributeFilter without re-checking that.
  const mutationObserver = new MutationObserver(() => {
    syncTables()
  })
  mutationObserver.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'width'],
  })

  let resizeObserver: ResizeObserver | undefined
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      syncTables()
    })
    resizeObserver.observe(root)
  }

  responsiveTableCleanup = () => {
    window.removeEventListener('resize', onResize)
    mutationObserver.disconnect()
    resizeObserver?.disconnect()
    syncTables.cancel()
  }
}
