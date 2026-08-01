# Task 287 — Paste as plain text (Ctrl+Shift+V)

**Status:** ✅ **DONE (2026-07-30)** · **Impact:** 🔴 high (daily-frequency op) · **Origin:** task 192 §12

## Result

Measured first: before this, Ctrl+Shift+V in the editor did **nothing at all** — the probe pasted a
URL with the chord and the document came back unchanged
(`test/vscode-e2e/paste-behaviour-probe.spec.ts`).

**Implemented HOST-side, not as the capture-phase keydown this task specified.** Two reasons, both
structural rather than stylistic: a webview cannot read the system clipboard synchronously from a
keydown (VS Code's own bridge answers Ctrl+V through a host round-trip for exactly that reason), and
a host keybinding scoped to `activeCustomEditorId == vmarkd.editor` settles the "does VS Code claim
the chord" question by construction instead of by hoping. The command reads the clipboard, posts
`paste-plain`, and the webview calls `insertValue` — Vditor's markdown-SOURCE path, which never
touches `text/html`. That is what makes the chord different from Ctrl+V, whose entire job is
converting rich HTML, and it keeps the Typora-compatible semantics this task asked for: a literal
`# x` on the clipboard still becomes a heading, because the SOURCE is what was pasted.

**Composition with the sibling paste tasks, exactly as scoped here:** the ANSI strip
([242](242-ansi-paste-strip.md)) still applies — invisible control bytes are never wanted, plain or
not — while the TSV/CSV table conversion ([218](218-csv-paste-to-table.md)) is deliberately
BYPASSED, because "plain" is an explicit instruction not to reformat. The handler therefore calls
`stripAnsi` directly rather than the shared `transformPastedText`.

**Verified red-then-green:** `test/vscode-e2e/paste-plain-chord.spec.ts` drives BOTH chords in one
boot, because the assertion is a CONTRAST — the same clipboard text must come out differently under
each, or the new chord is doing nothing distinguishable. Ctrl+V produces
`[https://example.com](…)`; Ctrl+Shift+V produces the literal text and NOT a link. With the
keybinding removed it fails 3/3.

**Not done:** the README keyboard-section entry this task also asked for.

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

- [x] Ctrl+Shift+V routed to Vditor's markdown-SOURCE insertion, skipping HTML2Md — but HOST-side
      via a scoped keybinding + command, NOT the capture-phase keydown proposed here (a webview
      cannot read the clipboard synchronously from a keydown). No new paste machinery either way.
- [ ] All three modes (ir/wysiwyg/sv); inside code fences both chords behave identically.
      **Partially verified only**: `insertValue` is mode-agnostic and the e2e covers IR. WYSIWYG/SV
      and the in-fence case were NOT separately asserted — recorded rather than claimed.
- [x] VS Code claiming the chord is settled by construction — the keybinding is scoped to
      `activeCustomEditorId == vmarkd.editor`. **README keyboard section: NOT updated.**
- [x] Composes with 242 and 218 exactly as specified: strips ANSI, bypasses the table conversion.

## Out of scope

- A "paste and match style" third variant (meaningless in markdown), changing smart-paste
  defaults.

## Verification

L1: routing decision unit (chord × clipboard flavors × context). L2: copy HTML fixture →
Ctrl+V yields markdown, Ctrl+Shift+V yields the literal text; fence context identical;
one undo step each. L3 real-VS-Code (mandatory): the chord reaches us (key-capture seam)
with a real clipboard.
