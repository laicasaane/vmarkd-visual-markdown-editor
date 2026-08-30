import type Vditor from 'vditor'
import { blockModeElement } from '../util/source-map'
import {
  headingLabel,
  headingLevel,
  sectionRangeForHeading,
  topLevelBlocks,
} from './section-range'
import { guardComposition } from '../util/caret-gesture'
import type { SectionFoldState } from '../../../src/shared/protocol'
export type { SectionFoldState } from '../../../src/shared/protocol'

const FOLD_HIDDEN_ATTR = 'data-vmde-fold-hidden'
const FOLDED_ATTR = 'data-vmde-folded'
const FOLDABLE_ATTR = 'data-vmde-foldable'
const LIST_FOLDED_ATTR = 'data-vmde-list-folded'
const LIST_FOLDABLE_ATTR = 'data-vmde-list-foldable'
const STATE_KEY = 'vmdeSectionFolds'

interface HeadingFoldIdentity {
  id?: string
  text: string
  level: number
}

interface ListFoldIdentity {
  path: number[]
  text: string
}

export interface SectionFoldController {
  toggleHeading(headingIndex: number): boolean
  toggleListItem(item: HTMLElement): boolean
  toggleAt(node: Node): boolean
  ensureBlockVisible(block: Element): boolean
  state(): SectionFoldState
  apply(): void
  dispose(): void
}

interface ControllerOptions {
  initialState?: SectionFoldState
  persist?: (state: SectionFoldState) => void
}

const stableHeadingId = (id: string): string =>
  id.replace(/^(?:ir|wysiwyg)-/, '')

function headingIdentity(heading: HTMLElement): HeadingFoldIdentity {
  return {
    id: heading.id ? stableHeadingId(heading.id) : undefined,
    text: headingLabel(heading),
    level: headingLevel(heading) ?? 0,
  }
}

function sameHeading(a: HeadingFoldIdentity, b: HeadingFoldIdentity): boolean {
  return Boolean(
    (a.id && b.id && a.id === b.id) ||
      (a.text === b.text && a.level === b.level),
  )
}

function directLists(parent: Element): HTMLElement[] {
  return Array.from(parent.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.tagName === 'UL' || child.tagName === 'OL'),
  )
}

function directItems(list: Element): HTMLElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.tagName === 'LI',
  )
}

function listItemText(item: HTMLElement): string {
  const clone = item.cloneNode(true) as HTMLElement
  for (const nested of clone.querySelectorAll(':scope > ul, :scope > ol'))
    nested.remove()
  return clone.textContent?.trim() ?? ''
}

function listItemPath(
  surface: HTMLElement,
  item: HTMLElement,
): number[] | null {
  const lineage: HTMLElement[] = []
  let walk: HTMLElement | null = item
  while (walk?.tagName === 'LI') {
    lineage.unshift(walk)
    walk = walk.parentElement?.closest('li') ?? null
  }
  const rootList = lineage[0]?.parentElement
  if (!rootList || rootList.parentElement !== surface) return null
  const rootIndex = directLists(surface).indexOf(rootList)
  if (rootIndex < 0) return null
  const path = [rootIndex]
  for (const entry of lineage) {
    const parentList = entry.parentElement
    if (!parentList) return null
    const index = directItems(parentList).indexOf(entry)
    if (index < 0) return null
    path.push(index)
  }
  return path
}

function resolveListPath(
  surface: HTMLElement,
  path: readonly number[],
): HTMLElement | null {
  const root = directLists(surface)[path[0] ?? -1]
  if (!root) return null
  let list: HTMLElement = root
  let item: HTMLElement | undefined
  for (let index = 1; index < path.length; index++) {
    item = directItems(list)[path[index]]
    if (!item) return null
    if (index < path.length - 1) {
      list = directLists(item)[0]
      if (!list) return null
    }
  }
  return item ?? null
}

function clearFoldAttributes(surface: HTMLElement): void {
  for (const element of surface.querySelectorAll<HTMLElement>(
    `[${FOLD_HIDDEN_ATTR}], [${FOLDED_ATTR}], [${FOLDABLE_ATTR}], [${LIST_FOLDED_ATTR}], [${LIST_FOLDABLE_ATTR}]`,
  )) {
    element.removeAttribute(FOLD_HIDDEN_ATTR)
    element.removeAttribute(FOLDED_ATTR)
    element.removeAttribute(FOLDABLE_ATTR)
    element.removeAttribute(LIST_FOLDED_ATTR)
    element.removeAttribute(LIST_FOLDABLE_ATTR)
    delete element.dataset.vmdeFoldCount
  }
}

function cloneState(state: SectionFoldState): SectionFoldState {
  return {
    headings: state.headings.map((heading) => ({ ...heading })),
    lists: state.lists.map((list) => ({ ...list, path: [...list.path] })),
  }
}

