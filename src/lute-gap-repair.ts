// Task 370 — Lute rewrites whitespace around inline elements when it builds an editable DOM, so
// merely opening or switching modes changes the user's document. Two defects, one shape; the
// WYSIWYG one is below, the IR one further down.
//
// ## WYSIWYG: an invented space in front of glued inline code
//
// `Md2VditorDOM('a`b`')` returns `<p>a <code data-marker="`">​b</code>​</p>` — a LITERAL space
// between the text and the code element that the source never had. `VditorDOM2Md` then writes it
// back out, so merely switching IR → WYSIWYG turns `a`b`` into `a `b`` in the user's file. That is
// a content change, not a reflow: Lute renders `post-processing<code>` for one and
// `post-processing <code>` for the other. `Md2VditorIRDOM` has no such quirk — the IR path
// round-trips every construct we tested unchanged — and no Lute option toggles it (all 60-odd
// `Set*` flags probed, none moves it), so it has to be undone outside the Go code.
//
// The DOM can express BOTH forms: a ZWSP separator serializes back to `a`b``, a space to `a `b``.
// Only the md → DOM direction is lossy (it maps both sources onto the space form). So the repair is
// to put back the separator the SOURCE implies — and the source is available at every call site:
// `Md2VditorDOM` gets the markdown, `SpinVditorDOM`'s output is built from `VditorDOM2Md(input)`.
// `Md2HTML` of that markdown is the oracle: its inline code is a bare `<code>` and its gaps are
// faithful (verified across every .md in this repo — 784 files, 0 count mismatches, 0 regressions).
//
// We substitute a ZWSP rather than DELETING the space so the repair is length-preserving: the
// caret/offset arithmetic in wysiwyg-code-highlight.ts, caret-preserve.ts and the preview anchors
// all count that character, and a ZWSP keeps every text-node length identical (it is also the
// separator Lute itself emits before a leading code element, and `VditorDOM2Md` strips it).
//
// Pure string transforms, no DOM — the extension host (lute-host.ts, prerender overlay) and the
// webview (patchLuteGapRepair, via the setLute build patch) share this module.

const INLINE_CODE_TAG = '<code data-marker='
const ZWSP = '​'

/**
 * Per inline code span in `Md2HTML` output, in document order: does the SOURCE separate it from
 * what precedes it with whitespace? Inline code renders as a bare `<code>`; a fenced block renders
 * as `<pre><code…` (with or without a language class), which is what the `<pre>` test drops.
 * Whitespace, not "a space", because a soft line break is a separator too — removing one would
 * join two lines.
 */
export function inlineCodeGaps(md2html: string): boolean[] {
  const gaps: boolean[] = []
  for (
    let i = md2html.indexOf('<code>');
    i !== -1;
    i = md2html.indexOf('<code>', i + 1)
  ) {
    if (md2html.startsWith('<pre>', i - 5)) continue
    gaps.push(/\s/.test(md2html.charAt(i - 1)))
  }
  return gaps
}

/**
 * Replace every space Lute invented in front of an inline code element in `wysiwygHtml` with a
 * ZWSP, leaving the ones the source really has. `oracle` returns `Md2HTML` of the markdown this
 * HTML was rendered from; it is called LAZILY — a document with no space-before-inline-code (the
 * common keystroke) never pays for it. Bails out unchanged whenever the oracle can't be trusted,
 * including a code-span count mismatch, so the worst case is the un-repaired output we ship today.
 */
