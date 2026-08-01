// Tasks 239 + 240 — two more places where Lute's md → editable-DOM direction throws information
// away, both of which the save path (`VditorIRDOM2Md`) then writes back to the user's file. Same
// shape as the whitespace defects in lute-gap-repair.ts, same remedy: the DOM CAN express the
// correct form, only the md → DOM mapping is lossy, so we put the missing form back before Vditor
// ever sees the HTML.
//
// ## 239: an indented (4-space) code block is downgraded to prose
//
// `Md2VditorIRDOM('para\n\n    code\n')` emits a `data-type="code-block"` div with NO open/close
// marker spans — unlike a ``` fence, which carries
// `<span data-type="code-block-open-marker">```</span>` + an info span + a close marker. Without
// them `VditorIRDOM2Md` writes the content out as a bare paragraph: the indent is gone, a re-parse
// gives prose, and the code block is destroyed. The first `SpinVditorIRDOM` (one keystroke anywhere)
// bakes that in by rebuilding the div as `<p>`. IR is the DEFAULT mode, so this hits every legacy /
// pandoc / email markdown that uses CommonMark indented code.
//
// The WYSIWYG path is already correct — it emits a fence — so the repair makes IR agree with it:
// inject the marker spans a fence would have had. The bytes on disk change (four spaces become a
// ``` fence) but nothing is LOST, and the rendered output is identical, which is the property the
// corpus test pins. Probed for false positives: raw `<pre>` HTML, `$$` math blocks, `~~~` fences and
// YAML front matter all keep their own markers, so a markerless code-block div is an indented block
// and nothing else.
//
// The fence has to be LONGER than the longest backtick run in the content, or an indented block that
// itself contains ``` re-parses as two fences with prose between them. (Lute's own WYSIWYG path gets
// this wrong — it hardcodes ``` and mangles that input; we do not copy the bug.)
//
// ## 240: reference-link definition titles are dropped, and leak into image alt text
//
// `Md2VditorIRDOM('[a][r]\n\n[r]: https://e.com "T"')` renders the definitions block as
// `[r]: https://e.com` — the title is simply not there, so the save writes the file back without it.
// For an IMAGE reference it is worse: the title is emitted as a `--title` marker span INSIDE the img
// node, where no title belongs (the inline source is `![alt][r]`, the title lives in the
// definition), and `VditorIRDOM2Md` serializes it as literal text: `![alt][r]"T"`.
//
// Both are repairable because the definitions block is verbatim TEXT — probed: put the title back in
// that div and `VditorIRDOM2Md` emits it. It does not survive a spin (spin is DOM → md → DOM and the
// md → DOM half strips it again), which is exactly why the spin entry points are wrapped too.
//
// Pure string transforms, no DOM — shared by the extension host (lute-host.ts) and the webview
// (patchLuteGapRepair, via the setLute build patch).

const CODE_BLOCK_DIV = /<div\b[^>]*\bdata-type="code-block"[^>]*>/g
const OPEN_MARKER = '<span data-type="code-block-open-marker">'
// Lute puts a ZWSP in the info span of a fence with no language; Vditor's caret logic walks it.
// Exported because lute-gap-repair.ts needs the same character and already imports from here —
// two independent literals of an invisible character are the kind that drift unnoticed.
export const ZWSP = '​'

