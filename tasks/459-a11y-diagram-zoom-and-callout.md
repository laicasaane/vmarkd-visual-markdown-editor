# Task 459 — Keyboard parity for diagram zoom and the callout popover

**Status:** 🟡 IN PROGRESS (2026-07-31) — diagram zoom keys implemented and unit-tested; callout
popover implemented **but on the WRONG CHORD** (see blocker). Agent was stopped mid-task.

> ### ⚠️ BLOCKER — the shipped callout chord contradicts an explicit user decision
>
> `media-src/src/editing/callout-popover-keys.ts` uses **`Ctrl/Cmd+Alt+Enter`** to focus the callout
> popover controls. The implementing agent proposed that chord, the lead escalated it, and the **user
> rejected it on 2026-07-31**, choosing instead: **one chord, `Ctrl/Cmd+Enter`, dispatched by what is
> under the caret** — link → open it, callout → focus the controls. That is Obsidian's model, and it
> avoids both a third modifier and the `Ctrl+Alt` / AltGr collision that matters on a Polish keyboard
> layout (AltGr+key produces ąćęłńóśżź).
>
> The decision was relayed but the agent was stopped before applying it. **The code is committed
> because it is tested and green, NOT because the chord is accepted — do not read its presence as
> approval.**
>
> **To finish:**
> 1. Build the shared caret-gesture dispatcher: ONE capture-phase `Ctrl/Cmd+Enter` listener with a
>    registration API (`registerCaretGesture(match, handle)` — handlers tried in order, first truthy
>    wins, collapsed-selection-only). It does **not** exist yet; `grep registerCaretGesture` returns
>    nothing. Task 457 owned it and was stopped before writing it.
> 2. Place it in a module neutral to both callers (`editing/` or `util/`), **not** `links/`: an
>    `editing -> links` edge needs an allowlist entry, and task 460's standing rule is to move the
>    file rather than widen the allowlist. Re-run `test/backend/module-boundaries.test.ts` after.
> 3. Re-register `link-click-fix.ts`'s Ctrl/Cmd+Enter handler (already correct — see ~line 177) and
>    `callout-popover-keys.ts` against it, and drop the `altKey` requirement.
> 4. Register the single chord as a VS Code command with a keybinding contribution (457 decision 4).
>
> Escape-to-dismiss on the popover is unaffected by this and is fine as implemented.

· **Impact:** 🟡 medium · **Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem

Diagram zoom is Ctrl+wheel / drag only, and the callout popover's `<select>`/`<input>` are reachable
only after mouse focus.

## Scope

- [ ] `+` / `−` / `0` on a focused diagram wrapper, at parity with the Ctrl+wheel gate
      (`diagram-zoom-gate.ts` owns that gate — the keyboard path must respect the same
      Ctrl-to-interact contract, not bypass it).
- [ ] The callout popover's controls reachable by keyboard once the callout has focus, and
      dismissible with Escape.

## Verification

L3 real-VS-Code for both — the zoom gate and the popover are both real-webview behaviours
(the gate exists because of a wheel-hijack that only reproduces there).
