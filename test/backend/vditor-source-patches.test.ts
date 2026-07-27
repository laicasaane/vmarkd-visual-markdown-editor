import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  patchDmpInterop,
  patchIrLinkClick,
  patchWysiwygLinkClick,
  patchWysiwygCodeClickCaret,
  patchListToggle,
  patchOutlineCurrent,
  patchMathRender,
  patchProcessCode,
  patchIrInputSerialize,
  patchIrDeferDiagramRender,
  patchIrSpaceSerialize,
  patchDeferRenderToc,
  patchIrStripPreviewSpin,
  patchIrFenceSpinSkip,
  patchDeferGetMarkdown,
  patchInfoDialog,
  patchPreviewCopyClipboardData,
  patchPreviewCopyTip,
  patchPreviewMorph,
  patchCodeRenderSkipDiagram,
  patchIrBlurExpand,
  patchSetContentTheme,
  patchCalloutArrowNav,
  patchMarkmapStatic,
  patchGraphvizRender,
  patchHighlightSkipDiagrams,
  patchHighlightLanguageClass,
  patchPreviewComments,
  patchFlowchartTheme,
  patchPlantumlRender,
  patchAbcRender,
  patchMindmapThemeColors,
  patchEchartsThemeInit,
  patchMermaidVersion,
  patchEchartsVersion,
  patchSmilesVersion,
  patchMermaidErrorRender,
  patchFlowchartError,
  patchEchartsErrorBox,
  patchMindmapErrorBox,
} from '../../media-src/esbuild-shared.mjs'

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const irSource = read('../../media-src/node_modules/vditor/src/ts/ir/index.ts')
const undoSource = read(
  '../../media-src/node_modules/vditor/src/ts/undo/index.ts',
)
const fixBrowserSource = read(
  '../../media-src/node_modules/vditor/src/ts/util/fixBrowserBehavior.ts',
)
const mathSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/mathRender.ts',
)
const wysiwygSource = read(
  '../../media-src/node_modules/vditor/src/ts/wysiwyg/index.ts',
)
const processCodeSource = read(
  '../../media-src/node_modules/vditor/src/ts/util/processCode.ts',
)
const outlineSource = read(
  '../../media-src/node_modules/vditor/src/ts/toolbar/Outline.ts',
)
const irProcessSource = read(
  '../../media-src/node_modules/vditor/src/ts/ir/process.ts',
)
const irInputSource = read(
  '../../media-src/node_modules/vditor/src/ts/ir/input.ts',
)
const afterRenderEventSource = read(
  '../../media-src/node_modules/vditor/src/ts/wysiwyg/afterRenderEvent.ts',
)
const svProcessSource = read(
  '../../media-src/node_modules/vditor/src/ts/sv/process.ts',
)
const infoSource = read(
  '../../media-src/node_modules/vditor/src/ts/toolbar/Info.ts',
)
const mermaidRenderSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/mermaidRender.ts',
)
// Reading this path also guards against a file rename: if Vditor moves
// preview/index.ts, this readFileSync throws at load and the suite fails loudly —
// the esbuild onLoad filter would otherwise silently skip the patch (no build error).
const previewSource = read(
  '../../media-src/node_modules/vditor/src/ts/preview/index.ts',
)
const editorCommonEventSource = read(
  '../../media-src/node_modules/vditor/src/ts/util/editorCommonEvent.ts',
)
const setContentThemeSource = read(
  '../../media-src/node_modules/vditor/src/ts/ui/setContentTheme.ts',
)
const chartSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/chartRender.ts',
)
const markmapSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/markmapRender.ts',
)
const graphvizSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/graphvizRender.ts',
)
const flowchartSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/flowchartRender.ts',
)
const mindmapSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/mindmapRender.ts',
)
const plantumlSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/plantumlRender.ts',
)
const abcSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/abcRender.ts',
)

// The unguarded link-open condition Vditor ships — plain click follows the link.
const UNGATED =
  'if (aElement && (!aElement.classList.contains("vditor-ir__node--expand"))) {'

describe('patchIrLinkClick (task 62)', () => {
  // Confirms the behaviour exists in the code we actually ship today: a plain
  // (no-modifier) click on an IR link enters the open branch.
  it('the shipped Vditor IR source opens links on a plain click (pre-patch)', () => {
    expect(irSource).toContain(UNGATED)
    expect(irSource).toContain(
      'window.open(aElement.querySelector(":scope > .vditor-ir__marker--link").textContent);',
    )
  })

  it('gates the open branch behind the runtime link-open policy', () => {
    const patched = patchIrLinkClick(irSource)
    expect(patched).not.toContain(UNGATED)
    expect(patched).toContain('window.__vmarkdShouldOpenLink(event)')
    // The marker still feeds link.click/window.open inside the now-gated block.
    expect(patched).toContain(
      'window.open(aElement.querySelector(":scope > .vditor-ir__marker--link").textContent);',
    )
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchIrLinkClick('// unrelated source')).toThrow(
      /fixIrLinkClick/,
    )
  })

  it('is idempotent-safe: re-running on patched output does not double-gate', () => {
    const once = patchIrLinkClick(irSource)
    // The original anchor is gone after patching, so a second run must throw
    // rather than silently patch again.
    expect(() => patchIrLinkClick(once)).toThrow(/fixIrLinkClick/)
  })
})

describe('patchWysiwygLinkClick (task 62)', () => {
  const WYSIWYG_UNGATED =
    'const a = hasClosestByMatchTag(event.target, "A");\n            if (a) {'

  it('the shipped Vditor WYSIWYG source opens links on a plain click (pre-patch)', () => {
    expect(wysiwygSource).toContain(WYSIWYG_UNGATED)
  })

  it('gates the WYSIWYG open branch behind the runtime link-open policy', () => {
    const patched = patchWysiwygLinkClick(wysiwygSource)
    expect(patched).not.toContain(WYSIWYG_UNGATED)
    expect(patched).toContain(
      'if (a && (window.__vmarkdShouldOpenLink ? window.__vmarkdShouldOpenLink(event) : true)) {',
    )
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchWysiwygLinkClick('// unrelated source')).toThrow(
      /fixWysiwygLinkClick/,
    )
  })
})

describe('patchWysiwygCodeClickCaret (click lands caret at the clicked line)', () => {
  const CLICK_ANCHOR =
    'if (previewElement) {\n                showCode(previewElement, vditor);\n            }'

  it('the shipped Vditor WYSIWYG source collapses the caret to the block start (pre-patch)', () => {
    expect(wysiwygSource).toContain(CLICK_ANCHOR)
  })

  it('injects a caretRangeFromPoint reposition after showCode in the click handler', () => {
    const patched = patchWysiwygCodeClickCaret(wysiwygSource)
    expect(patched).toContain('caretRangeFromPoint')
    expect(patched).toContain('data-type") === "code-block"')
    // still calls showCode (we reposition AFTER it, falling back to its start)
    expect(patched).toContain('showCode(previewElement, vditor);')
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchWysiwygCodeClickCaret('// unrelated source')).toThrow(
      /fixWysiwygCodeClickCaret/,
    )
  })
})

