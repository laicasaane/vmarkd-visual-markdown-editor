# Task 254 — Heading promote/demote (level shift, single or whole section)

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §10

## Problem

Restructuring means retyping `#`s per heading: Vditor's toolbar changes ONE heading with
no keybinding, nothing shifts a section subtree, and task 222 explicitly excluded level
change from its scope. MAIO ships Ctrl+Shift+]/[.

## Scope

- [ ] Webview keybinding (capture-phase pattern) Ctrl+Shift+] / [ — caret in a heading →
      shift that heading's level; with a SELECTION spanning a section (or a modifier
      variant) → shift the whole subtree (reuse task 222's section engine to find it),
      ONE model edit + one undo step.
- [ ] Guards: clamp at h1/h6 — a subtree shift that would push any member past the clamp
      is refused with a toast (no partial shifts); setext headings converted to ATX on
      shift (pin it).
- [ ] Surface also as commands (palette + task 215 context menu) for discoverability.

## Out of scope

- Drag-based level change (222's out-of-scope stays), auto-renumber interplay (250's
  write-back command is re-run manually).

## Verification

L1: shift-engine units (clamp refusal, setext, subtree boundaries, mixed levels).
L2: keybinding in ir/wysiwyg/sv → `getValue()` exact, caret kept, one undo restores.
L3: real-webview chord (key-capture seam) + save fidelity.