function applyHeadingFolds(
  editor: HTMLElement,
  foldedHeadings: readonly HeadingFoldIdentity[],
): void {
  const blocks = topLevelBlocks(editor)
  for (const heading of blocks.filter(
    (block) => headingLevel(block) !== null,
  )) {
    const blockIndex = blocks.indexOf(heading)
    const range = sectionRangeForHeading(blocks, blockIndex)
    if (!range || range.end <= range.start + 1) continue
    heading.setAttribute(FOLDABLE_ATTR, '1')
    const identity = headingIdentity(heading)
    if (!foldedHeadings.some((folded) => sameHeading(folded, identity)))
      continue
    heading.setAttribute(FOLDED_ATTR, '1')
    heading.dataset.vmdeFoldCount = String(range.end - range.start - 1)
    for (let index = range.start + 1; index < range.end; index++)
      blocks[index]?.setAttribute(FOLD_HIDDEN_ATTR, '1')
  }
}

function applyListFolds(
  editor: HTMLElement,
  foldedLists: readonly ListFoldIdentity[],
): void {
  for (const item of editor.querySelectorAll<HTMLElement>('li')) {
    if (directLists(item)[0]) item.setAttribute(LIST_FOLDABLE_ATTR, '1')
  }
  for (const folded of foldedLists) {
    const item = resolveListPath(editor, folded.path)
    const nested = item ? directLists(item)[0] : undefined
    if (!item || !nested || listItemText(item) !== folded.text) continue
    item.setAttribute(LIST_FOLDED_ATTR, '1')
    item.dataset.vmdeFoldCount = String(item.querySelectorAll('li').length)
    nested.setAttribute(FOLD_HIDDEN_ATTR, '1')
  }
}

function headingOwnerForHidden(
  editor: HTMLElement,
  hidden: HTMLElement,
): HTMLElement | undefined {
  const previous = hidden.previousElementSibling
  if (previous?.matches(`[${FOLDED_ATTR}]`)) return previous as HTMLElement
  const blocks = topLevelBlocks(editor)
  const targetIndex = blocks.indexOf(hidden)
  return Array.from(
    editor.querySelectorAll<HTMLElement>(`[${FOLDED_ATTR}]`),
  ).find((heading) => {
    const range = sectionRangeForHeading(blocks, blocks.indexOf(heading))
    return !!range && targetIndex > range.start && targetIndex < range.end
  })
}

export function createSectionFoldController(
  vditor: Vditor,
  options: ControllerOptions = {},
): SectionFoldController {
  const stored = cloneState(options.initialState ?? { headings: [], lists: [] })
  let disposed = false
  let applying = false
  let frame = 0
  const surface = () => blockModeElement(vditor)

  const persist = () => options.persist?.(cloneState(stored))

  const apply = () => {
    if (disposed || applying) return
    const editor = surface()
    if (!editor) return
    applying = true
    try {
      clearFoldAttributes(editor)
      applyHeadingFolds(editor, stored.headings)
      applyListFolds(editor, stored.lists)
    } finally {
      applying = false
    }
  }

  const scheduleApply = () => {
    if (frame || disposed) return
    frame = requestAnimationFrame(() => {
      frame = 0
      apply()
    })
  }

  const observer = new MutationObserver(scheduleApply)
  const initialSurface = surface()
  if (initialSurface)
    observer.observe(initialSurface, { childList: true, subtree: true })

  const controller: SectionFoldController = {
    toggleHeading(headingIndex) {
      const editor = surface()
      if (!editor) return false
      const blocks = topLevelBlocks(editor)
      const heading = blocks.filter((block) => headingLevel(block) !== null)[
        headingIndex
      ]
      if (!heading) return false
      const blockIndex = blocks.indexOf(heading)
      const range = sectionRangeForHeading(blocks, blockIndex)
      if (!range || range.end <= range.start + 1) return false
      const identity = headingIdentity(heading)
      const existing = stored.headings.findIndex((folded) =>
        sameHeading(folded, identity),
      )
      if (existing >= 0) stored.headings.splice(existing, 1)
      else stored.headings.push(identity)
      apply()
      persist()
      return true
    },
    toggleListItem(item) {
      const editor = surface()
      if (!editor?.contains(item) || directLists(item).length === 0)
        return false
      const path = listItemPath(editor, item)
      if (!path) return false
      const text = listItemText(item)
      const existing = stored.lists.findIndex(
        (folded) =>
          folded.text === text && folded.path.join('.') === path.join('.'),
      )
      if (existing >= 0) stored.lists.splice(existing, 1)
      else stored.lists.push({ path, text })
      apply()
      persist()
      return true
    },
    toggleAt(node) {
      const editor = surface()
      if (!editor?.contains(node)) return false
      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement
      const item = element?.closest<HTMLElement>('li')
      if (item && directLists(item).length > 0)
        return controller.toggleListItem(item)
      const heading = element?.closest<HTMLElement>('h1, h2, h3, h4, h5, h6')
      if (!heading) return false
      const headings = topLevelBlocks(editor).filter(
        (block) => headingLevel(block) !== null,
      )
      return controller.toggleHeading(headings.indexOf(heading))
    },
    ensureBlockVisible(block) {
      const editor = surface()
      if (!editor?.contains(block)) return false
      const hidden = block.closest<HTMLElement>(`[${FOLD_HIDDEN_ATTR}]`)
      if (!hidden) return false
      const ownerHeading = headingOwnerForHidden(editor, hidden)
      const ownerList = hidden.parentElement?.closest<HTMLElement>(
        `[${LIST_FOLDED_ATTR}]`,
      )
      let changed = false
      if (ownerHeading) {
        const identity = headingIdentity(ownerHeading)
        stored.headings = stored.headings.filter(
          (folded) => !sameHeading(folded, identity),
        )
        changed = true
      }
      if (ownerList) {
        const path = listItemPath(editor, ownerList)
        if (path) {
          stored.lists = stored.lists.filter(
            (folded) => folded.path.join('.') !== path.join('.'),
          )
          changed = true
        }
      }
      if (changed) {
        apply()
        persist()
      }
      return changed
    },
    state: () => cloneState(stored),
    apply,
    dispose() {
      if (disposed) return
      disposed = true
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      const editor = surface()
      if (editor) clearFoldAttributes(editor)
    },
  }

  apply()
  return controller
}