describe('patchCalloutArrowNav (callout dual-node arrow navigation)', () => {
  it('the shipped Vditor source checks last-line against raw textContent and splices only TABLE/data-type (pre-patch)', () => {
    expect(fixBrowserSource).toContain(
      'element.textContent.trimRight().substr(position.start).indexOf("\\n") === -1',
    )
    expect(fixBrowserSource).toContain(
      '(nextElement && (nextElement.tagName === "TABLE" || nextElement.getAttribute("data-type")))',
    )
    expect(fixBrowserSource).toContain(
      '(previousElement && (previousElement.tagName === "TABLE" || previousElement.getAttribute("data-type")))',
    )
  })

  it('compares the EDITABLE text (callout preview stripped) and splices for data-callout neighbours', () => {
    const patched = patchCalloutArrowNav(fixBrowserSource)
    // last-line / at-end checks use the preview-stripped text
    expect(patched).toContain(
      'vmarkdEditableText(element).trimRight().substr(position.start).indexOf("\\n") === -1',
    )
    expect(patched).toContain(
      'position.start >= vmarkdEditableText(element).trimRight().length',
    )
    // the helper is injected before insertAfterBlock
    expect(patched).toContain('const vmarkdEditableText = ')
    // both splice sets gain data-callout; TABLE/data-type behaviour preserved
    expect(patched).toContain(
      'nextElement.getAttribute("data-type") || nextElement.hasAttribute("data-callout")',
    )
    expect(patched).toContain(
      'previousElement.getAttribute("data-type") || previousElement.hasAttribute("data-callout")',
    )
    // …and a contenteditable=false neighbour (our #fix-table-ir-wrapper panel) is a splice
    // boundary too — Vditor inserts a paragraph instead of dropping the caret into the panel
    // (which is pinned at top:0 → the end-of-file "jump to top").
    expect(patched).toContain(
      'nextElement.getAttribute("contenteditable") === "false"',
    )
    expect(patched).toContain(
      'previousElement.getAttribute("contenteditable") === "false"',
    )
  })

  it('throws (fails the build loudly) if any anchor is gone — version-bump guard', () => {
    expect(() => patchCalloutArrowNav('// unrelated source')).toThrow(
      /fixCalloutArrowNav/,
    )
  })
})

describe('patchListToggle (task 56 — null-deref crash fix)', () => {
  // Confirms the crashing call ships today: in listToggle's uncheck branch the
  // guard checks only the clicked <li> for an <input>, then iterates ALL sibling
  // <li>; a sibling without a checkbox throws on `.remove()` of null.
  it('the shipped Vditor source removes an <input> without optional chaining (pre-patch)', () => {
    expect(fixBrowserSource).toContain('item.querySelector("input").remove()')
  })

  it('adds optional chaining so a checkbox-less sibling no longer crashes the toggle', () => {
    const patched = patchListToggle(fixBrowserSource)
    expect(patched).not.toContain('item.querySelector("input").remove()')
    expect(patched).toContain('item.querySelector("input")?.remove()')
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchListToggle('// unrelated source')).toThrow(
      /fixListToggle/,
    )
  })
})

describe('patchEchartsThemeInit (chart theme + no entry animation)', () => {
  it('routes init through the theme resolver and forces animation:false on the chart setOption', () => {
    const patched = patchEchartsThemeInit(chartSource)
    expect(patched).toContain('window.__vmarkdEchartsResolve')
    // chart entry animation disabled ("przy włączaniu") — forced over the user option
    expect(patched).toContain(
      '.setOption(Object.assign({}, option, { animation: false }))',
    )
    expect(patched).not.toContain('.setOption(option)')
  })
})

describe('patchMindmapThemeColors (mindmap follows the content theme)', () => {
  it('Vditor ships hardcoded GitHub-light colours in the tree setOption', () => {
    expect(mindmapSource).toContain('color: "#4285f4"')
    expect(mindmapSource).toContain('backgroundColor: "#f6f8fa"')
    expect(mindmapSource).toContain('color: "#586069"')
    expect(mindmapSource).toContain('color: "#d1d5da"')
  })

  it('drives the tree node/label/line colours from the resolved theme (window.__vmarkdMindmapStyle)', () => {
    const patched = patchMindmapThemeColors(mindmapSource)
    // ECharts' `tree` ignores the registered theme palette, so the colours are set EXPLICITLY
    // from the resolved theme each render — not stripped (stripping left the nodes default grey).
    expect(patched).toContain('window.__vmarkdMindmapStyle.node')
    expect(patched).toContain('window.__vmarkdMindmapStyle.label')
    expect(patched).toContain('window.__vmarkdMindmapStyle.labelBg')
    expect(patched).toContain('window.__vmarkdMindmapStyle.labelBorder')
    expect(patched).toContain('window.__vmarkdMindmapStyle.line')
    // Vditor's GitHub-light colours survive only as the no-resolver fallback (bare harness).
    expect(patched).toContain(
      'window.__vmarkdMindmapStyle ? window.__vmarkdMindmapStyle.node : "#4285f4"',
    )
    // geometry is kept
    expect(patched).toContain('borderRadius: 5')
    expect(patched).toContain('position: "insideRight"')
    expect(patched).toContain('width: 1')
    // We do NOT touch the entry animation here (ECharts tree gates entry + collapse on one flag —
    // animation:false breaks collapse; animationDuration:0 doesn't suppress entry). So no anim patch.
    expect(patched).not.toContain('animation: false')
  })

  it('throws (fails the build loudly) if the colour block is gone — version-bump guard', () => {
    expect(() => patchMindmapThemeColors('// unrelated source')).toThrow(
      /fixMindmapTheme/,
    )
  })
})

