import type Vditor from 'vditor'
import { innerVditor } from '../util/inner-vditor'
import { activeModeElement } from '../util/source-map'
import { logToHost } from '../util/webview-log'
import { ensureHoistTargetVisible } from './section-hoist'

// Flash the heading you click in the outline (task 13). Vditor's outline items
// carry `span[data-target-id]` = the heading element's id; after Vditor scrolls
// to it, we flash that heading. Mode-independent (IR/WYSIWYG/SV) — it resolves
// the heading by id, so there is no source-line mapping to get wrong.

export const FLASH_CLASS = 'heading-flash'
const SCROLL_SETTLE_MS = 60
const FLASH_DURATION_MS = 1400

export function setupOutlineFlash(vditor: Vditor): void {
  const outlineEl: HTMLElement | undefined = (vditor as any)?.vditor?.outline
    ?.element
  if (!outlineEl) {
    return
  }
  // Capture phase: Vditor's own outline handler (on the inner list) calls
  // stopPropagation() on item clicks, so a bubble-phase listener here would
  // never fire. Capture runs top-down before that, so we still see the click.
  outlineEl.addEventListener(
    'click',
    (e) => {
      const item = (e.target as HTMLElement | null)?.closest('[data-target-id]')
      const id = item?.getAttribute('data-target-id')
      if (!id) {
        return
      }
      const index = Array.from(
        outlineEl.querySelectorAll<HTMLElement>('[data-target-id]'),
      ).indexOf(item as HTMLElement)
      if (index >= 0) ensureHoistTargetVisible(index)
      // Let Vditor scroll first, then flash the heading it landed on.
      setTimeout(() => flashHeading(id), SCROLL_SETTLE_MS)
    },
    true,
  )
}

function flashElement(el: HTMLElement): void {
  el.classList.add(FLASH_CLASS)
  setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_DURATION_MS)
}

function flashHeading(id: string): void {
  const heading = document.getElementById(id)
  if (!heading) {
    return
  }
  flashElement(heading)
}

// Task 78's `scroll-to-heading` (Nth heading in doc order, class `h1-h6`), pulled out of
// message-router.ts's `handleScrollToHeading` so task 243 can reuse the EXACT same scroll+flash
// mechanism for anchor-link clicks — same-doc `#fragment` clicks resolve to an index (see
// src/heading-slug.ts's resolveFragment) and call this directly (no host round-trip); the host
// `scroll-to-heading` message (cross-doc `file.md#frag`, and the outline-tree reveal command)
// still goes through message-router's handler, which now just forwards here. ONE mechanism,
// two callers — not two mechanisms, per task 243's "reuse, don't duplicate" instruction.
export function scrollToHeadingIndex(
  vditor: Vditor,
  index: number,
  // Task 468 — message-router.ts's `scrollToHeadingWithRetry` polls this every 50ms while a
  // freshly-opened panel is still rendering its headings into the DOM. Without a way to skip the
  // trace line below, a worst-case give-up would emit ~40 near-identical Output-channel lines for
  // what's meant to be a rare edge case — `quiet` lets the retry loop log its own concise
  // summary (first attempt / success-after-N-ms / gave-up) instead. The single-call callers
  // (outline-tree click, same-doc `#fragment`) never pass this, so their logging is unchanged.
  quiet = false,
): boolean {
  // A heading outside the current hoist has no layout box. Clear the view scope before resolving
  // and scrolling so outline keyboard, host reveal and same-document anchors share one path.
  ensureHoistTargetVisible(index)
  // Task 458 — while the full Preview overlay is showing, Vditor's own `Outline.render()`
  // (vendored) generates the outline's ids from `preview.previewElement`'s headings, not the
  // (hidden) IR/WYSIWYG element `activeModeElement` returns — the vendor's own outline click
  // handler branches the same way (`vditor.preview.element.contains(contentElement)`). Without
  // this branch, activating an outline item by KEYBOARD while Preview is open would scroll+flash a
  // heading in the hidden edit pane instead of the visible preview — invisible to the user, and a
  // silent mismatch from what a mouse click on the same item does. Mirrors the vendor's condition
  // exactly, so it stays correct if that condition ever changes.
  //
  // Measured (task 458, real VS Code, `anchor-links.spec.ts` run both WITH and WITHOUT this
  // branch): entering `sv` split-view mode ALSO flips `preview.element.style.display` to `'block'`
  // (`setPreviewMode.ts`) — split-view's right pane literally IS `preview.previewElement`. That
  // looked like a risk of hijacking this branch for the pre-existing message-router/anchor-link
  // callers in the common sv case, not just the Preview-overlay edge case. It is NOT: `EditMode.ts`
  // (`setEditMode`) unconditionally resets `preview.element.style.display` to `'none'` on every
  // entry into `ir`/`wysiwyg` (the only modes anchor-links.spec.ts and message-router's callers
  // exercise) — so this branch is a no-op for both there. Confirmed in real VS Code:
  // `anchor-links.spec.ts` (untracked, owned by task 243) passes both with and without this branch
  // — team-lead ran it on today's tree, `--repeat-each=2 --retries=0`, 2/2 green both ways.
  const previewShown =
    innerVditor()?.preview?.element?.style.display === 'block'
  const el = previewShown
    ? innerVditor()?.preview?.previewElement
    : activeModeElement(vditor)
  const headings = el?.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const target = headings?.[index] as HTMLElement | undefined
  // Task 243 — a window-array diagnostic (real VS Code, since removed) proved a cross-doc
  // `scroll-to-heading` reaches here correctly: DOM already built, right index, right heading
  // matched by text, every time. Kept this one trace line (Output channel "VMDE", trace
  // level — house style, not console.log) as ongoing shipped diagnostics for the next time
  // something upstream of this function needs debugging. Skipped when `quiet` (see the param's
  // own comment) — the retry loop's own summary line covers that case instead.
  if (!quiet) {
    logToHost(
      `[scroll-to-heading] index=${index} activeModeElement=${!!el} headingCount=${
        headings ? headings.length : 'n/a'
      }`,
    )
  }
  if (!el || !target) return false
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  flashElement(target)
  return true
}
