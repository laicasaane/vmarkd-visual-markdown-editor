// GeoJSON / TopoJSON (Leaflet) — task 409, split out of custom-diagrams.ts's god-module into its
// own engine file. Both languages share ONE Leaflet load + map-init path (topojson additionally
// needs the topojson-client bundle to convert to GeoJSON first), so they live in one file rather
// than two — mirroring the vega/vega-lite pairing.
import { getD2Config } from '../../diagram-kit/d2-config'
import { renderDiagramLoadError } from '../../diagram-kit/diagram-error'
import {
  findBlocks,
  getCdn,
  resetCustomBlocks,
} from '../../diagram-kit/diagram-dom'
import { loadScript } from '../../util/load-script'

declare const window: Window & {
  L?: any
  topojson?: {
    feature: (topology: any, object: any) => any
  }
}

// addStylesheet is synchronous/void by design, NOT a race risk like a script load (task 407):
// nothing awaits it or reads a global it's supposed to populate, so an existing-tag short
// circuit here can never observe a half-applied stylesheet the way addScript could observe a
// half-executed script.
function addStylesheet(href: string, id: string): void {
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

// Basemap tile source for a geojson/topojson map, chosen by the `diagram.geo.basemap` setting (task 99 +
// the setting). `auto` (default) is the THEMED MONOCHROME CARTO basemap (Positron light / Dark Matter
// dark) — a neutral backdrop so the data stands out; it flips with the editor mode. `voyager`/`osm`
// are colored; `none` (and any unknown value handled by the default arm is `auto`, NOT none) → no
// basemap. All non-null sources are remote `https:` tiles, so they only load when allowRemoteImages is
// on (CSP). `{r}` is Leaflet's retina token (→ '' unless detectRetina); OSM has no retina tiles so its
// URL omits it. Exported for the unit test. Keep in sync with the package.json enum.
export interface Basemap {
  url: string
  subdomains: string
  maxZoom: number
  attribution: string
}
const CARTO_ATTR = '© OpenStreetMap contributors © CARTO'
export function basemapFor(
  setting: string | undefined,
  dark: boolean,
): Basemap | null {
  switch (setting) {
    case 'none':
      return null
    case 'voyager':
      return {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: CARTO_ATTR,
      }
    case 'osm':
      return {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }
    default: {
      // 'auto' (and any unknown value) → themed monochrome CARTO, per editor mode (current default).
      const variant = dark ? 'dark_all' : 'light_all'
      return {
        url: `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}{r}.png`,
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: CARTO_ATTR,
      }
    }
  }
}

// Task 479: a single-point map (one Point feature, several Points at identical coordinates, or a
// LineString whose points all coincide) has bounds with ZERO AREA — northEast === southWest. Fed to
// fitBounds(), Leaflet's getBoundsZoom() computes a zoom of `Infinity` for a zero-size box (confirmed
// against the vendored leaflet.js), and — the part that made this hide for so long — it RETURNS that,
// it does not throw, so the existing try/catch below never saw it. `bounds.isValid()` doesn't help:
// it only checks southWest/northEast EXIST, not that they differ. Exported for the unit test.
export function isDegenerateBounds(bounds: {
  isValid: () => boolean
  getNorthEast: () => { equals: (other: unknown) => boolean }
  getSouthWest: () => unknown
}): boolean {
  return bounds.isValid() && bounds.getNorthEast().equals(bounds.getSouthWest())
}

// Fallback zoom for the degenerate (zero-area) case, picked with setView() instead of fitBounds().
// 12 is a "city/neighborhood" zoom in Leaflet's convention (0 = whole world, ~19 = building) — close
// enough to be a useful view of a single point, not so close it reads as an arbitrary max-zoom clamp
// (which is exactly the maxZoom approach 459 tried and backed out, see task 479).
const DEGENERATE_POINT_ZOOM = 12

// Exported for unit testing the map OPTIONS (the render itself needs a real Leaflet + a laid-out
// container, which is the pixel suite's job).
export function initLeafletMap(wrapper: HTMLElement, geojson: any): void {
  const L = window.L
  if (!L) return

  const div = document.createElement('div')
  div.style.cssText = 'width:100%;height:300px;background:transparent'
  wrapper.innerHTML = ''
  wrapper.appendChild(div)

  const map = L.map(div, {
    // Task 531 supplies one renderer-independent zoom bar; Leaflet's native +/- would be a second
    // competing authority. Attribution remains independently enabled below when a basemap needs it.
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    // Fractional zoom (task 379). Leaflet snaps fitBounds to WHOLE zoom levels by default, and a
    // level is a factor of 2 — so a dataset can be drawn up to half the size the box could show.
    // Measured on the fixture the loss was only 3% (the fit was already near-optimal for a 300px
    // box), so this is a small, safe win, not the reason a map looks small: that is geometry.
    // fitBounds preserves GEOGRAPHIC proportions, so square data in a wide box keeps side margins —
    // correct cartography, and only a box whose shape follows the data would change it (rejected as
    // a layout change: the block would stop having a predictable height).
    zoomSnap: 0,
    // Task 459: Leaflet's OWN Map.Keyboard handler (default on) sets `tabIndex="0"` on the map's
    // inner `.leaflet-container` div AND binds its own `mousedown` listener there that unconditionally
    // calls `this._map._container.focus()` — measured (real VS Code e2e) to fire AFTER our
    // diagram-zoom-gate.ts capture-phase Ctrl+mousedown handler has already focused the WRAPPER,
    // stealing focus back onto the inner container div a moment later. `document.activeElement` ends
    // up on `.leaflet-container` (still a descendant of the wrapper, so gated diagram lookups that
    // walk up via `.closest()` — diagram-zoom-keys-gated.ts's `gatedDiagram()` — still resolve the
    // wrapper), but it breaks the "the wrapper is the focused element" invariant every other gated
    // engine keeps, and it also leaves a STRAY real Tab stop on `.leaflet-container` (tabIndex 0),
    // contradicting task 457's decision that a diagram is click/Ctrl-focusable but never a Tab stop.
    // We supply our own `+`/`-`/`0` keyboard zoom (diagram-zoom-keys-gated.ts's `zoomLeaflet`) via
    // Leaflet's own zoomIn()/zoomOut()/setView() API, so Leaflet's built-in keyboard handler (which
    // would ALSO react to +/-/arrow keys once its container is focused) is a second, competing
    // keyboard authority we don't need — turning it off removes both the focus-stealing and the
    // stray tab stop in one step. Trade-off: this also drops Leaflet's own arrow-key panning, which
    // was never reachable through this app's focus model anyway (nothing tabs into diagram content).
    keyboard: false,
  })

  // Optional remote basemap (task 99): default is geometry-only on a transparent canvas (fully
  // offline). When the user has opted into remote images, add a basemap UNDER the geometry; its style
  // follows the `diagram.geo.basemap` setting (default `auto` = themed monochrome CARTO, picked light/dark
  // per the editor mode — see basemapFor). The CSP only allows `https:` images when
  // `image.allowRemote` is on, so without the opt-in these tiles can't (and won't) be requested;
  // `geoBasemap: none` also skips the basemap (basemapFor → null) even when remote images are allowed.
  if ((window as any).__vmdeAllowRemoteImages) {
    const cfg = getD2Config()
    const basemap = basemapFor(cfg.geoBasemap, cfg.mode === 'dark')
    if (basemap) {
      L.tileLayer(basemap.url, {
        subdomains: basemap.subdomains,
        maxZoom: basemap.maxZoom,
        attribution: basemap.attribution,
      }).addTo(map)
      // OSM/CARTO require visible attribution — re-enable the control we suppressed above.
      L.control.attribution({ prefix: false }).addTo(map)
    }
  }

  const fg = getComputedStyle(wrapper).color || '#3388ff'
  const layer = L.geoJSON(geojson, {
    style: {
      color: fg,
      fillColor: fg,
      fillOpacity: 0.15,
      weight: 2,
    },
    pointToLayer: (_feature: any, latlng: any) =>
      L.circleMarker(latlng, {
        radius: 6,
        color: fg,
        fillColor: fg,
        fillOpacity: 0.4,
      }),
  })
  layer.addTo(map)

  try {
    const bounds = layer.getBounds()
    if (isDegenerateBounds(bounds)) {
      // Zero-area bounds: nothing to "fit" (see isDegenerateBounds above for why fitBounds() would
      // silently produce Infinity here). Center on the point instead, at a fixed, sensible zoom.
      map.setView(bounds.getCenter(), DEGENERATE_POINT_ZOOM)
    } else {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  } catch {
    map.setView([0, 0], 2)
  }
  // Task 459: stash the map instance + its just-fitted view on the WRAPPER so keyboard +/-/0 zoom
  // (diagram-zoom-keys-gated.ts) can call Leaflet's own zoomIn()/zoomOut()/setView() — the real zoom
  // authority, not a second CSS-transform one of our own (which would desync from Leaflet's next real
  // gesture). Keyed off the wrapper (not `div`, which a re-render would replace) so it survives.
  ;(wrapper as HTMLElement & { __vmdeMap?: unknown }).__vmdeMap = map
  ;(
    wrapper as HTMLElement & {
      __vmdeMapInitialView?: { center: unknown; zoom: number }
    }
  ).__vmdeMapInitialView = { center: map.getCenter(), zoom: map.getZoom() }

  wrapper.setAttribute('data-processed', 'true')
}

export function renderGeojson(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'geojson')
  if (!blocks.length) return

  const cdn = getCdn()
  addStylesheet(`${cdn}/dist/js/leaflet/leaflet.css`, 'vditorLeafletCss')
  // loadScript never rejects (its onerror handler resolves too, see load-script.ts) — `void`
  // marks this fire-and-forget deliberately, not an oversight (task 482).
  void loadScript(
    `${cdn}/dist/js/leaflet/leaflet.js`,
    'vditorLeafletScript',
  ).then(() => {
    if (!window.L) {
      renderDiagramLoadError(blocks, 'geojson', 'Leaflet')
      return
    }
    blocks.forEach(({ wrapper, code }) => {
      try {
        const data = JSON.parse(code)
        initLeafletMap(wrapper, data)
      } catch {
        // Invalid JSON — leave source visible
      }
    })
  })
}

export function renderTopojson(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'topojson')
  if (!blocks.length) return

  const cdn = getCdn()
  addStylesheet(`${cdn}/dist/js/leaflet/leaflet.css`, 'vditorLeafletCss')
  // Neither loadScript rejects (see load-script.ts), so Promise.all of them can't either —
  // `void` marks this fire-and-forget deliberately, not an oversight (task 482).
  void Promise.all([
    loadScript(`${cdn}/dist/js/leaflet/leaflet.js`, 'vditorLeafletScript'),
    loadScript(
      `${cdn}/dist/js/topojson/topojson-client.min.js`,
      'vditorTopojsonScript',
    ),
  ]).then(() => {
    if (!window.L || !window.topojson) {
      renderDiagramLoadError(blocks, 'topojson', 'Leaflet and TopoJSON')
      return
    }
    blocks.forEach(({ wrapper, code }) => {
      try {
        const topo = JSON.parse(code)
        const firstObj = Object.values(topo.objects)[0]
        const geojson = window.topojson!.feature(topo, firstObj)
        initLeafletMap(wrapper, geojson)
      } catch {
        // Invalid JSON or conversion error — leave source visible
      }
    })
  })
}

export function reRenderGeojson(root?: ParentNode): void {
  const container = root ?? document
  resetCustomBlocks(container, 'geojson', 'data-geojson-error')
  renderGeojson(container)
}

export function reRenderTopojson(root?: ParentNode): void {
  const container = root ?? document
  resetCustomBlocks(container, 'topojson', 'data-topojson-error')
  renderTopojson(container)
}