describe('patchMarkmapStatic (markmap wheel/zoom hijack)', () => {
  it('marks the render div data-processed (task 189 — adapter re-entry accumulated duplicates)', () => {
    const src = read(
      '../../media-src/node_modules/vditor/src/ts/markdown/markmapRender.ts',
    )
    const patched = patchMarkmapStatic(src, '0.18.12')
    expect(patched).toContain('render.setAttribute("data-processed", "true")')
  })

  it('Vditor ships the interactive create + plain setData (no options)', () => {
    expect(markmapSource).toContain('const mm = Markmap.create(svg, null);')
    expect(markmapSource).toContain('mm.setData(root, frontmatterOptions)')
  })

  it('overrides the d3-zoom filter to Ctrl-gate, keeps duration:0 at create AND forces duration:0 into setData (no init animation)', () => {
    const patched = patchMarkmapStatic(markmapSource, '0.18.12')
    expect(patched).toContain(
      'const mm = Markmap.create(svg, { duration: 0, fitRatio: 0.80, autoFit: true });',
    )
    expect(patched).toContain('mm.zoom.filter((e) => e.ctrlKey && !e.button)')
    // fold/unfold gated on Ctrl — plain click enters edit mode
    expect(patched).toContain('if (e.ctrlKey) _origClick(e, d)')
    expect(patched).toContain('svg.__vmarkdMm = mm')
    expect(patched).toContain(
      'mm.setData(root, Object.assign({}, frontmatterOptions, { duration: 0, fitRatio: 0.80 }))',
    )
    expect(patched).not.toContain('const mm = Markmap.create(svg, null);')
    expect(patched).not.toContain('mm.setData(root, frontmatterOptions)')
  })

  it('injects ?v= cache-buster on the markmap script load', () => {
    const patched = patchMarkmapStatic(markmapSource, '0.18.12')
    expect(patched).toContain('markmap.min.js?v=0.18.12')
    expect(patched).not.toContain('markmap.min.js`, "vditorMarkerScript"')
  })

  it('skips ?v= when no version is provided', () => {
    const patched = patchMarkmapStatic(markmapSource)
    expect(patched).toContain('markmap.min.js`, "vditorMarkerScript"')
  })

  it('throws (fails the build loudly) if a markmap anchor is gone — version-bump guard', () => {
    expect(() => patchMarkmapStatic('// unrelated source')).toThrow(
      /fixMarkmapStatic/,
    )
    expect(() =>
      patchMarkmapStatic('const mm = Markmap.create(svg, null); // no setData'),
    ).toThrow(/fixMarkmapStatic/)
  })
})

describe('patchGraphvizRender (shared viz-global.js + theme)', () => {
  it('the shipped Vditor source loads the old graphviz/viz.js (pre-patch)', () => {
    expect(graphvizSource).toContain('dist/js/graphviz/viz.js')
  })

  // Task 144 item 1: the patch is now a thin shim that re-exports graphvizRender from the real,
  // typed, unit-tested module (media-src/src/graphviz-render.ts) — the render + theming logic lives
  // there (covered by graphviz-render.test.ts), NOT in this string any more.
  it('re-exports graphvizRender from the extracted module + drops the old graphviz/viz.js path', () => {
    const patched = patchGraphvizRender(graphvizSource)
    expect(patched).toContain('graphviz-render')
    expect(patched).toContain('export const graphvizRender')
    expect(patched).not.toContain('dist/js/graphviz/viz.js')
    // no manual Worker construction leaked back in
    expect(patched).not.toContain('new Worker(')
    expect(patched).not.toContain('importScripts(')
  })

  it('throws if the anchor is gone — version-bump guard', () => {
    expect(() => patchGraphvizRender('// unrelated source')).toThrow(
      /fixGraphvizRender/,
    )
  })
})

describe('patchFlowchartTheme (task 91 — pair flowchart.js with the content theme)', () => {
  it('the shipped Vditor source draws with NO style options (pre-patch, baked black)', () => {
    expect(flowchartSource).toContain('flowchartObj.drawSVG(item);')
  })

  it('passes themed colours (foreground + fill:none) to drawSVG', () => {
    const patched = patchFlowchartTheme(flowchartSource)
    // line/element/font colours come from the themed foreground (getComputedStyle(item).color).
    expect(patched).toContain('getComputedStyle(item).color')
    expect(patched).toContain('"line-color": vmFcColor')
    expect(patched).toContain('"element-color": vmFcColor')
    expect(patched).toContain('"font-color": vmFcColor')
    // box interiors transparent (NOT "transparent" — Raphael renders that black; "none" works).
    expect(patched).toContain('"fill": "none"')
    // the bare (baked-black) call is gone
    expect(patched).not.toContain('flowchartObj.drawSVG(item);')
  })

  it('throws (fails the build loudly) if the drawSVG anchor is gone — version-bump guard', () => {
    expect(() => patchFlowchartTheme('// unrelated source')).toThrow(
      /fixFlowchartTheme/,
    )
  })
})

describe('patchPlantumlRender (task 87 — local offline TeaVM render)', () => {
  it('the shipped Vditor source uses the remote plantuml.com encoder (pre-patch)', () => {
    expect(plantumlSource).toContain('plantumlEncoder.encode(text)')
    expect(plantumlSource).toContain('plantuml.com')
  })

  // Task 144 item 1: the patch is now a thin shim re-exporting plantumlRender from the real, typed,
  // unit-tested module (media-src/src/plantuml-render.ts). The remote encoder is gone (kept assert);
  // the render + theming logic moved to the module (covered by plantuml-render.test.ts), not here.
  it('drops the remote encoder and re-exports plantumlRender from the extracted module', () => {
    const patched = patchPlantumlRender(plantumlSource)
    expect(patched).not.toContain('plantumlEncoder.encode')
    expect(patched).not.toContain('plantuml.com')
    expect(patched).toContain('plantuml-render')
    expect(patched).toContain('export const plantumlRender')
  })

  it('throws if the encoder anchor is gone — version-bump guard', () => {
    expect(() => patchPlantumlRender('// unrelated source')).toThrow(
      /fixPlantumlRender/,
    )
  })
})

describe('patchAbcRender (task 92/93 — abcjs bump + foreground color)', () => {
  it('the shipped Vditor source calls renderAbc with no params (pre-patch)', () => {
    expect(abcSource).toContain(
      'ABCJS.renderAbc(item, abcRenderAdapter.getCode(item).trim())',
    )
  })

  it('passes foregroundColor from the themed foreground', () => {
    const patched = patchAbcRender(abcSource)
    expect(patched).toContain('foregroundColor: abcFg')
    expect(patched).toContain('getComputedStyle(item).color')
    expect(patched).toContain('data-code')
  })

  it('throws if the renderAbc anchor is gone — version-bump guard', () => {
    expect(() => patchAbcRender('// unrelated source')).toThrow(/fixAbcRender/)
  })
})

describe('patchSetContentTheme (content-theme stylesheet reload flicker)', () => {
  it('the shipped Vditor source reloads on a raw-string href mismatch (pre-patch)', () => {
    expect(setContentThemeSource).toContain(
      'vditorContentTheme.getAttribute("href") !== cssPath',
    )
  })

  it('compares RESOLVED urls so the same file is not reloaded', () => {
    const patched = patchSetContentTheme(setContentThemeSource)
    expect(patched).not.toContain(
      'vditorContentTheme.getAttribute("href") !== cssPath',
    )
    expect(patched).toContain(
      'new URL(vditorContentTheme.getAttribute("href"), document.baseURI).href !== new URL(cssPath, document.baseURI).href',
    )
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchSetContentTheme('// unrelated source')).toThrow(
      /fixSetContentTheme/,
    )
  })
})

