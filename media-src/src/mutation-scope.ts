// Scope a MutationObserver batch down to the top-level block(s) it actually touched (task 173), and
// drop batches that are entirely OUR OWN injected decorations (task 174) — for the 3 synchronous,
// before-paint decorators (code-source.ts, callouts.ts, html-comment.ts). They used to ignore the
// MutationRecords and re-`querySelectorAll` the WHOLE editor on every keystroke; cost scaled with
// document size (#blockquotes / #code-blocks / #html-blocks), identical for prose and diagram-source
// editing. This module gives them O(changed block) instead, while staying synchronous (the no-flash
// contract — code-source.ts:14-16, callouts.ts:383-388 — forbids rAF-deferring these).
//
// PROVEN BY PROBE (media-src/src/mutation-scope.test.ts "outerHTML replace reports target = parent"):
// Vditor's per-keystroke spin (`ir/input.ts`) replaces a block via `blockElement.outerHTML = html`,
// which — per DOM spec — fires a childList record whose `target` is the block's PARENT, i.e. the
// SAME `ir.element` root the rare whole-editor rebuilds (`ir/input.ts:183`'s `isIRElement` innerHTML
// replace, `:205-231`'s link-ref-def/footnote relocation) also target. So `record.target === root`
// is NOT a reliable "this was a big structural change" signal — it fires on literally every normal
// edit too (verified empirically, not assumed). Scoping therefore keys off `addedNodes` (which top-
// level block RECEIVED the new content), never `record.target` for childList records.

const OWN_DECORATION_CLASSES = [
  'vmarkd-callout__preview', // callouts.ts syncPreview — IR/Preview dual-node render
  'vmarkd-callout__marker', // callouts.ts hideWysiwygMarker — hidden [!TYPE] marker span
  'vmarkd-callout__title', // callouts.ts syncWysiwygTitle — WYSIWYG title label
  'vmarkd-comment', // html-comment.ts — visible comment text (IR/WYSIWYG span, Preview div)
]

// `data-render="1"` tags EVERY box we inject as a decoration/overlay, never authored markdown
// content (edit-activity.ts keep-last overlay, diagram-error/loading/note, render-cache-client,
// native-offscreen, diagram-zoom button — see memory `ghost-span-not-lute-transparent`). We do NOT
// also match Vditor's own `data-render="2"` / bare `.vditor-ir__preview` here: that shell is created
// as part of a REAL block replace (nested inside a bigger addedNode, not a standalone top-level one
// in the common case) and is ambiguous enough that over-matching risks the exact failure task 173/174
// warn against (silently dropping a genuine content change) — under-filtering only costs an extra,
// cheap, idempotent no-op walk, which is the safe direction to err in.
function isOwnDecoration(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as Element
  if (el.hasAttribute('data-render')) return true
  return OWN_DECORATION_CLASSES.some((c) => el.classList.contains(c))
}

// Task 174: a childList record whose ENTIRE added+removed set is our own decoration nodes is a
// decoration WRITE, not a content change — skip it so it doesn't re-wake the fleet. Must check every
// node (never just `record.target`): the spin's real block replace nests a decoration (e.g. the
// preview shell) INSIDE a real content node, and that record must still pass.
function isOwnDecorationOnly(rec: MutationRecord): boolean {
  if (rec.type !== 'childList') return false
  const nodes = [...Array.from(rec.addedNodes), ...Array.from(rec.removedNodes)]
  return nodes.length > 0 && nodes.every(isOwnDecoration)
}

// The rendering root that owns block-level structure. Vditor sets this class DIRECTLY on
// `ir.element` / `wysiwyg.element` / `previewElement` (their own constructors — vditor's
// `ir/index.ts`, `wysiwyg/index.ts`, `preview/index.ts` — verified in node_modules source), so it's
// the true block-parent even for observers bound to a WIDER container: `#app` holds the IR and
// WYSIWYG mode elements as siblings (only one visible at a time), so it must be resolved PER MUTATED
// NODE, not once when the observer is installed (same pattern as Vditor's own `hasClosestBlock`,
// which climbs to `.vditor-reset` too).
function resetRoot(node: Node): HTMLElement | null {
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  while (el && !el.classList.contains('vditor-reset')) el = el.parentElement
  return el
}

