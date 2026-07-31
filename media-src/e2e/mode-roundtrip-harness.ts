import '../src/boot/preload'
import Vditor from 'vditor/src/index'

// Task 453 — migrated harness for the mode round-trip contract (originally
// test/vscode-e2e/mode-roundtrip.spec.ts, task 190 P0): switching edit modes must not corrupt or
// lose content. Vditor serializes differently per mode (VditorIRDOM2Md / VditorDOM2Md / raw
// textContent), so an ir → wysiwyg → sv → ir round-trip re-parses the document three times.
//
// This is the SAME canonical torture fixture as the real-VS-Code original
// (test/vscode-e2e/fixtures/torture.md), inlined here rather than read from disk — it exercises
// every common block type in normalized form (nothing for Lute to "fix" on re-parse) so the
// return to IR must reproduce the original serialization byte-for-byte. Pure Vditor + Lute, no
// host API touched, so the fixture and the round-trip logic port unchanged; only the mode-switch
// mechanism (`document.querySelector('.vditor-toolbar button[data-mode=…]').dispatchEvent(...)`)
// needed `toolbar: ['edit-mode']` explicitly configured — the harness's other mode-switching
// spec (scrolljump.spec.ts) uses a real Playwright `.click()`, which requires opening the
// edit-mode dropdown first because it needs the target to be visible; a synthetic
// `dispatchEvent` (same as the real-VS-Code original used) fires the handler regardless of
// visibility, so no dropdown-open step is needed here either.
const value = `# Torture document

This canonical fixture exercises the common block types in their normalized form so a
mode round-trip (ir → wysiwyg → sv → ir) returns byte-identical. Anchor line ALPHA.

## Prose and inline

A paragraph with **bold**, *italic*, \`inline code\`, and a [link](https://example.com).
Anchor line BRAVO with a second sentence.

## A tight bullet list

- First bullet
- Second bullet
- Third bullet

## An ordered list

1. Step one
2. Step two
3. Step three

## A table

| Name | Count |
| --- | --- |
| Alpha | 1 |
| Beta | 2 |

## A fenced code block

\`\`\`ts
const answer = 42
console.log(answer)
\`\`\`

## A blockquote

> Quoted line one.
> Quoted line two.

## An indented code block (task 239)

    indented code line
    second indented line

## Reference links with titles (task 240)

See [the reference][ref] and ![the image][imgref].

[ref]: https://example.com "Ref Title"
[imgref]: pic.png 'Image Title'

---

Closing paragraph. Anchor line ZULU.
`

const editor = new Vditor('app', {
  cache: { enable: false },
  mode: 'ir',
  cdn: `${location.origin}/vditor`,
  value,
  toolbar: ['edit-mode'],
  customWysiwygToolbar: () => {},
  after() {
    ;(window as any).vditor = editor
    ;(window as any).__switchMode = (mode: string) => {
      const btn = document.querySelector(
        `.vditor-toolbar button[data-mode="${mode}"]`,
      )
      if (!btn) throw new Error(`mode button not found: ${mode}`)
      btn.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    }
    ;(window as any).__ready = true
  },
})
