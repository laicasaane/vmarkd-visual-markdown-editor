# Task 242 — BUG: pasted terminal/log text leaks raw ANSI escape bytes into saved markdown

**Status:** planned — BUG · **Impact:** 🟡 med (devs pasting logs) · **Origin:** task 192 §10 (probe-verified)

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