/** The shortest backtick fence that cannot be closed early by the content itself (min 3). */
export function fenceFor(code: string): string {
  let longest = 0
  for (const run of code.match(/`+/g) ?? [])
    longest = Math.max(longest, run.length)
  return '`'.repeat(Math.max(3, longest + 1))
}

/**
 * Give every markerless IR code-block div the fence markers it needs to survive serialization.
 * A div that already has an open marker (every ``` / ~~~ fence) is left exactly as it was.
 */
export function fenceIndentedCode(irHtml: string): string {
  if (!irHtml.includes('data-type="code-block"')) return irHtml
  let out = ''
  let cursor = 0
  CODE_BLOCK_DIV.lastIndex = 0
  for (
    let m = CODE_BLOCK_DIV.exec(irHtml);
    m !== null;
    m = CODE_BLOCK_DIV.exec(irHtml)
  ) {
    const bodyStart = m.index + m[0].length
    if (irHtml.startsWith(OPEN_MARKER, bodyStart)) continue
    // The editable source pre is the div's first child; its <code> text is the block's content.
    const codeOpen = irHtml.indexOf('<code', bodyStart)
    const codeStart = codeOpen === -1 ? -1 : irHtml.indexOf('>', codeOpen) + 1
    const codeEnd = codeStart === -1 ? -1 : irHtml.indexOf('</code>', codeStart)
    const divEnd = irHtml.indexOf('</div>', bodyStart)
    if (codeEnd === -1 || divEnd === -1 || codeEnd > divEnd) continue
    const fence = fenceFor(irHtml.slice(codeStart, codeEnd))
    out += `${irHtml.slice(cursor, bodyStart)}${OPEN_MARKER}${fence}</span>`
    out += `<span class="vditor-ir__marker vditor-ir__marker--info" data-type="code-block-info">${ZWSP}</span>`
    out += `${irHtml.slice(bodyStart, divEnd)}<span data-type="code-block-close-marker">${fence}</span>`
    cursor = divEnd
  }
  return cursor === 0 ? irHtml : out + irHtml.slice(cursor)
}

const IMG_NODE = /<span class="vditor-ir__node" data-type="img">/g
const TITLE_MARKER =
  /<span class="vditor-ir__marker vditor-ir__marker--title">[^<]*<\/span>/

/**
 * Strip the title marker Lute injects into a REFERENCE image node (`![alt][r]`), where the inline
 * source carries no title at all. An inline image (`![alt](p.png "T")`) legitimately has one, and is
 * told apart by its `--paren` markers — the reference forms have none.
 */
export function dropRefImageTitleMarkers(irHtml: string): string {
  if (!irHtml.includes('vditor-ir__marker--title')) return irHtml
  let out = ''
  let cursor = 0
  IMG_NODE.lastIndex = 0
  for (let m = IMG_NODE.exec(irHtml); m !== null; m = IMG_NODE.exec(irHtml)) {
    const end = irHtml.indexOf('</span>', irHtml.indexOf('<img', m.index))
    if (end === -1) continue
    const node = irHtml.slice(m.index, end)
    if (node.includes('vditor-ir__marker--paren')) continue
    const title = TITLE_MARKER.exec(node)
    if (!title) continue
    out += irHtml.slice(cursor, m.index + title.index)
    cursor = m.index + title.index + title[0].length
  }
  return cursor === 0 ? irHtml : out + irHtml.slice(cursor)
}

// One-line link reference definition: `   [label]: destination "title"`. Titles may be quoted with
// ", ' or (parens). A definition whose title sits on the FOLLOWING line is legal CommonMark but not
// matched here — restoring it would mean rewriting a line the div does not contain, so it stays as
// it is today rather than being guessed at.
const DEF_LINE =
  /^ {0,3}\[([^\]]+)\]:[ \t]*(\S+)((?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?)[ \t]*$/
const DEFS_BLOCK = /<div\b[^>]*\bdata-type="link-ref-defs-block"[^>]*>/g

/** label (CommonMark-normalized) → the destination and title the SOURCE wrote. */
function sourceDefs(md: string): Map<string, { dest: string; title: string }> {
  const defs = new Map<string, { dest: string; title: string }>()
  for (const line of md.split('\n')) {
    const m = DEF_LINE.exec(line)
    if (!m?.[3]) continue
    const key = m[1].trim().replace(/\s+/g, ' ').toLowerCase()
    if (!defs.has(key))
      defs.set(key, { dest: m[2], title: m[3].replace(/^[ \t]+/, ' ') })
  }
  return defs
}

/**
 * Put the titles back into the link-reference definitions block, taking them from the source.
 *
 * Deliberately conservative: a source definition is only substituted when the emitted line is
 * exactly that definition MINUS its title, so the repair can only ever ADD a title back and can
 * never rewrite a destination Lute normalized on purpose (e.g. `<url>` losing its angle brackets —
 * a separate, non-destructive difference that is not this task's).
 */
export function restoreRefDefTitles(
  html: string,
  sourceMd: () => string | undefined,
): string {
  if (!html.includes('data-type="link-ref-defs-block"')) return html
  const md = sourceMd()
  if (md === undefined || !md.includes(']:')) return html
  const defs = sourceDefs(md)
  if (defs.size === 0) return html
  let out = ''
  let cursor = 0
  DEFS_BLOCK.lastIndex = 0
  for (let m = DEFS_BLOCK.exec(html); m !== null; m = DEFS_BLOCK.exec(html)) {
    const bodyStart = m.index + m[0].length
    const bodyEnd = html.indexOf('</div>', bodyStart)
    if (bodyEnd === -1) continue
    const body = html.slice(bodyStart, bodyEnd)
    const repaired = body
      .split('\n')
      .map((line) => {
        const label = /^\[([^\]]+)\]:/.exec(line)
        if (!label) return line
        const def = defs.get(label[1].trim().replace(/\s+/g, ' ').toLowerCase())
        if (!def) return line
        // Rebuilt with the EMITTED label so the guard tests the destination only — the label
        // already matched by its normalized form, and Lute keeps whatever case the source used.
        const bare = `[${label[1]}]: ${def.dest}`
        return bare === line ? bare + def.title : line
      })
      .join('\n')
    if (repaired === body) continue
    out += html.slice(cursor, bodyStart) + repaired
    cursor = bodyEnd
  }
  return cursor === 0 ? html : out + html.slice(cursor)
}

// ---------------------------------------------------------------------------
// The SPLIT (sv) share of 240 — same two defects, a completely different DOM.
//
// sv is a SOURCE view: `getMarkdown` returns `sv.element.textContent` verbatim (Vditor's
// markdown/getMarkdown.ts), so whatever text the spans hold IS the saved file — there is no
// `VditorSVDOM2Md`. Probed, `Md2VditorSVDOM` drops a definition title exactly as the IR path does
// (`[r]: u "T"` renders as `[r]: u`, all three quote styles) and leaks an image-reference title into
// the body exactly as the IR path does (`![a][r]"T"`), so split mode re-dropped what IR and WYSIWYG
// now preserve — caught by mode-roundtrip's `ir → wysiwyg → sv → ir` byte-stability assertion.
//
// The shapes differ enough that the IR repairs cannot be reused: the IR definitions block is one
// div of verbatim text (line-splittable), the sv one is a span soup —
// `<span --bracket>[</span><span --link data-type="link-ref-defs-block">LABEL</span>` +
// `<span --bracket>]</span><span>: </span>DEST` with DEST a bare text node up to the next tag.
//
// NOTE for the next reader: `SpinVditorSVDOM` takes MARKDOWN, not HTML — unlike `SpinVditorIRDOM` /
// `SpinVditorDOM`. Vditor calls it with `blockElement.textContent` (sv/process.ts) or the whole
// document's markdown (toolbar/EditMode.ts). Probed: `SpinVditorSVDOM(md) === Md2VditorSVDOM(md)`,
// so one repair with the argument as its own source oracle serves both entry points, and the
// per-block spin is safe — a block with no definition in it simply finds nothing to restore.

const SV_TITLE_MARKER =
  /<span class="vditor-sv__marker--title">[\s\S]*?<\/span>/g
const SV_CLOSING_PAREN = '<span class="vditor-sv__marker--paren">)</span>'

/**
 * Drop the title marker sv injects after a REFERENCE image (`![a][r]`, `![a][]`, `![a]`), where the
 * inline source carries no title — it is the definition's, and emitting it here writes it into the
 * body text as literal garbage.
 *
 * A title is only ever expressible inline INSIDE a link/image paren form, and sv closes that form
 * with a `--paren` span immediately after the title (probed for `![a](p.png "T")`, `[a](u "T")` and
 * `[a](<u v> "T")`). So a title marker not followed by that closing paren is not part of any
 * `(…)` construct, and is the leak.
 */
export function dropSvRefTitleMarkers(svHtml: string): string {
  if (!svHtml.includes('vditor-sv__marker--title')) return svHtml
  let out = ''
  let cursor = 0
  SV_TITLE_MARKER.lastIndex = 0
  for (
    let m = SV_TITLE_MARKER.exec(svHtml);
    m !== null;
    m = SV_TITLE_MARKER.exec(svHtml)
  ) {
    const end = m.index + m[0].length
    if (svHtml.startsWith(SV_CLOSING_PAREN, end)) continue
    out += svHtml.slice(cursor, m.index)
    cursor = end
  }
  return cursor === 0 ? svHtml : out + svHtml.slice(cursor)
}

const SV_DEF =
  /<span class="vditor-sv__marker--link" data-type="link-ref-defs-block">([^<]*)<\/span><span class="vditor-sv__marker--bracket">\]<\/span><span>: <\/span>([^<]*)/g