describe('patchOutlineCurrent (outline toolbar button blue-flash on init)', () => {
  // The shipped Outline item highlights itself with `if (vditor.options.outline)`,
  // an always-truthy object check — so the button is marked active on init even
  // when the outline panel is closed.
  it('the shipped Vditor source checks the truthy object (pre-patch)', () => {
    expect(outlineSource).toContain('if (vditor.options.outline) {')
  })

  it('gates the active highlight on .enable so it matches the panel state', () => {
    const patched = patchOutlineCurrent(outlineSource)
    expect(patched).not.toContain('if (vditor.options.outline) {')
    expect(patched).toContain('if (vditor.options.outline.enable) {')
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchOutlineCurrent('// unrelated source')).toThrow(
      /fixOutlineCurrent/,
    )
  })
})

describe('patchMathRender (task 57 — KaTeX error resilience)', () => {
  // Confirms the shipped katex call lacks the resilience options today, so a single
  // malformed formula can throw out of renderToString instead of rendering KaTeX's
  // inline red error.
  it('the shipped katex.renderToString has no throwOnError/strict options (pre-patch)', () => {
    expect(mathSource).toContain('katex.renderToString(math, {')
    const call = mathSource.slice(
      mathSource.indexOf('katex.renderToString(math, {'),
    )
    const optionsBlock = call.slice(0, call.indexOf('});'))
    expect(optionsBlock).not.toContain('throwOnError')
    expect(optionsBlock).not.toContain('strict')
  })

  it('adds strict:false + throwOnError:false to the katex call', () => {
    const patched = patchMathRender(mathSource)
    const call = patched.slice(patched.indexOf('katex.renderToString(math, {'))
    const optionsBlock = call.slice(0, call.indexOf('});'))
    expect(optionsBlock).toContain('throwOnError: false')
    expect(optionsBlock).toContain('strict: false')
  })

  it('leaves the (MathJax) tex.macros config untouched — only the katex call changes', () => {
    const patched = patchMathRender(mathSource)
    // throwOnError must appear exactly once (the katex call), not leak into the
    // MathJax branch that shares `macros: options.math.macros`.
    expect(patched.split('throwOnError').length - 1).toBe(1)
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchMathRender('// unrelated source')).toThrow(
      /fixMathRender/,
    )
  })
})

describe('patchProcessCode (task 63 — content-based paste code detection, PR #1921)', () => {
  // Confirms the marker-based heuristics ship today (they cause #1917/#1914).
  it('the shipped source detects code by IDE markers (pre-patch)', () => {
    expect(processCodeSource).toContain('monospace') // VS Code marker
    expect(processCodeSource).toContain('\\n<p class="p1">') // Xcode marker
  })

  it('replaces marker heuristics with content-based detection', () => {
    const patched = patchProcessCode(processCodeSource)
    expect(patched).toContain('const looksLikeCodeContent =')
    expect(patched).toContain('isCode = hasCodeChild || looksLikeCodeContent(')
    // The brittle IDE/Xcode markers are gone.
    expect(patched).not.toContain('monospace')
    expect(patched).not.toContain('\\n<p class="p1">')
    // The output half (isCode → code block) is preserved.
    expect(patched).toContain('data-type="code-block"')
    expect(patched).toContain('export const processPasteCode =')
  })

  it('throws (fails the build loudly) if the anchors are gone — version-bump guard', () => {
    expect(() => patchProcessCode('// unrelated source')).toThrow(
      /fixProcessCode/,
    )
  })
})

describe('patchIrInputSerialize (task 68 — webview owns the serialize)', () => {
  it('the shipped IR process serialises on every input (pre-patch)', () => {
    expect(irProcessSource).toContain('const text = getMarkdown(vditor);')
    expect(irProcessSource).toContain('vditor.options.input(text);')
  })

  it('turns options.input into a cheap signal; serialises only for counter/cache', () => {
    const patched = patchIrInputSerialize(irProcessSource)
    expect(patched).toContain('vditor.options.input();') // signal, no markdown
    expect(patched).not.toContain('vditor.options.input(text);')
    // getMarkdown is now gated behind counter/cache (both off → no serialize).
    expect(patched).toContain(
      '(vditor.options.counter.enable || vditor.options.cache.enable) ? getMarkdown(vditor) : ""',
    )
  })

  it('throws (fails the build loudly) if the anchors are gone — version-bump guard', () => {
    expect(() => patchIrInputSerialize('// unrelated source')).toThrow(
      /fixIrInputSerialize/,
    )
  })
})

describe('patchIrDeferDiagramRender (task 161 — debounce diagram render while typing)', () => {
  it('the shipped IR input re-renders every diagram preview on each input (pre-patch)', () => {
    expect(irInputSource).toContain(
      `vditor.ir.element.querySelectorAll(".vditor-ir__preview[data-render='2']").forEach((item: HTMLElement) => {`,
    )
    expect(irInputSource).toContain('processCodeRender(item, vditor);')
  })

  it('routes the per-input render loop through the edit-activity gate (with a stock fallback)', () => {
    const patched = patchIrDeferDiagramRender(irInputSource)
    // gate hook is preferred when installed…
    expect(patched).toContain('(window as any).__vmarkdDeferIrDiagramRender')
    expect(patched).toContain(
      '(window as any).__vmarkdDeferIrDiagramRender(vditor, processCodeRender);',
    )
    // …and the original loop is kept as the else-branch fallback (harness / hook absent).
    expect(patched).toContain('processCodeRender(item, vditor);')
    expect(patched).toContain('} else {')
  })

  it('throws (fails the build loudly) if the loop anchor is gone — version-bump guard', () => {
    expect(() => patchIrDeferDiagramRender('// unrelated source')).toThrow(
      /patchIrDeferDiagramRender/,
    )
  })
})

describe('patchIrSpaceSerialize (task 171 item 1 — gate the space fast-path serialize)', () => {
  it('the shipped IR input serialises the whole doc on both space fast-paths (pre-patch)', () => {
    // startSpace + endSpace each call input(getMarkdown(...)) — exactly two sites.
    expect(
      irInputSource.split('vditor.options.input(getMarkdown(vditor));').length -
        1,
    ).toBe(2)
  })

  it('gates getMarkdown behind counter/cache at BOTH sites (no serialize when off)', () => {
    const patched = patchIrSpaceSerialize(irInputSource)
    expect(patched).not.toContain('vditor.options.input(getMarkdown(vditor));')
    expect(
      patched.split(
        'vditor.options.input((vditor.options.counter.enable || vditor.options.cache.enable) ? getMarkdown(vditor) : undefined);',
      ).length - 1,
    ).toBe(2) // both sites rewritten
  })

  it('throws if the site count drifts from 2 — version-bump guard', () => {
    expect(() => patchIrSpaceSerialize('// no sites')).toThrow(
      /fixIrSpaceSerialize.*found 0/,
    )
  })
})

