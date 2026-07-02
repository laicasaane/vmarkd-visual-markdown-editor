// Off-screen render→swap for Vditor's NATIVE diagram engines (task 59 primitive, generalised for
// the task-184 render cache). Each engine renders its source into a hidden off-flow sandbox; the
// finished <svg> is then copied ATOMICALLY into the live node — the live DOM never collapses to the
// (short) source, so there's no scroll jump and no flash. Two callers:
//   - mermaid-retheme.ts (live dark↔light re-render), and
//   - render-cache-client.ts (Phase 3: re-render a native block on a cache MISS, since Vditor's
//     one-shot open pass already skipped a block we reserved and can't be re-fired).
//
// Only engines whose output is a REUSABLE static <svg> AND whose Vditor renderer sets
// `data-processed` on completion (our poll signal) are here: mermaid, abc, flowchart.
// NOT echarts/mindmap (canvas) and NOT markmap (live d3 instance, no data-processed, 3-way DOM
// split). graphviz is also EXCLUDED: reserving it makes its Viz.js engine run twice (the blocked
// live pass still calls Viz.instance(), then our offscreen pass calls it again) and the second
// Viz worker hangs → the offscreen render never produces an svg (empirically: e2e leaves raw DOT).
// See task 184.
import { abcRender } from 'vditor/src/ts/markdown/abcRender'
import { flowchartRender } from 'vditor/src/ts/markdown/flowchartRender'
import { mermaidRender } from 'vditor/src/ts/markdown/mermaidRender'

/** One offscreen render→swap job: render `source` and copy the finished SVG into `live`. */
export interface NativeJob {
  live: HTMLElement
  source: string
}

// lang → the Vditor renderer. All query `.language-<lang>` on the passed element, read the source
// from textContent, and set `data-processed="true"` on completion. Extra args are ignored by
// renderers that don't use them.
type NativeRenderer = (
  el: HTMLElement,
  cdn: string,
  theme: 'dark' | 'light',
) => void
const RENDERERS: Record<string, NativeRenderer> = {
  mermaid: (el, cdn, theme) => mermaidRender(el, cdn, theme),
  abc: (el, cdn) => abcRender(el, cdn),
  flowchart: (el, cdn) => flowchartRender(el, cdn),
}

/** The native langs whose renders the cache can reuse (reserve + paint + offscreen-miss). */
export const NATIVE_CACHE_LANGS = Object.keys(RENDERERS)

/**
 * Render each job's `source` in a hidden off-body sandbox using `lang`'s engine, then copy each
 * finished <svg> into its live node. Fire-and-forget async; `onSwapped(job)` fires after a job's
 * SVG lands. The sandbox inherits the LIVE node's computed `color` so engines that bake the
 * foreground from `getComputedStyle` (abc, flowchart) or `currentColor` (graphviz) render in the
 * content theme even though the sandbox sits off-body (mermaid ignores it — it takes an explicit
 * theme). No-op for an unknown lang / empty jobs.
 */
export function renderNativeJobs(
  lang: string,
  jobs: NativeJob[],
  cdn: string,
  theme: 'dark' | 'light',
  onSwapped?: (job: NativeJob) => void,
): void {
  const render = RENDERERS[lang]
  if (!render || jobs.length === 0) return
  const sandbox = document.createElement('div')
  sandbox.setAttribute('aria-hidden', 'true')
  // Lute-invisible in the (unlikely) event a serialize races before the sandbox is removed.
  sandbox.setAttribute('data-render', '1')
  // Inherit the content-theme foreground from a live node (settled by miss/re-theme time) so the
  // getComputedStyle-based engines bake the right colour off-body.
  const fg = jobs[0]?.live ? getComputedStyle(jobs[0].live).color : ''
  sandbox.style.cssText = `position:absolute;left:-99999px;top:0;width:800px;visibility:hidden;pointer-events:none${
    fg ? `;color:${fg}` : ''
  }`
  const temps = jobs.map((j) => {
    const t = document.createElement('div')
    t.className = `language-${lang}`
    t.textContent = j.source
    sandbox.appendChild(t)
    return t
  })
  document.body.appendChild(sandbox)
  render(sandbox, cdn, theme)

  // The renderers are fire-and-forget async (addScript-gated); poll until every temp is done, then
  // swap each finished SVG into its live node and drop the sandbox. Normal renders exit immediately
  // via `done`; the frame cap is only a leak-guard for a render that never completes — generous so a
  // COLD engine load (graphviz's Viz.js WASM instance is the slowest, well over the old ~3s cap) has
  // time to finish. ~1200 frames ≈ 20 s at 60 fps, far under any caller's own timeout.
  const MAX_POLL_FRAMES = 1200
  let tries = 0
  const swap = () => {
    const done = temps.every(
      (t) =>
        t.getAttribute('data-processed') === 'true' || !!t.querySelector('svg'),
    )
    if (done || tries++ > MAX_POLL_FRAMES) {
      jobs.forEach((j, i) => {
        if (temps[i].querySelector('svg')) {
          j.live.innerHTML = temps[i].innerHTML
          onSwapped?.(j)
        }
      })
      sandbox.remove()
      return
    }
    requestAnimationFrame(swap)
  }
  requestAnimationFrame(swap)
}

/** Read a native diagram preview pane's editable source (the sibling `<code class="language-X">`
 *  OUTSIDE the preview pane — its textContent survives every render, unlike the preview node whose
 *  textContent is overwritten by the SVG). Shared by re-theme + the render cache. */
export function nativeSourceForPane(
  pane: HTMLElement,
  lang: string,
): string | null {
  const block =
    pane.closest<HTMLElement>(
      '.vditor-ir__node, .vditor-wysiwyg__block, [data-type="code-block"]',
    ) || pane.parentElement
  const source = block
    ? Array.from(block.querySelectorAll<HTMLElement>(`.language-${lang}`)).find(
        (m) => !pane.contains(m),
      )?.textContent
    : undefined
  return source ?? null
}