/** Escape content we inject into a span, so a title holding `&` or `<` stays that text. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Put the titles back into sv's link-reference definitions, taking them from the source.
 *
 * Guarded exactly as the IR repair is: the emitted destination must equal the source definition's
 * verbatim, so this can only ever ADD a title back and can never rewrite a destination sv normalized
 * on purpose (an `<angle bracket>` dest loses its brackets — a separate, non-destructive difference).
 * The title goes in its own `--title` span with the space as bare text between, mirroring the shape
 * sv gives an inline title, so the source view colours it the same way.
 */
export function restoreSvRefDefTitles(
  svHtml: string,
  sourceMd: () => string | undefined,
): string {
  if (!svHtml.includes('data-type="link-ref-defs-block"')) return svHtml
  const md = sourceMd()
  if (md === undefined || !md.includes(']:')) return svHtml
  const defs = sourceDefs(md)
  if (defs.size === 0) return svHtml
  let out = ''
  let cursor = 0
  SV_DEF.lastIndex = 0
  for (let m = SV_DEF.exec(svHtml); m !== null; m = SV_DEF.exec(svHtml)) {
    const def = defs.get(m[1].trim().replace(/\s+/g, ' ').toLowerCase())
    if (!def || def.dest !== m[2]) continue
    // `def.title` is normalized to a single leading space by `sourceDefs`; that space is bare text
    // between the spans, the quoted part is the span's content.
    const end = m.index + m[0].length
    out += `${svHtml.slice(cursor, end)} <span class="vditor-sv__marker--title">${escapeHtml(def.title.slice(1))}</span>`
    cursor = end
  }
  return cursor === 0 ? svHtml : out + svHtml.slice(cursor)
}

