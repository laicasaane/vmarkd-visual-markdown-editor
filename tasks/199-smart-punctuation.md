# Task 199 — Smart punctuation (curly quotes, em-dash, ellipsis)

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §2

## Problem

Typora auto-substitutes `"" '' — …` as you type. Lute (the vendored engine) has **no
SmartyPants pass** (verified — no markdown option exists for it), so this must be an
input-time transform in our code, not a config flag.

## Scope

- [ ] Setting `vmarkd.editor.smartPunctuation` (default off). Transform on `beforeinput`
      (insertText): `--`→`–`, `---`→`—`, `...`→`…`, context-aware straight→curly quotes.
- [ ] Context guards: NEVER inside code (fenced/inline/sv raw), math, diagram source panes,
      front-matter, link URLs. Reuse the block-context detection the paste pipeline uses.
- [ ] Undo-friendly: the substitution must merge into the same undo step as the typed char
      (or be a single separate step — pick whichever Vditor's undo stack does cleanly and
      pin it in tests).
- [ ] The transform edits the markdown SOURCE characters (they round-trip as literal `…—`
      unicode in the file) — document that in the setting description.

## Out of scope

- Locale-specific quote styles (`«»`, `„"`) v1 — hardcode English curly; leave a setting
  enum for later. Retroactive document conversion.

## Verification

- L1: transform function unit — full substitution table, context-guard matrix.
- L2: type sequences in ir/wysiwyg/sv prose → substituted; in code fence → literal;
  one undo step behaviour pinned; `getValue()` carries the unicode.
- L3 real-VS-Code (mandatory): typing path on the real webview (key capture seam) + save
  to disk bytes.
