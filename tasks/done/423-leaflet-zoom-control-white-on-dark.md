# Task 423 — Leaflet's +/- zoom control is hardcoded white, stands out badly on dark themes

**Status:** ✅ **DONE (2026-07-30)** — pending the user's own eyes (see Verification) · **Impact:** 🟡 medium (visually jarring, every geojson/topojson diagram on a dark theme) · **Origin:** user screenshot, 2026-07-28 (found while visually reviewing task 375's pixel goldens)

## Result

A `main.css` override per ADR-0003 (our CSS over a vendored library's hardcoded colours — Leaflet is
not Vditor, so no source patch). Colours come from **VS Code's own widget tokens**
(`--vscode-editorWidget-background/-foreground/-border`, `--vscode-toolbar-hoverBackground`,
`--vscode-disabledForeground`, `--vscode-textLink-foreground`) rather than hand-picked values —
which is what keeps LIGHT correct rather than merely un-broken. The hardcoded white/black IS right
on light; a dark-only swap would have fixed the screenshot and silently broken the other half.
`!important` is required: leaflet.css sets these at equal specificity and loads after us.

Hover, focus and `leaflet-disabled` are treated too — without them the control reads correctly at
rest and wrong the moment it is used (max/min zoom greys a button).

**Scope check on "is the zoom control the only offender?"** Grepped every hardcoded `#fff`/`white`
in `leaflet.css` and traced each against what vMarkd actually constructs. Reachable: the zoom
control (always on) and the **attribution control** (added only alongside a remote basemap) — both
now themed. Unreachable, deliberately left alone: the layers control, popups, tooltips and
div-icons; `initLeafletMap` never constructs any of them, so their `#fff` rules cannot render.

**Verified red-then-green** in the real webview: `test/vscode-e2e/leaflet-chrome-theme.spec.ts`
asserts BOTH themes in one boot, relationally (the control's background luminance flips with the
editor, text contrasts against it in each) rather than pinning a colour value that a VS Code release
could change. With the rules removed it fails 3/3 with a measured background luma of 255 — pure
Leaflet white. It must be a REAL-webview test: in the chromium harness the `--vscode-*` tokens are
undefined and every rule falls back to the Leaflet default it exists to replace, so a harness test
would assert the bug.

**Still owed:** the user's visual confirmation in their own editor per this task's own origin — a
code-only check can prove "not white any more", only a screenshot can prove "looks right". No
`@visual` golden was added; task 375's geojson goldens do not isolate this control.

## Problem

Every geojson/topojson diagram gets a Leaflet map (`media-src/src/diagram-engines/geojson-topojson.ts:88-89`, `L.map(div, { zoomControl: true, ... })`) with Leaflet's default zoom control (the stacked `+`/`−` buttons, top-left). The vendored, unpatched `media-src/vendor/leaflet/leaflet.css:284-322` (`.leaflet-bar`, `.leaflet-bar a`) hardcodes:

```css
.leaflet-bar a {
  background-color: #fff;
  color: black;
  border-bottom: 1px solid #ccc;
}
.leaflet-bar a:hover, .leaflet-bar a:focus { background-color: #f4f4f4; }
.leaflet-bar a.leaflet-disabled { background-color: #f4f4f4; color: #bbb; }
```

`main.css` has **zero** `leaflet-*` rules (grepped, confirmed empty) — nothing overrides this. On
a dark theme the control renders as a stark white box, exactly as in the user's screenshot: a
bright white rounded rectangle sitting on an otherwise fully-dark diagram pane. This is the same
class of bug as task 381 (D2 sql_table/class chrome too bright on dark) — vendored/library-default
chrome that was never re-themed for vMarkd's dark palettes.

## Scope

- [ ] Theme `.leaflet-bar` / `.leaflet-bar a` (and the hover/disabled states) in `main.css`, using
      `--vmarkd-*` tokens per the ADR-0003 routing rule (this is OUR CSS overriding a vendored
      library's hardcoded colours — a `main.css` override is the correct mechanism here, not a
      Vditor source-patch, since Leaflet isn't Vditor; see ADR-0003's four-mechanism table).
      Candidate tokens: background → a panel/chrome background token (check what D2/PlantUML
      chrome theming — task 381/382 — already established as the "chrome" surface colour), text/
      icon colour → foreground token, border → the existing border token.
- [ ] Check `.leaflet-bar` other states while in there: `:hover`/`:focus` background, and the
      `leaflet-disabled` state (greyed-out zoom-in at max zoom / zoom-out at min zoom) — these all
      need matching dark-theme treatment, not just the base state, or the fix will look right at
      rest and wrong on hover/disabled.
- [ ] Check whether Leaflet ships any OTHER default-white chrome for this map (attribution control
      corner text, any other `leaflet-control-*`) that has the same problem — the screenshot only
      shows the zoom control, but don't assume it's the only offender; grep `leaflet.css` for other
      hardcoded `#fff`/`background-color: white` rules reachable from vMarkd's usage (zoomControl
      is the only control enabled per the `L.map()` call above, but confirm no others are
      implicitly on by Leaflet's own defaults).
- [ ] Verify this needs to work across BOTH light and dark vMarkd themes, not just fix dark and
      accidentally break light (the current hardcoded white/black IS correct for light — a naive
      token swap must resolve to white-ish on light, not always-dark).

## Out of scope

- Any other geojson/topojson visual issue (basemap tile theming, marker/path colours — those
  already have their own theming path per `theme.geoBasemap` and the content-theme retheme
  pipeline; this task is scoped to the zoom CONTROL chrome only).
- Leaflet version/library changes.

## Verification

- [ ] Real-VS-Code e2e (webview-affecting CSS change, per AGENTS.md) — extend or add to the
      geojson/topojson render coverage: open a geojson doc on a dark theme, assert the zoom
      control's computed background/text colour is NOT the Leaflet-default white/black.
- [ ] Visual check on at least one light and one dark vMarkd theme (github, vscode-dark-2026, or
      whatever the existing D2/PlantUML chrome-theming tasks used as their reference set) — this
      is exactly the kind of fix that needs the user's eyes before calling it done (per this
      task's own origin: a code-only check can't catch "still looks bad", only a screenshot can).
- [ ] `npm run test:visual` if a golden exists for geojson/topojson (task 375's own pixel-golden
      work may already have a fixture covering this control — check before adding a new one).