export function dropInsertedCodeGaps(
  wysiwygHtml: string,
  oracle: () => string | undefined,
): string {
  if (
    typeof wysiwygHtml !== 'string' ||
    !wysiwygHtml.includes(` ${INLINE_CODE_TAG}`)
  )
    return wysiwygHtml
  const positions: number[] = []
  for (
    let i = wysiwygHtml.indexOf(INLINE_CODE_TAG);
    i !== -1;
    i = wysiwygHtml.indexOf(INLINE_CODE_TAG, i + 1)
  ) {
    positions.push(i)
  }
  let source: string | undefined
  try {
    source = oracle()
  } catch {
    return wysiwygHtml
  }
  if (typeof source !== 'string') return wysiwygHtml
  const spaced = inlineCodeGaps(source)
  // Different counts mean the oracle and the render disagree about the document (a renderer we
  // don't know about, a sanitize pass, a future Lute). Repairing by index would then move the
  // WRONG space, so we do nothing at all.
  if (spaced.length !== positions.length) return wysiwygHtml
  let out = ''
  let cursor = 0
  for (let k = 0; k < positions.length; k++) {
    const p = positions[k]
    if (spaced[k] || wysiwygHtml.charAt(p - 1) !== ' ') continue
    out += `${wysiwygHtml.slice(cursor, p - 1)}${ZWSP}`
    cursor = p
  }
  return cursor === 0 ? wysiwygHtml : out + wysiwygHtml.slice(cursor)
}

// ---------------------------------------------------------------------------
// The IR half of the same family, found while fixing the above.
//
// Inside a TABLE CELL, `Md2VditorIRDOM` DELETES the whitespace in front of the cell's FIRST inline
// element — and not only inline code: `| a `b` |`, `| a **b** |`, `| a *b* |`, `| a [l](u) |`,
// `| a $x$ |`, `| a ~~s~~ |`, `| a ![i](u) |` all come back glued. Later elements in the same cell
// keep their space, and no other block type (paragraph, list, quote, heading) is affected. It is the
// exact mirror of the WYSIWYG defect — a deletion instead of an insertion — in the DEFAULT edit
// mode, and `SpinVditorIRDOM` re-deletes it on every keystroke.
//
// The IR DOM can hold the space (hand-put it back and `VditorIRDOM2Md` writes it out), so again only
// md → DOM is lossy, and again `Md2HTML` of the source is the oracle: cell-for-cell, whatever
// whitespace it has in front of a cell's first element is what the source had. Measured over every
// .md in this repo: 239 cells restored across 60 files, none moved away from its source.
// ---------------------------------------------------------------------------

// A cell whose leading text ends in a NON-space and is immediately followed by an opening tag —
// i.e. the shape a swallowed space leaves behind. `(?!\/)` skips a cell that is plain text (its
// next tag is the cell's own `</td>`), which is the common case and must not pay for the oracle.
const CELL_GAP_CANDIDATE = /<t[dh]\b[^>]*>[^<>]*[^<>\s]<(?!\/)/

/** For each table cell in `html`, where its content starts and the text before its first tag. */
function cellPrefixes(html: string): { start: number; prefix: string }[] {
  const out: { start: number; prefix: string }[] = []
  const open = /<t[dh]\b[^>]*>/g
  let m = open.exec(html)
  while (m) {
    const start = m.index + m[0].length
    const lt = html.indexOf('<', start)
    out.push({ start, prefix: lt === -1 ? '' : html.slice(start, lt) })
    m = open.exec(html)
  }
  return out
}

/**
 * Put back the whitespace Lute dropped in front of the first inline element of a table cell in
 * `irHtml`. `oracle` returns `Md2HTML` of the markdown this HTML was rendered from, and is called
 * LAZILY — a document with no candidate cell (most of them) never pays for it. Restores the SOURCE'S
 * whitespace verbatim, so a tab or a double space comes back as itself. Bails out unchanged on any
 * disagreement: a differing cell count, or a prefix that isn't the oracle's minus its trailing
 * whitespace — that last check is what pins the repair to the right character.
 */
export function restoreCellGaps(
  irHtml: string,
  oracle: () => string | undefined,
): string {
  if (typeof irHtml !== 'string' || !CELL_GAP_CANDIDATE.test(irHtml))
    return irHtml
  let source: string | undefined
  try {
    source = oracle()
  } catch {
    return irHtml
  }
  if (typeof source !== 'string') return irHtml
  const ir = cellPrefixes(irHtml)
  const want = cellPrefixes(source)
  if (!ir.length || ir.length !== want.length) return irHtml
  let out = ''
  let cursor = 0
  for (let k = 0; k < ir.length; k++) {
    if (want[k].prefix === ir[k].prefix) continue
    const ws = /\s+$/.exec(want[k].prefix)
    if (!ws || want[k].prefix.slice(0, -ws[0].length) !== ir[k].prefix) continue
    const at = ir[k].start + ir[k].prefix.length
    out += irHtml.slice(cursor, at) + ws[0]
    cursor = at
  }
  return cursor === 0 ? irHtml : out + irHtml.slice(cursor)
}