describe('patchDeferRenderToc (task 171 item 2 — defer renderToc to settle)', () => {
  it('the shipped IR input calls renderToc on every input (pre-patch)', () => {
    expect(irInputSource).toContain('renderToc(vditor);')
  })

  it('routes renderToc through the settle hook with a stock fallback', () => {
    const patched = patchDeferRenderToc(irInputSource)
    expect(patched).toContain(
      '(window as any).__vmarkdDeferRenderToc(vditor, renderToc);',
    )
    expect(patched).toContain('} else {')
    expect(patched).toContain('renderToc(vditor);') // fallback kept
  })

  it('throws if the renderToc anchor is gone — version-bump guard', () => {
    expect(() => patchDeferRenderToc('// no renderToc')).toThrow(
      /patchDeferRenderToc/,
    )
  })
})

describe('patchIrStripPreviewSpin (task 172 — strip the preview SVG from the spin input)', () => {
  it('the shipped IR input feeds the raw block html straight to the spin (pre-patch)', () => {
    expect(irInputSource).toContain('html = vditor.lute.SpinVditorIRDOM(html);')
  })

  it('routes the spin input through the strip hook with an identity fallback', () => {
    const patched = patchIrStripPreviewSpin(irInputSource)
    expect(patched).not.toContain('html = vditor.lute.SpinVditorIRDOM(html);')
    expect(patched).toContain(
      'vditor.lute.SpinVditorIRDOM((window as any).__vmarkdStripPreviewForSpin ? (window as any).__vmarkdStripPreviewForSpin(html) : html);',
    )
  })

  it('throws if the spin-call anchor count drifts from 1 — version-bump guard', () => {
    expect(() => patchIrStripPreviewSpin('// no spin call')).toThrow(
      /patchIrStripPreviewSpin.*found 0/,
    )
  })
})

describe('patchIrFenceSpinSkip (task 175 — defer the spin for inert fenced-body keystrokes)', () => {
  it('the shipped IR input has the input() signature anchor (pre-patch)', () => {
    expect(irInputSource).toContain(
      'export const input = (vditor: IVditor, range: Range, ignoreSpace = false, event?: InputEvent) => {',
    )
  })

  it('injects an early-return hook at the top of input()', () => {
    const patched = patchIrFenceSpinSkip(irInputSource)
    expect(patched).toContain(
      '(window as any).__vmarkdTrySkipFenceSpin(vditor, range, event)',
    )
    // the hook sits at the very top of the function body (before blockElement is resolved)
    const hookIdx = patched.indexOf('__vmarkdTrySkipFenceSpin')
    const blockIdx = patched.indexOf('hasClosestBlock(range.startContainer)')
    expect(hookIdx).toBeGreaterThan(0)
    expect(hookIdx).toBeLessThan(blockIdx)
  })

  it('throws if the input() signature anchor is gone — version-bump guard', () => {
    expect(() => patchIrFenceSpinSkip('// no input fn')).toThrow(
      /patchIrFenceSpinSkip/,
    )
  })
})

describe('patchDeferGetMarkdown (task 171 item 4 — WYSIWYG/SV discarded serialize)', () => {
  it('both WYSIWYG + SV compute a discarded full-doc serialize (pre-patch)', () => {
    expect(afterRenderEventSource).toContain(
      'const text = getMarkdown(vditor);',
    )
    expect(svProcessSource).toContain('const text = getMarkdown(vditor);')
  })

  it('gates the serialize behind counter/cache in both files (text stays declared)', () => {
    for (const [src, label] of [
      [afterRenderEventSource, 'wysiwyg/afterRenderEvent.ts'],
      [svProcessSource, 'sv/process.ts'],
    ] as const) {
      const patched = patchDeferGetMarkdown(src, label)
      expect(patched).not.toContain('const text = getMarkdown(vditor);')
      expect(patched).toContain(
        'const text = (vditor.options.counter.enable || vditor.options.cache.enable) ? getMarkdown(vditor) : "";',
      )
      // the counter/cache consumers below still reference `text`
      expect(patched).toContain('vditor.counter.render(vditor, text);')
    }
  })

  it('throws if the anchor count drifts — version-bump guard', () => {
    expect(() => patchDeferGetMarkdown('// none', 'x.ts')).toThrow(
      /patchDeferGetMarkdown.*found 0/,
    )
  })
})

describe('patchInfoDialog (original Vditor About, English, + Help section)', () => {
  const pin = {
    commit: '36ea9e0966025d7f4f343cdf9a611109bfb29ef6',
    committedAt: '2026-06-03',
  }

  // The shipped Info dialog is Chinese, loads a remote unpkg logo, and interpolates
  // a stale Lute.Version. The Help dialog (its links folded in here) is also Chinese.
  it('the shipped Info.ts is Chinese with a remote unpkg logo (pre-patch)', () => {
    expect(infoSource).toContain('组件版本：')
    expect(infoSource).toContain('unpkg.com')
  })

  it('keeps Vditor’s original About (translated) and appends a Help section', () => {
    const patched = patchInfoDialog(infoSource, pin)
    // top half = Vditor's original About content, in English (no vMarkd branding)
    expect(patched).toContain(
      'The next-generation Markdown editor, built for the future',
    )
    expect(patched).toContain('Project: ')
    expect(patched).toContain('License: MIT')
    expect(patched).not.toContain('vMarkd —') // not rebranded
    // Help folded in as its own section below
    expect(patched).toContain('<strong>Markdown guide</strong>')
    expect(patched).toContain('<strong>Vditor support</strong>')
    expect(patched).toContain('Syntax cheatsheet')
    expect(patched).toContain('Keyboard shortcuts')
    // no Chinese left (Info or the folded-in Help)
    expect(patched).not.toContain('组件版本')
    expect(patched).not.toContain('Markdown 使用指南')
    // Lute commit link (short sha) + date; Vditor version still interpolated
    expect(patched).toContain(
      `https://github.com/88250/lute/commit/${pin.commit}`,
    )
    expect(patched).toContain('>36ea9e0<')
    expect(patched).toContain('2026-06-03')
    // eslint-disable-next-line no-template-curly-in-string
    expect(patched).toContain('Vditor v${VDITOR_VERSION}')
    // logo repointed off unpkg to the locally-served asset (CSP task 67)
    expect(patched).not.toContain('unpkg.com')
    // eslint-disable-next-line no-template-curly-in-string
    expect(patched).toContain('${vditor.options.cdn}/dist/images/logo.png')
    // upstream links kept (Vditor project + ld246 help/community + sponsor)
    expect(patched).toContain('https://b3log.org/vditor')
    expect(patched).toContain('https://ld246.com/article/1583308420519')
    expect(patched).toContain('https://github.com/Vanessa219/vditor/issues')
    expect(patched).toContain('https://ld246.com/sponsor')
  })

  it('without a vendored pin, keeps Vditor’s runtime version interpolation', () => {
    const patched = patchInfoDialog(infoSource, null)
    // eslint-disable-next-line no-template-curly-in-string
    expect(patched).toContain('Lute v${Lute.Version}')
  })

  it('throws (fails the build loudly) if the dialog anchor is gone — version-bump guard', () => {
    expect(() => patchInfoDialog('// unrelated source', pin)).toThrow(
      /fixInfoDialog/,
    )
  })
})

