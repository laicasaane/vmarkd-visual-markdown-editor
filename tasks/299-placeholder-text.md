# Task 299 — Placeholder text (empty doc + focused empty block)

**Status:** planned · **Impact:** ⚪ low, cheap win · **Origin:** task 192 §12

## What it is & the effect

Every modern editor greets an empty document with dimmed hint text ("Start writing…") and
shows a per-block hint in the focused empty paragraph ("Type ;; for commands" — Tiptap's
Placeholder extension, BlockNote default). It orients new users and ADVERTISES the
invisible features (our `;;` snippet menu, `[[` wiki links) exactly where they'd be used.

**The embarrassing part, code-verified:** Vditor ALREADY supports the doc-level
placeholder (`Options.ts:52`, rendered at `ir/index.ts:37` as a `pre[placeholder]` attr) —
**we simply never set it** (grep placeholder in vditor-options.ts/main.ts → nothing).
Per-block is pure CSS.

## Scope

- [ ] Doc-level: pass `placeholder` through `buildVditorOptions` from a setting
      (`vmarkd.editor.placeholder`, default "Start writing…", localized via lang.ts);
      shows only when the doc is empty (Vditor's own semantics).
- [ ] Focused-empty-block hint: CSS-only — `:empty::before` on the caret's empty `<p>`
      (class toggled from the existing selectionchange plumbing), text advertising `;;`
      (once 221 lands) / `[[`; dimmed, never selectable, ZERO DOM injection so inherently
      Lute-safe.
- [ ] Both theme-aware; suppressed in Preview/sv-right; per-block hint off by default?
      — no: ON, it only shows in the one focused empty paragraph (not noisy); setting to
      disable both.

## Out of scope

- Per-block-TYPE placeholders (empty heading → "Heading"…) — add only if free in the same
  CSS; onboarding tours.

## Verification

L1: options plumb (last-merge rule per the saved-options memory). L2: empty doc shows
doc placeholder, typing hides it; caret in empty paragraph shows the hint, text removes
it; `getValue()` untouched by both. L3 real-VS-Code: rendering under injected CSS (the
attr-based placeholder is styled by Vditor CSS — verify our theme doesn't fight it).
