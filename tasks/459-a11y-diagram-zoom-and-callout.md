# Task 459 — Keyboard parity for diagram zoom and the callout popover

**Status:** 🟡 IN PROGRESS (2026-07-31) — diagram zoom keys implemented and unit-tested; callout
popover keyboard reach DONE, on the DECIDED unified chord (see below). Diagram-zoom-keys wiring
(scope item 1) is out of scope for this pass and still needs its own verification.

## RESOLVED 2026-07-31 — chord unification (was: ⚠️ BLOCKER)

The callout popover originally shipped on `Ctrl/Cmd+Alt+Enter`, a chord the user explicitly
rejected the same day in favour of **one chord, `Ctrl/Cmd+Enter`, dispatched by what is under the
caret** — link → open it, callout → focus the controls (Obsidian's model; avoids both a third
modifier and the `Ctrl+Alt`/AltGr collision on a Polish keyboard layout, AltGr+key producing
ąćęłńóśżź). That unification is now done:

1. **Shared caret-gesture dispatcher** — `media-src/src/util/caret-gesture.ts`. One capture-phase
   `keydown` listener for exactly `Ctrl/Cmd+Enter` (no Alt, no Shift), plus
   `registerCaretGesture(match: (node: Node|null) => HTMLElement|null, handle: (el: HTMLElement) =>
   boolean): () => void`. Handlers tried in REGISTRATION order, first `match`+`handle` both truthy
   wins and the event is consumed (`preventDefault` + `stopImmediatePropagation`); no match at all
   leaves the event untouched, for Vditor/the browser. `handle` returning `false` (matched but not
   actionable) falls through to the next registration instead of stopping dispatch.
   `runCaretGestureHandlers()` runs the same dispatch without a `KeyboardEvent`, for the VS Code
   command trigger (message-router.ts has no event to derive modifiers from).
2. **Placement:** `util/`, not `links/` or `editing/` — both callers already have an allowed edge to
   `util/` (`links->util`, `editing->util`), so this needed **zero** new entries in
   `test/backend/module-boundaries.test.ts`'s allowlist (verified: `manifest is total and disjoint`
   + all 4 boundary assertions green). Also added to `WEBVIEW_MODULES.util.ids` in
   `scripts/module-manifest.mjs`.
3. **Both callers migrated:** `links/link-click-fix.ts` registers `(linkLikeAt,
   activateLinkAtCaret)`; `editing/callout-popover-keys.ts` registers `(calloutBlockquoteAt,
   focusCalloutPopover)` (its `altKey` requirement is gone). Registration order is load-bearing, not
   incidental: `fixLinkClick()` runs at module scope from `boot/main.ts` (before any document loads),
   `installCalloutPopoverKeys()` registers later, per re-init, from `finish-init.ts` — so a
   link-like element nested inside a callout blockquote (e.g. a wiki chip in a `[!TIP]`) resolves
   the LINK, not the containing callout, which is the correct "activate the more specific target"
   precedence. Covered by `media-src/src/util/caret-gesture-precedence.test.ts` (uses the two real
   modules, not synthetic stubs). Escape-to-dismiss on the popover is unchanged — separate chord,
   not routed through the dispatcher.
4. **VS Code command:** `vmarkd.activateLinkAtCaret` + its `Ctrl/Cmd+Enter` keybinding already
   existed from task 457 — kept the command/message id (`vmarkd.activateLinkAtCaret` /
   `activate-link-at-caret`) rather than renaming (would touch a passing e2e for no functional gain);
   retitled to "Activate Link or Callout at Caret" and its handler now calls
   `runCaretGestureHandlers()` instead of `activateLinkAtCaret()` directly, so the command trigger
   covers callouts too, not just links.

**Verification:** unit — `media-src/src/util/caret-gesture.test.ts` (registration order,
fall-through, collapsed-only, disposer), `media-src/src/util/caret-gesture-precedence.test.ts`
(link-vs-callout precedence with the real modules), `media-src/src/editing/callout-popover-keys.test.ts`
(rewritten for the shared dispatcher + the old Ctrl+Alt+Enter chord confirmed dead), all green.
Real-VS-Code e2e — `test/vscode-e2e/callout-popover-keys.spec.ts` (new: WYSIWYG, polls for the
popover's `.vmarkd-callout__type` select to appear, `Ctrl+Enter` focuses it, `getValue()` +
underlying document text asserted unchanged throughout) and `test/vscode-e2e/wiki-chip-focus.spec.ts`
(both existing tests re-run green after the migration — link activation via both the webview
listener and the VS Code command still work). Gates: `npm test` 2552/2552, `npm run lint:ci` clean,
`npm run typecheck` clean, `./node_modules/.bin/tsc -p tsconfig.json --noEmit` clean, `node build.mjs`
green, `test/backend/module-boundaries.test.ts` 7/7.

· **Impact:** 🟡 medium · **Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem

Diagram zoom is Ctrl+wheel / drag only, and the callout popover's `<select>`/`<input>` are reachable
only after mouse focus.

## Scope

- [ ] `+` / `−` / `0` on a focused diagram wrapper, at parity with the Ctrl+wheel gate
      (`diagram-zoom-gate.ts` owns that gate — the keyboard path must respect the same
      Ctrl-to-interact contract, not bypass it).
- [x] The callout popover's controls reachable by keyboard once the callout has focus (via
      `Ctrl/Cmd+Enter` on the caret, unified with the link chord — see RESOLVED above), and
      dismissible with Escape.

## Verification

L3 real-VS-Code for both — the zoom gate and the popover are both real-webview behaviours
(the gate exists because of a wheel-hijack that only reproduces there).
