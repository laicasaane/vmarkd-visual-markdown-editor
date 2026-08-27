# Task 459 — Keyboard parity for diagram zoom and the callout popover

**Status:** 🟢 CLOSED (implemented 2026-07-31; reconciled 2026-08-28) — callout focus entry and the
static-SVG/Markmap/Leaflet keyboard-zoom matrix are complete and verified in the real webview.
ECharts mindmap `+`/`−` is implemented but lacks focused real-webview evidence, and its `0` reset is
a documented no-op; task 244's Project Owner-directed closure accepts that exception rather than
claiming the full matrix shipped. The separate Leaflet Infinity-zoom bug found here was later fixed
by task 479.

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

- [x] `+` / `−` / `0` on focused static-SVG, Markmap, and Leaflet wrappers, at parity with their
      existing zoom authorities (`diagram-zoom-gate.ts` owns the gated-engine interaction contract,
      so the keyboard path must respect it rather than bypass it).

      **RESOLVED 2026-07-31.** Diagnosed and fixed the `geoFocused` failure; root-caused a second,
      independent bug the same spec surfaced once focus was fixed.

      **Diagnosis (measured, not assumed — added temporary `activeTag`/`activeClass`/`activeInsideWrap`
      diagnostics to the spec, ran once, then removed them once confirmed):**
      Leaflet's own `Map.Keyboard` handler (default `keyboard: true`) does two things at map creation
      unconditionally: sets `tabIndex="0"` on its own `.leaflet-container` div, and binds a `mousedown`
      listener directly on that div which — whenever the container isn't already focused — calls
      `this._map._container.focus()`. `diagram-zoom-gate.ts`'s document-CAPTURE Ctrl+mousedown handler
      focuses our wrapper *first* (capture runs before target-phase listeners), but Leaflet's own
      listener then runs at target phase and re-focuses its inner container div a moment later — this
      is confirmed against the vendored `media-src/vendor/leaflet/leaflet.js` source (`_onMouseDown`)
      and by instrumenting the real webview: `document.activeElement` came back
      `<div class="leaflet-container …">`, not the wrapper. This is case **(a)/(c)** from the brief's
      hypothesis: Leaflet both builds its own focus-stealing DOM AND competes for the focus gesture; it
      also gives its container a real Tab stop, contradicting task 457's decision that diagram content
      is click/Ctrl-focusable but never a Tab stop. Because `.leaflet-container` is still a *descendant*
      of the wrapper, `gatedDiagram()`'s `.closest()` walk would still have resolved the wrapper either
      way — so the keyboard zoom mechanism itself was never structurally broken, but the focus
      invariant every other gated engine keeps (`document.activeElement === wrapper`) was, plus the
      stray real Tab stop was a genuine, separate a11y regression.

      **Fix:** `keyboard: false` in the `L.map(div, {…})` options (`initLeafletMap`,
      `media-src/src/diagrams/engines/geojson-topojson.ts`). We already reach Leaflet's own
      `zoomIn()`/`zoomOut()`/`setView()` API for `+`/`-`/`0` (`diagram-zoom-keys-gated.ts`), so
      Leaflet's built-in keyboard handler is a redundant, competing authority — disabling it removes
      the focus-stealing and the stray tab stop in one step. **Trade-off, stated not hidden:** this also
      turns off Leaflet's own arrow-key panning. That was never reachable through this app's focus model
      anyway (nothing tabs into diagram content per 457), so nothing user-facing is lost, but it's a
      deliberate choice worth the lead knowing about.

      **Second bug found by the same spec, after the focus fix:** with `geoFocused` passing,
      `geoZoomAfterPlus` still came back equal to `geoZoomBefore` — Leaflet's `zoomIn()`/`zoomOut()`
      schedule the actual `_zoom` reassignment via `requestAnimationFrame` (`_tryAnimatedZoom` → rAF →
      `_animateZoom` → `_move`, confirmed in the vendored source), not synchronously; reading
      `getZoom()` in the same tick as the keypress races that rAF. Fixed in the spec only (not product
      code) with a bounded poll-until-changed helper (`settleZoom`, ~20ms interval, 1s timeout) —
      no fixed sleep, and no change to `diagram-zoom-keys-gated.ts`'s actual zoom call (it's correct;
      only the TEST's read timing was wrong).

      **Also found and separately flagged (NOT fixed here — out of scope for keyboard-focus parity):**
      the original fixture used a single-Point geojson (`{"type":"Point","coordinates":[0,0]}`), whose
      zero-area bounding box makes Leaflet's `fitBounds()` compute an **unbounded (Infinity) zoom**
      when the map has no `maxZoom` configured (confirmed via the vendored `getBoundsZoom`/
      `_getBoundsCenterZoom` source: a zero-width bbox and `getMaxZoom() === Infinity` return `zoom:
      Infinity` directly, no throw, so the existing try/catch around `layer.getBounds()`/`fitBounds()`
      never sees it). `getZoom()` then reports `Infinity`, which serializes to `null` in JSON — this
      showed up as `geoZoomBefore: null` in the diagnostic logs before the fixture was changed. This is
      a real, separate latent bug: any lone-point or duplicate-point geojson/topojson diagram gets a
      degenerate, effectively broken map. Worth its own task; not fixed here since (1) it's product
      code outside this box's scope (keyboard-zoom focus parity), and (2) the fix isn't a one-liner
      without care — a naive `maxZoom` clamp on the map interacts with fitBounds headroom and needs its
      own verification, not a drive-by. The spec's fixture was changed to a ~10°-square Polygon (real
      spatial extent) specifically to avoid masking the keyboard-zoom behaviour under this unrelated
      degenerate state — noted inline in `diagram-zoom-keys.spec.ts`'s header comment so it doesn't
      read as test-fudging.

      **Verification:** `xvfb-run -a npm --prefix test/vscode-e2e test -- diagram-zoom-keys.spec.ts
      --repeat-each=3` → 3/3 passed, identical zoom values every run (`geoZoomBefore: 5.190459360884907`,
      `geoZoomAfterPlus: 6.190459360884907`, back to `5.190459360884907` after `-`/`0`). `npm test`
      2553/2553 (new unit test in `geojson-topojson.test.ts` asserting `opts[0].keyboard === false`).
      `npm run lint:ci` clean (exit 0). `npm run typecheck` clean. `./node_modules/.bin/tsc -p
      tsconfig.json --noEmit` clean. `node build.mjs` green.
- [ ] ECharts mindmap full keyboard parity: `+`/`−` is implemented through the engine's gated wheel
      pipeline but was excluded from the focused real-VS-Code zoom spec, and `0` is a no-op because
      no retained engine instance exposes a known reset state. Accepted as a task-244 closure
      exception on 2026-08-28; this checkbox remains open so the record does not imply delivery.
- [x] The callout popover's controls are reachable by keyboard once the callout has focus (via
      `Ctrl/Cmd+Enter` on the caret, unified with the link chord — see RESOLVED above). The
      implementation also dismisses with Escape, but the real-VS-Code spec proves focus entry and
      unchanged source, not the Escape-return path.

## Verification

L3 real-VS-Code evidence covers callout focus entry plus unchanged source, and keyboard zoom/reset
for static SVG, Markmap, and Leaflet. The original focused zoom spec was later consolidated into
`diagram-render-sweep.spec.ts`; it explicitly excludes ECharts mindmap keyboard zoom. The mindmap
implementation and reset exception are recorded above without overstating that evidence.