/** Call `fn` at most once and reuse its answer — one oracle render per repaired render. */
function once(fn: () => string | undefined): () => string | undefined {
  let called = false
  let value: string | undefined
  return () => {
    if (!called) {
      called = true
      try {
        value = fn()
      } catch {
        value = undefined
      }
    }
    return value
  }
}

/**
 * Both WYSIWYG repairs, in the order they have to run: the table cell loses its whitespace FIRST
 * (that trim is common to both modes — only the invented-space rule for inline code is not, which is
 * why a `| a `b` |` cell looks fine: it is trimmed and then re-spaced), then the invented space in
 * front of glued inline code is taken back out.
 *
 * Known residual, and the only one measured: `| a  `b` |` — TWO spaces before inline code inside a
 * table cell — collapses to one. Lute trims both and re-adds exactly one, so the cell repair sees a
 * space already there and leaves it alone rather than making every ordinary table pay for the oracle.
 */
export function repairWysiwygDom(
  html: string,
  oracle: () => string | undefined,
): string {
  const shared = once(oracle)
  return dropInsertedCodeGaps(restoreCellGaps(html, shared), shared)
}

interface LuteLike {
  Md2VditorDOM?(md: string): string
  SpinVditorDOM?(html: string): string
  Md2VditorIRDOM?(md: string): string
  SpinVditorIRDOM?(html: string): string
  VditorDOM2Md(html: string): string
  VditorIRDOM2Md(html: string): string
  Md2HTML(md: string): string
  __vmarkdGapRepair?: boolean
}

/**
 * Wrap the four Lute entry points that BUILD an editable DOM so none of them can smuggle a
 * whitespace change into the document. Installed from `setLute` (build patch) so it is in force for
 * the very first render — Vditor renders the initial value from `initUI`, before `options.after`.
 *
 * Each wrapper's oracle is `Md2HTML` of the markdown ITS output was built from: the argument for the
 * md → DOM pair, and `VditorDOM2Md`/`VditorIRDOM2Md` of the input for the spins (spin is md-mediated
 * — DOM → markdown → DOM — which is also why the WYSIWYG spin stays right when the keystroke CREATED
 * the code span, where matching against the input DOM would have nothing to match).
 *
 * Those readers are looked up on the instance at CALL time, not at wrap time, so they go through the
 * wrappers wiki-serialize.ts and wysiwyg-code-highlight.ts add later (chips → `[[source]]`, hljs
 * spans flattened). Those also run before us on the spin input; both are idempotent and neither adds
 * nor removes a character next to an inline element, so seeing the already-processed HTML changes
 * nothing here.
 */
export function patchLuteGapRepair(lute: LuteLike | undefined): void {
  if (!lute || lute.__vmarkdGapRepair) return
  lute.__vmarkdGapRepair = true
  const md2dom = lute.Md2VditorDOM?.bind(lute)
  if (md2dom) {
    lute.Md2VditorDOM = (md: string) =>
      repairWysiwygDom(md2dom(md), () => lute.Md2HTML(md))
  }
  const spin = lute.SpinVditorDOM?.bind(lute)
  if (spin) {
    lute.SpinVditorDOM = (html: string) =>
      repairWysiwygDom(spin(html), () => lute.Md2HTML(lute.VditorDOM2Md(html)))
  }
  const md2ir = lute.Md2VditorIRDOM?.bind(lute)
  if (md2ir) {
    lute.Md2VditorIRDOM = (md: string) =>
      restoreCellGaps(md2ir(md), () => lute.Md2HTML(md))
  }
  const spinIr = lute.SpinVditorIRDOM?.bind(lute)
  if (spinIr) {
    lute.SpinVditorIRDOM = (html: string) =>
      restoreCellGaps(spinIr(html), () =>
        lute.Md2HTML(lute.VditorIRDOM2Md(html)),
      )
  }
}