describe('patchCodeRenderSkipDiagram (task 189 — no copy button inside rendered diagrams)', () => {
  const codeRenderSource = read(
    '../../media-src/node_modules/vditor/src/ts/markdown/codeRender.ts',
  )
  it('adds the svg/.vmarkd-d2-md skip to the filter', () => {
    const patched = patchCodeRenderSkipDiagram(codeRenderSource)
    expect(patched).toContain('e.closest("svg, .vmarkd-d2-md")')
  })
  it('throws on drift', () => {
    expect(() => patchCodeRenderSkipDiagram('// x')).toThrow(
      /patchCodeRenderSkipDiagram/,
    )
  })
})

describe('patchPreviewMorph (task 187 — block-level preview morph hook)', () => {
  it('routes the non-url innerHTML write through the morph hook, with a stock fallback', () => {
    const patched = patchPreviewMorph(previewSource)
    expect(patched).toContain('window as any).__vmarkdMorphPreview')
    expect(patched).toContain(
      'vmMorph(this.previewElement, html); } else { this.previewElement.innerHTML = html; }',
    )
  })

  it('leaves the xhr fallback branch (deeper indent) untouched', () => {
    const patched = patchPreviewMorph(previewSource)
    // The xhr branch keeps its plain innerHTML assignment at 28-space indent.
    expect(patched).toContain(
      '                            this.previewElement.innerHTML = html;',
    )
    // Exactly ONE morph hook was inserted.
    expect(patched.match(/__vmarkdMorphPreview/g)).toHaveLength(1)
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchPreviewMorph('// unrelated source')).toThrow(
      /patchPreviewMorph/,
    )
  })
})

describe('patchPreviewCopyTip (Ctrl+C in preview shows a hardcoded Chinese toast)', () => {
  const CHINESE_TIP = '已复制到剪切板'

  // The shipped preview shows a hardcoded Chinese "copied to clipboard" toast on
  // Ctrl+C, NOT routed through VditorI18n, so an English-locale user sees Chinese.
  it('the shipped preview/index.ts shows the Chinese tip (pre-patch)', () => {
    expect(previewSource).toContain(`\`${CHINESE_TIP}\``)
  })

  it('translates the copy toast to English', () => {
    const patched = patchPreviewCopyTip(previewSource)
    expect(patched).not.toContain(CHINESE_TIP)
    expect(patched).toContain('Copied to clipboard')
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchPreviewCopyTip('// unrelated source')).toThrow(
      /fixPreviewCopyTip/,
    )
  })
})

describe('patchPreviewCopyClipboardData (split-preview Ctrl+C copied nothing)', () => {
  // The shipped handler copies via a RE-ENTRANT document.execCommand("copy") from inside its own
  // `copy` listener, then preventDefault()s the original event. In a VS Code webview Chromium
  // refuses that write and returns true anyway, so the clipboard was never written at all.
  it('the shipped preview/index.ts copies through copyToX/execCommand (pre-patch)', () => {
    expect(previewSource).toContain(
      'this.copyToX(vditor, tempElement, "default");',
    )
    expect(previewSource).toContain('document.execCommand("copy");')
  })

  it('writes the event clipboardData instead, the mechanism every other pane uses', () => {
    const patched = patchPreviewCopyClipboardData(previewSource)
    expect(patched).not.toContain(
      'this.copyToX(vditor, tempElement, "default");',
    )
    expect(patched).toContain(
      'event.clipboardData.setData("text/html", tempElement.outerHTML);',
    )
    expect(patched).toContain('event.clipboardData.setData("text/plain"')
    // The original event must still be cancelled — the clipboard is ours now.
    expect(patched).toContain('event.preventDefault();')
  })

  it('leaves copyToX in place for the WeChat/Zhihu export buttons', () => {
    const patched = patchPreviewCopyClipboardData(previewSource)
    expect(patched, 'the method itself survives').toContain('private copyToX(')
    expect(patched, 'its own execCommand path is untouched').toContain(
      'document.execCommand("copy");',
    )
  })

  it('keeps the KaTeX fix-up so pasted math still renders', () => {
    expect(patchPreviewCopyClipboardData(previewSource)).toContain(
      'tempElement.querySelectorAll(".katex-html .base")',
    )
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchPreviewCopyClipboardData('// unrelated source')).toThrow(
      /patchPreviewCopyClipboardData/,
    )
  })
})

describe('patchIrBlurExpand (code-block edit click flash)', () => {
  const ANCHOR = 'expandElement.classList.remove("vditor-ir__node--expand");'

  it('Vditor ships the unguarded synchronous collapse-on-blur', () => {
    expect(editorCommonEventSource).toContain(ANCHOR)
  })

  it('defers the collapse and skips it when focus returns to the editor', () => {
    const patched = patchIrBlurExpand(editorCommonEventSource)
    // wrapped in a deferred, focus-rechecked callback
    expect(patched).toContain('requestAnimationFrame(')
    expect(patched).toContain('document.activeElement')
    expect(patched).toContain('editorElement.contains(ae)')
    // the removal still happens — but only inside the guard
    expect(patched).toContain(ANCHOR)
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchIrBlurExpand('// unrelated source')).toThrow(
      /fixIrBlurExpand/,
    )
  })
})

describe('patchMermaidErrorRender (mermaidRender.ts)', () => {
  it('suppresses the bomb + renders the shared themed escaped error box, drops the raw dump', () => {
    const patched = patchMermaidErrorRender(mermaidRenderSource)
    // mermaid no longer injects its bomb error graphic (render() just throws) …
    expect(patched).toContain('suppressErrorRendering: true')
    // … and the catch renders the SHARED box (task 178 — same class for every engine), not
    // errorElement.outerHTML + a <small> dump. data-render="1" → Lute-invisible.
    expect(patched).toContain('vmarkd-diagram-error')
    expect(patched).toContain('vmarkd-diagram-error__msg')
    expect(patched).toContain('data-render="1"')
    expect(patched).toContain('vmarkd-diagram-error__title">Mermaid')
    expect(patched).toContain('&amp;') // message is HTML-escaped (source <…> can't inject)
    expect(patched).not.toContain('errorElement.outerHTML')
    expect(patched).not.toContain('errorElement.parentElement.remove()')
    expect(patched).not.toContain('vmarkd-mermaid-error') // old per-engine class is gone
  })

  it('throws (fails the build loudly) if the config or catch anchor drifts', () => {
    expect(() => patchMermaidErrorRender('// unrelated source')).toThrow(
      /patchMermaidErrorRender/,
    )
    // config flag present but the catch body gone → still throws (both anchors required)
    expect(() =>
      patchMermaidErrorRender('const c = { startOnLoad: false, };'),
    ).toThrow(/patchMermaidErrorRender/)
  })
})

