import '../src/boot/preload'
// Source import so the fixListToggle esbuild patch is applied (see link-harness).
import Vditor from 'vditor/src/index'
import { listToggle } from 'vditor/src/ts/util/fixBrowserBehavior'
// Tasks 461/462 — the outdent seam is wired ONLY behind `?fix=1` (see below); this harness always
// bundles the patchFixListOutdent-patched Vditor regardless (see list.spec.ts's header), so `?fix=1`
// toggles just whether `window.__vmarkdListBackspaceOutdent` is installed, not which Vditor source runs.
import { installListBackspace } from '../src/editing/list-backspace'

// Task 391's invariant, kept as a DETECTOR after task 461 retired the repair module: in a list still
// marked `data-tight="true"`, no item may hold exactly one `<p>`-wrapped block (2+ is deliberate
// multi-block content, never the merge artifact — see task 391's rationale). Counting instead of
// repairing is deliberate now that nothing repairs it in production: a spec asserting "no corruption"
// must not be able to silently fix the thing it is asserting about.
function countTightListCorruption(root: ParentNode): number {
  let found = 0
  for (const list of Array.from(
    root.querySelectorAll('ol[data-tight="true"], ul[data-tight="true"]'),
  )) {
    // Direct children only: a nested list carries its own data-tight and is visited in its own right.
    for (const item of Array.from(list.children)) {
      if (item.tagName !== 'LI') continue
      if (
        Array.from(item.children).filter((c) => c.tagName === 'P').length === 1
      )
        found++
    }
  }
  return found
}

// Real Vditor (IR) to exercise the listToggle bugs (task 56): the null-deref
// crash on a checkbox-less sibling, and the sibling-scope mutation (toggling one
// item must not affect the others). The list shape is read from the URL
// (`?list=plain|mixed`) so the spec can pick the right fixture per assertion.
const lists: Record<string, string> = {
  // Plain bullets — toggling "check" on one item should make ONLY that item a task.
  plain: ['- one', '- two', '- three', ''].join('\n'),
  // Some items have a checkbox, some don't — the uncheck path used to null-deref
  // on the checkbox-less sibling.
  mixed: [
    '- [ ] task one',
    '- [x] task two done',
    '- plain bullet, no checkbox',
    '- [ ] task four',
    '',
  ].join('\n'),
  // Task 453 — mirrors test/vscode-e2e/fixtures/list-ops.md (a task list ABOVE a bullet list,
  // in the same doc) so the ported "Enter continues a list" spec can assert the task list is
  // undisturbed by editing the bullets below it, same as the real-VS-Code original did.
  ops: [
    '## Tasks',
    '',
    '- [ ] task one',
    '- [ ] task two',
    '',
    '## Bullets',
    '',
    '- bullet A',
    '- bullet B',
    '',
  ].join('\n'),
  // Tasks 461/462 probe — mirrors the exact fixture task 391 measured the corruption against
  // (list-tight.test.ts's CORRUPTED constant), so Backspace on the FIRST nested item can be probed
  // with the outdent seam present or absent (`?fix=1`, below) against this harness's always-patched
  // Vditor (finish-init.ts is never wired here — see list.spec.ts's header for why "stock Vditor"
  // isn't reachable from a running build).
  nested: [
    '1. Analysis of email threads',
    '   * first entry',
    '   * second entry',
    '',
  ].join('\n'),
}
const value =
  lists[new URLSearchParams(location.search).get('list') || 'plain'] ||
  lists.plain

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  customWysiwygToolbar: () => {},
  after() {
    ;(window as any).vditor = editor
    ;(window as any).vditorTest = editor

    // Toggle list type on the Nth <li> in the IR editor, mirroring what the
    // toolbar list/check buttons do (ir/process.ts → listToggle). Returns
    // {ok, error} so the spec can assert "no crash".
    ;(window as any).__listToggle = (liIndex: number, type: string) => {
      try {
        const irEl = (editor as any).vditor.ir.element as HTMLElement
        const li = irEl.querySelectorAll('li')[liIndex] as HTMLElement
        const range = document.createRange()
        range.selectNodeContents(li)
        range.collapse(true)
        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)
        listToggle((editor as any).vditor, range, type)
        return { ok: true, error: null }
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message ?? e) }
      }
    }
    // Tasks 461/462 — `?fix=1` wires what finish-init.ts installs in production (the
    // `window.__vmarkdListBackspaceOutdent` seam patched `fixList` calls into), so specs can probe
    // "does the corruption still happen with our real fix active?" against genuine keydown handling.
    if (new URLSearchParams(location.search).get('fix') === '1') {
      installListBackspace()
    }
    // Always exposed (harmless when unused) so any spec can ask "did this operation leave the
    // tight-list corruption behind?" without wiring a whole MutationObserver.
    ;(window as any).__tightListCorruption = () =>
      countTightListCorruption((editor as any).vditor.ir.element as HTMLElement)

    ;(window as any).__ready = true
  },
})