let activeController: SectionFoldController | undefined

export function ensureFoldTargetVisible(block: Element): boolean {
  return activeController?.ensureBlockVisible(block) ?? false
}

export function toggleFoldAtCaret(): boolean {
  const selection = getSelection()
  const node = selection?.rangeCount ? selection.anchorNode : null
  return node ? (activeController?.toggleAt(node) ?? false) : false
}

export function installSectionFold(
  vditor: Vditor,
  initialState?: SectionFoldState,
  onPersist?: (state: SectionFoldState) => void,
): () => void {
  activeController?.dispose()
  const saved =
    initialState ??
    ((window.vscode?.getState?.() as Record<string, unknown> | undefined)?.[
      STATE_KEY
    ] as SectionFoldState | undefined)
  const persist = (state: SectionFoldState) => {
    const current =
      (window.vscode?.getState?.() as Record<string, unknown> | undefined) ?? {}
    window.vscode?.setState?.({ ...current, [STATE_KEY]: state })
    onPersist?.(state)
  }
  const controller = createSectionFoldController(vditor, {
    initialState: saved,
    persist,
  })
  activeController = controller
  const ensureVisible = (block: Element) => controller.ensureBlockVisible(block)
  ;(
    window as unknown as {
      __vmdeEnsureFoldTargetVisible?: (block: Element) => boolean
    }
  ).__vmdeEnsureFoldTargetVisible = ensureVisible

  let appFrame = 0
  const appObserver = new MutationObserver(() => {
    if (appFrame) return
    appFrame = requestAnimationFrame(() => {
      appFrame = 0
      controller.apply()
    })
  })
  const app = document.getElementById('app')
  if (app) appObserver.observe(app, { childList: true, subtree: true })

  const onClick = (event: MouseEvent) => {
    const editor = blockModeElement(vditor)
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!editor || !target || !editor.contains(target)) return
    const foldable = target.closest<HTMLElement>(
      `[${FOLDABLE_ATTR}], [${LIST_FOLDABLE_ATTR}]`,
    )
    if (!foldable || event.clientX > foldable.getBoundingClientRect().left + 10)
      return
    event.preventDefault()
    event.stopPropagation()
    controller.toggleAt(foldable)
  }
  const onSelectionChange = () => {
    const selection = getSelection()
    const node = selection?.rangeCount ? selection.anchorNode : null
    const element =
      node?.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement
    const hidden = element?.closest(`[${FOLD_HIDDEN_ATTR}]`)
    if (hidden) controller.ensureBlockVisible(hidden)
  }
  const onKeydown = (event: KeyboardEvent) => {
    if (guardComposition(event)) return
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      !event.altKey &&
      event.code === 'BracketLeft' &&
      toggleFoldAtCaret()
    ) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('keydown', onKeydown, true)
  return () => {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('selectionchange', onSelectionChange)
    document.removeEventListener('keydown', onKeydown, true)
    appObserver.disconnect()
    if (appFrame) cancelAnimationFrame(appFrame)
    controller.dispose()
    if (activeController === controller) activeController = undefined
    const win = window as unknown as {
      __vmdeEnsureFoldTargetVisible?: (block: Element) => boolean
    }
    if (win.__vmdeEnsureFoldTargetVisible === ensureVisible)
      delete win.__vmdeEnsureFoldTargetVisible
  }
}