describe('patchEchartsErrorBox / patchMindmapErrorBox (task 178 — native render-error box)', () => {
  it('Vditor ships the raw "render error" dump in chart + mindmap (pre-patch)', () => {
    expect(chartSource).toContain('echarts render error: <br>')
    expect(chartSource).toContain('e.className = "vditor-reset--error";')
    expect(mindmapSource).toContain('mindmap render error: <br>')
  })

  it('echarts: replaces the raw dump with the shared themed box (escaped, titled)', () => {
    const patched = patchEchartsErrorBox(chartSource)
    expect(patched).toContain('vmarkd-diagram-error" data-render="1"')
    expect(patched).toContain('vmarkd-diagram-error__title">ECharts')
    expect(patched).toContain('vmarkd-diagram-error__msg')
    expect(patched).toContain('&amp;') // escaped message
    // raw dump + the unwanted reset class are gone (the box is self-styled)
    expect(patched).not.toContain('echarts render error')
    expect(patched).not.toContain('e.className = "vditor-reset--error"')
  })

  it('mindmap: replaces the raw dump with the shared themed box (titled Mindmap)', () => {
    const patched = patchMindmapErrorBox(mindmapSource)
    expect(patched).toContain('vmarkd-diagram-error__title">Mindmap')
    expect(patched).toContain('vmarkd-diagram-error__msg')
    expect(patched).not.toContain('mindmap render error')
  })

  it('composes with patchMindmapThemeColors (both apply, independent anchors)', () => {
    const patched = patchMindmapErrorBox(patchMindmapThemeColors(mindmapSource))
    expect(patched).toContain('window.__vmarkdMindmapStyle.node') // theme patch survived
    expect(patched).toContain('vmarkd-diagram-error__title">Mindmap') // error patch applied
  })

  it('throws (fails the build loudly) if the catch anchor drifts', () => {
    expect(() => patchEchartsErrorBox('// unrelated source')).toThrow(
      /patchNativeDiagramError/,
    )
    expect(() => patchMindmapErrorBox('// unrelated source')).toThrow(
      /patchNativeDiagramError/,
    )
  })
})

describe('patchFlowchartError (task 178 — wrap flowchart render in a catch → box)', () => {
  it('Vditor ships the render body with NO catch (pre-patch, uncaught parse error)', () => {
    expect(flowchartSource).toContain(
      'const flowchartObj = flowchart.parse(flowchartRenderAdapter.getCode(item));',
    )
    expect(flowchartSource).not.toContain('vmarkd-diagram-error')
  })

  it('wraps parse+draw in a try/catch that renders the shared themed box', () => {
    const patched = patchFlowchartError(flowchartSource)
    expect(patched).toContain('try {')
    expect(patched).toContain('} catch (error) {')
    expect(patched).toContain('vmarkd-diagram-error" data-render="1"')
    expect(patched).toContain('vmarkd-diagram-error__title">Flowchart')
    expect(patched).toContain('&amp;') // escaped message
    // the drawSVG line is kept verbatim INSIDE the try so patchFlowchartTheme can still theme it
    expect(patched).toContain('flowchartObj.drawSVG(item);')
  })

  it('composes with patchFlowchartTheme (error wrap inner, theme outer)', () => {
    const patched = patchFlowchartTheme(patchFlowchartError(flowchartSource))
    // themed drawSVG present (theme patch found the verbatim line inside the try)…
    expect(patched).toContain('"line-color": vmFcColor')
    expect(patched).toContain('"fill": "none"')
    // …and the error box is present, and the bare baked-black call is gone
    expect(patched).toContain('vmarkd-diagram-error__title">Flowchart')
    expect(patched).not.toContain('flowchartObj.drawSVG(item);')
  })

  it('throws (fails the build loudly) if the render-body anchor is gone — version-bump guard', () => {
    expect(() => patchFlowchartError('// unrelated source')).toThrow(
      /fixFlowchartError/,
    )
  })
})

describe('patchDmpInterop (undo CJS default-import interop)', () => {
  // diff-match-patch is CJS whose module.exports IS the constructor; the ES
  // namespace object esbuild builds for `import * as` is not callable, so
  // `new DiffMatchPatch()` throws at runtime and undo breaks (task 20).
  it('the shipped Vditor undo source uses the namespace import + `new` (pre-patch)', () => {
    expect(undoSource).toContain(
      'import * as DiffMatchPatch from "diff-match-patch";',
    )
    expect(undoSource).toContain('new DiffMatchPatch()')
  })

  it('rewrites the namespace import to a default import (constructor callable)', () => {
    const patched = patchDmpInterop(undoSource)
    expect(patched).toContain('import DiffMatchPatch from "diff-match-patch";')
    expect(patched).not.toContain(
      'import * as DiffMatchPatch from "diff-match-patch";',
    )
    // The constructor call site is untouched — only the import shape changes.
    expect(patched).toContain('new DiffMatchPatch()')
  })

  it('throws (fails the build loudly) if the anchor is gone — version-bump guard', () => {
    expect(() => patchDmpInterop('// unrelated source')).toThrow(
      /patchDmpInterop/,
    )
  })

  it('is idempotent-safe: re-running on patched output throws rather than no-oping', () => {
    const once = patchDmpInterop(undoSource)
    expect(() => patchDmpInterop(once)).toThrow(/patchDmpInterop/)
  })
})

describe('?v= cache-buster patches (185/3c — no silent skips)', () => {
  const smilesSource = read(
    '../../media-src/node_modules/vditor/src/ts/markdown/SMILESRender.ts',
  )

  it('patchMermaidVersion bumps the ?v= and throws when the URL drifts', () => {
    const bumped = patchMermaidVersion(mermaidRenderSource, '99.9.9')
    expect(bumped).toContain('mermaid.min.js?v=99.9.9')
    expect(() => patchMermaidVersion('// unrelated source', '99.9.9')).toThrow(
      /fixMermaidVersion/,
    )
  })

  it('patchEchartsVersion bumps every echarts loader ?v= and throws when the URL drifts', () => {
    const bumped = patchEchartsVersion(chartSource, '88.8.8')
    expect(bumped).toContain('echarts.min.js?v=88.8.8')
    expect(bumped).not.toMatch(/echarts\.min\.js\?v=(?!88\.8\.8)/)
    expect(() => patchEchartsVersion('// unrelated source', '88.8.8')).toThrow(
      /fixEchartsVersion/,
    )
  })

  it('patchSmilesVersion bumps the ?v=, no-ops without a pin, throws on anchor drift', () => {
    expect(patchSmilesVersion(smilesSource, '9.9.9')).toContain(
      'smiles-drawer.min.js?v=9.9.9',
    )
    expect(patchSmilesVersion(smilesSource, undefined)).toBe(smilesSource)
    expect(() =>
      patchSmilesVersion(smilesSource.replace('?v=2.1.7', ''), '9.9.9'),
    ).toThrow(/cache-buster not applied/)
  })

  it('patchAbcRender with a pinned version bumps the ?v= and throws when the script anchor drifts', () => {
    const bumped = patchAbcRender(abcSource, '6.6.6')
    expect(bumped).toContain('abcjs_basic.min.js?v=6.6.6')
    // Script anchor renamed while the render anchor survives → MUST throw, not skip the bump.
    const renamedScript = abcSource.replace(
      'abcjs_basic.min.js',
      'abcjs_RENAMED.min.js',
    )
    expect(() => patchAbcRender(renamedScript, '6.6.6')).toThrow(
      /cache-buster not applied/,
    )
    // Unpinned (no version) legitimately skips the bump but still applies the render patch.
    expect(patchAbcRender(abcSource, undefined)).toContain('foregroundColor')
  })

  it('patchMarkmapStatic with a pinned version bumps the ?v= and throws when the script anchor drifts', () => {
    const bumped = patchMarkmapStatic(markmapSource, '7.7.7')
    expect(bumped).toContain('markmap.min.js?v=7.7.7')
    const renamedScript = markmapSource.replace(
      'markmap.min.js',
      'markmap_RENAMED.min.js',
    )
    expect(() => patchMarkmapStatic(renamedScript, '7.7.7')).toThrow(
      /cache-buster not applied/,
    )
  })
})

