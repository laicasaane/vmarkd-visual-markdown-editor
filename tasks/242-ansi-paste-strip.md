# Task 242 — BUG: pasted terminal/log text leaks raw ANSI escape bytes into saved markdown

**Status:** ✅ **DONE (2026-07-30)** · **Impact:** 🟡 med (devs pasting logs) · **Origin:** task 192 §10 (probe-verified)

## Result

Re-confirmed live before fixing: a real Ctrl+V of a coloured log line put **4 raw ESC bytes** into
the document (`test/vscode-e2e/paste-behaviour-probe.spec.ts`).

**The hook is NOT the capture-phase paste listener this task asked for, and deliberately so.** A
paste event's `clipboardData` is read-only, so a capture-phase listener can only `preventDefault()`
and insert the text itself — which bypasses Vditor's entire paste pipeline (code-fence handling, the
HTML-vs-plain decision, undo grouping, the edit post). Instead `textPlain` is rewritten at the ONE
point Vditor reads it, via a one-line esbuild patch (`patchPasteTransform`, following task 392's
`__vmarkdPasteUrlMd` precedent). Everything downstream is untouched and simply sees cleaner input.
This is the shared hook 218 was told to build once — `transformPastedText` is the single entry point,
with ANSI stripping ordered first so a later CSV sniff reads repaired text.

The stripper is table-driven and exported per this task's ask, over **named ECMA-48 classes** rather
than one opaque regex: CSI, OSC, Fe, nF. `nF` was not in the first draft — a unit test written
against the *wrong* class (`ESC ( B` labelled as Fe) failed and exposed the real gap, which is why
`script`-capture charset designations are now covered. The Fs range (`ESC c` and friends) is
deliberately **left alone**: a lone ESC before an ordinary letter is far more often stray data than a
reset, and silently eating bytes is the exact failure mode this fix exists to prevent.

`vmarkd.paste.ansi`: `strip` (default) | `keep`, resource-scoped, applied live (no reopen).

**Deliberately NOT built:** the `ask` value and the "paste as code block" toast. A modal choice on
every log paste is a worse default than a silent, correct repair, and nothing about the strip is
lossy in a way a user would want to review. Recorded here rather than half-implemented.

**Verified red-then-green:** L1 `paste-transform.test.ts` (17 cases — the strips, plus guards that
tabs/newlines survive for 218, that a lone unrecognised ESC survives, that the global-regex
`lastIndex` bug cannot make a repeated `hasAnsi` call answer differently, and that an unknown
setting value falls back to repairing rather than disabling); L1 `vditor-source-patches.test.ts`
(5 cases — the hook runs BEFORE any paste branch, the drag-drop `dataTransfer` branch is left
unhooked, absence of the hook falls back to raw text, version drift throws); L3
`test/vscode-e2e/paste-ansi.spec.ts` with the real clipboard and a real keystroke, asserting the
DOCUMENT (the complaint is about bytes reaching disk). With the strip disabled it fails 3/3.

## Problem

Probe-confirmed: Lute round-trips ESC (`0x1B`) verbatim — `Md2VditorIRDOM('\x1b[31mred\x1b[0m')`
keeps the raw bytes and they land in the saved file. All three paste paths feed text/plain
straight through (prose: vendored `fixBrowserBehavior.ts:1466,1470`; code-block splice
`:1391`; sv insertHTML `:1384`). Terminal emulators strip ANSI on copy, but log FILES and
`script` captures don't — invisible control bytes corrupt diffs and downstream renderers.

## Scope

- [ ] Capture-phase paste hook (the established pattern): when text/plain matches
      `/\x1b\[[0-9;]*[A-Za-z]/`, strip SGR/CSI sequences before Vditor sees the payload.
- [ ] Nicety: on ANSI detection offer "paste as code block" (small toast/choice, setting
      `vmarkd.paste.ansi`: `strip | ask | keep`, default `strip`).
- [ ] Keep the stripper table-driven and exported — task 218's CSV detector shares the same
      pre-Vditor hook point; build the hook once (coordinate scopes).

## Out of scope

- Rendering ANSI colours as spans (a converter feature, not fidelity), stripping other
  control chars beyond ESC sequences (BEL/CR handling only if trivially co-located).

## Verification

L1: stripper unit (SGR, cursor CSI, OSC titles, mixed content, no-ANSI passthrough).
L2: synthetic paste with ANSI (paste-pipeline harness) → `getValue()` clean in ir/wysiwyg/sv
and inside a code fence. L3: one real-VS-Code leg — clipboard with ESC bytes → disk clean.