// sv's share of 239. It already fences an indented block (so the block survives, unlike IR before
// this task) — but it HARDCODES ```, exactly the bug Lute's WYSIWYG path had. An indented block whose
// content holds its own fence comes back as
// "```\n```\ninner\n```\n```", which re-parses as an empty code block, prose, and another empty code
// block: the content is destroyed. Probed on `test/vscode-e2e/fixtures/block-fidelity.md`.
//
// The two shapes are told apart cleanly. A REAL fence puts its info span on the open line
// (`<open>```</open><info>ts</info>`) and closes with a `code-block-close-marker`. An INDENTED block
// has no info span after the open marker and closes with a `code-block-info` span holding the fence
// — so an open marker not followed by an info span is an indented block, and nothing else.
//
// Only the marker TEXT is rewritten, never the span structure: sv's markdown is `textContent`, so
// the text is the whole fix, and leaving `data-type` alone keeps Vditor's caret logic on ground it
// knows.
const SV_CODE_OPEN =
  /<span data-type="code-block-open-marker" class="vditor-sv__marker">(`+)<\/span>/g
const SV_CODE_INFO =
  '<span class="vditor-sv__marker--info" data-type="code-block-info">'

/** Size the fence of an sv indented code block to its content, so the content cannot close it. */
function fenceSvIndentedCode(svHtml: string): string {
  if (!svHtml.includes('code-block-open-marker')) return svHtml
  let out = ''
  let cursor = 0
  SV_CODE_OPEN.lastIndex = 0
  for (
    let m = SV_CODE_OPEN.exec(svHtml);
    m !== null;
    m = SV_CODE_OPEN.exec(svHtml)
  ) {
    const afterOpen = m.index + m[0].length
    if (svHtml.startsWith(SV_CODE_INFO, afterOpen)) continue // a real fence, with its language
    // An indented block closes with the info span — the first one after the open marker is its own.
    const closeStart = svHtml.indexOf(SV_CODE_INFO, afterOpen)
    if (closeStart === -1) continue
    const closeTextStart = closeStart + SV_CODE_INFO.length
    const closeEnd = svHtml.indexOf('</span>', closeTextStart)
    if (closeEnd === -1) continue
    // Backticks appear as literal text in the content spans, so tag-stripping is enough to find the
    // longest run the fence has to outgrow.
    const content = svHtml.slice(afterOpen, closeStart).replace(/<[^>]*>/g, '')
    const fence = fenceFor(content)
    if (fence === m[1] && fence === svHtml.slice(closeTextStart, closeEnd))
      continue
    out += `${svHtml.slice(cursor, m.index)}<span data-type="code-block-open-marker" class="vditor-sv__marker">${fence}</span>`
    out += `${svHtml.slice(afterOpen, closeTextStart)}${fence}`
    cursor = closeEnd
  }
  return cursor === 0 ? svHtml : out + svHtml.slice(cursor)
}

/** Every block-level sv repair, in one pass over the source view Lute just built. */
export function repairSvBlocks(
  svHtml: string,
  sourceMd: () => string | undefined,
): string {
  return restoreSvRefDefTitles(
    dropSvRefTitleMarkers(fenceSvIndentedCode(svHtml)),
    sourceMd,
  )
}

const WYSIWYG_CODE_DIV =
  /<div class="vditor-wysiwyg__block" data-type="code-block"[^>]*\bdata-marker="([^"]*)"/g

/**
 * The WYSIWYG half of 239. `Md2VditorDOM` fences indented code — but when the content itself holds a
 * ``` run it writes the CONTENT into `data-marker` instead of a fence, and `VditorDOM2Md` then emits
 * that as the opening delimiter: one block becomes three and the code is destroyed. Recompute the
 * marker whenever it is not a delimiter run, or is a backtick fence the content can close early.
 */
export function normalizeWysiwygFenceMarker(html: string): string {
  if (!html.includes('vditor-wysiwyg__block')) return html
  let out = ''
  let cursor = 0
  WYSIWYG_CODE_DIV.lastIndex = 0
  for (
    let m = WYSIWYG_CODE_DIV.exec(html);
    m !== null;
    m = WYSIWYG_CODE_DIV.exec(html)
  ) {
    const marker = m[1]
    if (/^~+$/.test(marker)) continue
    // The block's own content — read forward from THIS match, never from the first one.
    const codeOpen = html.indexOf('<code', m.index + m[0].length)
    const codeStart = codeOpen === -1 ? -1 : html.indexOf('>', codeOpen) + 1
    const codeEnd = codeStart === -1 ? -1 : html.indexOf('</code>', codeStart)
    if (codeEnd === -1) continue
    const needed = fenceFor(html.slice(codeStart, codeEnd))
    if (/^`+$/.test(marker) && marker.length >= needed.length) continue
    const attr = m[0].lastIndexOf(`data-marker="`)
    out += `${html.slice(cursor, m.index + attr)}data-marker="${needed}"`
    cursor = m.index + m[0].length
  }
  return cursor === 0 ? html : out + html.slice(cursor)
}

/** Every block-level IR repair, in one pass over the DOM Lute just built. */
export function repairIrBlocks(
  irHtml: string,
  sourceMd: () => string | undefined,
): string {
  return restoreRefDefTitles(
    dropRefImageTitleMarkers(fenceIndentedCode(irHtml)),
    sourceMd,
  )
}

/**
 * The WYSIWYG share of the same defects: it does not leak the image title, but it drops the
 * definition titles exactly as IR does and mis-fences an indented block containing backticks.
 */
export function repairWysiwygBlocks(
  html: string,
  sourceMd: () => string | undefined,
): string {
  return restoreRefDefTitles(normalizeWysiwygFenceMarker(html), sourceMd)
}