// The top-level block (direct child of ITS `.vditor-reset` root) containing `node` — or `node`
// itself when it's already at that level. Null when `node` sits outside any reset root, or when
// `node` IS the reset root (a whole-root mutation — the caller widens to a full walk).
function topLevelBlockOf(node: Node): HTMLElement | null {
  const root = resetRoot(node)
  if (!root || node === root) return null
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  while (el?.parentElement && el.parentElement !== root) el = el.parentElement
  return el && el.parentElement === root ? el : null
}

export interface MutationScope {
  /** true → the caller should fall back to a full walk of the observed root. */
  full: boolean
  /** distinct top-level blocks to re-scan (meaningful only when `!full`; empty + `!full` means the
   *  whole batch was our own decorations — task 174 — so there is NOTHING to re-scan). */
  blocks: Set<Element>
}

// Above this many distinct top-level blocks, N separate scoped walks aren't meaningfully cheaper
// than one full walk — and this is exactly where the whole-editor rebuild paths (`ir/input.ts:183`
// isIRElement replace, `:205-231` link-ref-def/footnote relocation) naturally land (they touch most/
// all of root's children at once), so this threshold is what turns "full walk" from a special case
// into an emergent property of the general algorithm — see the module doc comment.
const FULL_WALK_BLOCK_THRESHOLD = 6

/**
 * Resolve a MutationObserver batch into the set of top-level blocks it touched, dropping records
 * that are entirely our own injected decorations (task 174) and widening to a full walk whenever the
 * touched set can't be bounded cheaply (task 173's safety net — see the module doc comment for why
 * `record.target` can't be used to detect the "big" cases). An EMPTY `records` array (the observer's
 * initial mount pass) always means "do a full walk" — there is nothing to scope from yet.
 */
export function scopeMutations(records: MutationRecord[]): MutationScope {
  if (records.length === 0) return { full: true, blocks: new Set() }

  const blocks = new Set<Element>()
  let full = false

  const addBlockFor = (node: Node): void => {
    const blk = topLevelBlockOf(node)
    if (blk) blocks.add(blk)
    else full = true // node outside any reset root, or IS the root — over-scope, never under-scope
  }

  for (const rec of records) {
    if (full) break
    if (isOwnDecorationOnly(rec)) continue // task 174: our own write, not a content change
    if (rec.type === 'characterData') {
      // No addedNodes on a characterData record — always resolve via its target (constraint: these
      // must always pass so a type-marker rewrite like `[!TIPs]` → `[!NOTE]` still re-decorates).
      addBlockFor(rec.target)
      continue
    }
    if (rec.addedNodes.length === 0) continue // pure removal — nothing NEW to (re-)decorate
    for (const n of Array.from(rec.addedNodes)) {
      if (n.nodeType !== Node.ELEMENT_NODE) continue // ignore stray text/comment noise
      addBlockFor(n)
      if (full) break
    }
  }

  if (full || blocks.size > FULL_WALK_BLOCK_THRESHOLD)
    return { full: true, blocks }
  return { full: false, blocks }
}

/** `root.querySelectorAll(selector)`, but ALSO matching `root` itself — a scoped top-level block can
 *  literally BE the thing a full-root walk was looking for (e.g. the block IS a `<blockquote>`, which
 *  `blockquote.querySelectorAll('blockquote')` would never find since querySelectorAll only searches
 *  descendants). Used by callouts.ts / html-comment.ts's scoped variants. */
export function queryIncludingSelf<E extends Element = Element>(
  root: Element,
  selector: string,
): E[] {
  const out: E[] = root.matches(selector) ? [root as unknown as E] : []
  out.push(...Array.from(root.querySelectorAll<E>(selector)))
  return out
}
