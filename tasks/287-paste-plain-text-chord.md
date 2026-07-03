# Task 287 — Paste as plain text (Ctrl+Shift+V)

**Status:** planned · **Impact:** 🔴 high (daily-frequency op) · **Origin:** task 192 §12

## What it is & the effect

The universal "paste without formatting" chord (Typora: Ctrl+Shift+V, Craft: Cmd+Shift+V,
every browser/office app). Vditor's paste handler ALWAYS preventDefaults and prefers
`text/html` → `lute.HTML2Md` (`fixBrowserBehavior.ts:1258/1429`) — there is no plain
branch the user can choose.

**Effect today:** copying from a web page/Slack/Word ALWAYS pastes converted rich markdown
(headings, bold, links) even when you wanted just the words; the only workaround is
pasting through an external plain editor.
**After:** Ctrl+V = smart paste (unchanged), Ctrl+Shift+V = the literal `text/plain`
characters (still spun as markdown SOURCE — so pasting literal `# x` text intentionally
still makes a heading, which is the correct Typora-compatible semantics).

## Scope

- [ ] Capture-phase Ctrl+Shift+V keydown (the established key-capture pattern): read
      `clipboardData` text/plain and route it through Vditor's EXISTING plain-text branch
      (`processPaste`/the `:1474` textPlain path), skipping HTML2Md — no new paste
      machinery.
- [ ] All three modes (ir/wysiwyg/sv); inside code fences both chords behave identically
      (literal — the 191 P0-9 contract).
- [ ] Verify VS Code doesn't claim the chord over a focused custom-editor webview (its
      default binding is text-editor-scoped); document in the README keyboard section.
- [ ] Composes with task 242 (ANSI strip) and 218 (CSV detect) — the plain chord runs
      AFTER the ANSI strip, BYPASSES the CSV conversion offer (explicitly plain).

## Out of scope

- A "paste and match style" third variant (meaningless in markdown), changing smart-paste
  defaults.

## Verification

L1: routing decision unit (chord × clipboard flavors × context). L2: copy HTML fixture →
Ctrl+V yields markdown, Ctrl+Shift+V yields the literal text; fence context identical;
one undo step each. L3 real-VS-Code (mandatory): the chord reaches us (key-capture seam)
with a real clipboard.
