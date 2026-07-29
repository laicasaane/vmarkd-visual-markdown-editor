# Task 423 — Leaflet's +/- zoom control is hardcoded white, stands out badly on dark themes

**Status:** planned — bug fix, theming · **Impact:** 🟡 medium (visually jarring, every geojson/topojson diagram on a dark theme) · **Origin:** user screenshot, 2026-07-28 (found while visually reviewing task 375's pixel goldens)

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