describe('error-box titles: esbuild-inlined markup mirrors the engine registry (185/2a)', () => {
  // diagram-error.ts derives its titles from the registry; the NATIVE renderers get the same
  // box inlined at build time by these patches. This pins the two to the SAME source of truth:
  // change a title in engine-registry.ts and this fails until the inlined markup follows.
  it('mermaid / flowchart / echarts / mindmap inline the registry title verbatim', async () => {
    const { engineByLang } = await import('../../media-src/src/engine-registry')
    const titleMarkup = (lang: string) =>
      `vmarkd-diagram-error__title">${engineByLang(lang)?.errorTitle}<`
    expect(patchMermaidErrorRender(mermaidRenderSource)).toContain(
      titleMarkup('mermaid'),
    )
    expect(patchFlowchartError(flowchartSource)).toContain(
      titleMarkup('flowchart'),
    )
    expect(patchEchartsErrorBox(chartSource)).toContain(titleMarkup('echarts'))
    expect(patchMindmapErrorBox(mindmapSource)).toContain(
      titleMarkup('mindmap'),
    )
  })
})

// Task 365 — highlightRender must not descend into a rendered diagram. d2 markdown labels emit real
// `<pre><code>` inside a `<foreignObject>`, so without this the highlighter restyles diagram labels
// (hljs colours + the code-panel background) and, worse, does it in only ONE pane — which is how the
// IR and Preview markup diverged once Preview started reusing the IR render.
const highlightSource = read(
  '../../media-src/node_modules/vditor/src/ts/markdown/highlightRender.ts',
)

describe('patchHighlightSkipDiagrams (no hljs inside a rendered diagram)', () => {
  it('the shipped Vditor source highlights every pre > code, diagram labels included (pre-patch)', () => {
    expect(highlightSource).toContain('querySelectorAll("pre > code")')
    expect(highlightSource).not.toContain('closest("svg")')
  })

  it('adds an in-svg skip ahead of the existing marker-pre skip', () => {
    const patched = patchHighlightSkipDiagrams(highlightSource)
    expect(patched).toContain('block.closest("svg")')
    // The guard must come BEFORE the highlight call, not after it.
    expect(patched.indexOf('block.closest("svg")')).toBeLessThan(
      patched.indexOf('window.hljs.highlight'),
    )
    // Vditor's own skips survive untouched.
    expect(patched).toContain('vditor-ir__marker--pre')
  })

  it('throws if Vditor drops the anchor (version drift fails the build loudly)', () => {
    expect(() => patchHighlightSkipDiagrams('nothing to anchor on')).toThrow(
      /anchor not found/,
    )
  })
})

// Task 367 — the Preview render sanitises and Lute's sanitiser drops HTML comments, so an authored
// comment vanished from the pane while IR showed it. Pre-rewrite the markdown instead of turning
// sanitising off.

const previewIndexSource = read(
  '../../media-src/node_modules/vditor/src/ts/preview/index.ts',
)

describe('patchPreviewComments (comments survive the preview sanitiser)', () => {
  it('the shipped Vditor source feeds raw markdown straight to Lute (pre-patch)', () => {
    expect(previewIndexSource).toContain(
      'const markdownText = getMarkdown(vditor);',
    )
    expect(previewIndexSource).not.toContain('maskCommentsForPreview')
  })

  it('routes the markdown through the mask + imports it from the real module', () => {
    const patched = patchPreviewComments(previewIndexSource)
    expect(patched).toContain(
      'const markdownText = vmMaskCommentsForPreview(getMarkdown(vditor));',
    )
    expect(patched).toContain('html-comment')
    // The raw binding must be gone — both render branches read this one variable.
    expect(patched).not.toContain('const markdownText = getMarkdown(vditor);')
  })

  it('throws if Vditor drops the anchor (version drift fails the build loudly)', () => {
    expect(() => patchPreviewComments('nothing to anchor on')).toThrow(
      /anchor not found/,
    )
  })
})

// Task 371 — Vditor reads the language with `className.replace("language-", "")`, which assumes the
// element has exactly one class. True on the FIRST pass — but that pass appends `hljs`, so a SECOND
// pass computes "language-js hljs" -> "js hljs", which is not a language, falls back to plaintext,
// and re-renders the block with ZERO token spans. Reachable since the task-187 preview morph keeps
// unchanged blocks' live DOM across renders.
describe('patchHighlightLanguageClass (re-highlighting a block keeps its language)', () => {
  it('the shipped Vditor source derives the language from the whole className (pre-patch)', () => {
    expect(highlightSource).toContain(
      'let language = block.className.replace("language-", "");',
    )
  })

  it('reads the language from the language-* class only', () => {
    const patched = patchHighlightLanguageClass(highlightSource)
    expect(patched).toContain('block.className.match(')
    // The naive expression survives ONLY as the no-language-class fallback, never on its own line.
    expect(patched).not.toMatch(
      /let language = block\.className\.replace\("language-", ""\);/,
    )
  })

  it('the patched expression picks "js" out of an already-highlighted class list', () => {
    const patched = patchHighlightLanguageClass(highlightSource)
    const expr = /let language = (.*?);\n/.exec(patched)?.[1]
    expect(expr).toBeTruthy()
    const evalFor = (className: string) =>
      // biome-ignore lint/security/noGlobalEval: evaluating the patched expression is the point
      eval(
        `(block => { let language = ${expr}; return language })({ className: ${JSON.stringify(className)} })`,
      )
    expect(evalFor('language-js hljs')).toBe('js') // the bug: was "js hljs"
    expect(evalFor('language-js')).toBe('js')
    expect(evalFor('hljs language-python')).toBe('python') // order-independent
  })

  it('throws if Vditor drops the anchor (version drift fails the build loudly)', () => {
    expect(() => patchHighlightLanguageClass('nothing to anchor on')).toThrow(
      /anchor not found/,
    )
  })
})
