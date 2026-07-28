// GeoJSON / TopoJSON (Leaflet) — task 409, split out of custom-diagrams.ts's god-module into its
// own engine file. Both languages share ONE Leaflet load + map-init path (topojson additionally
// needs the topojson-client bundle to convert to GeoJSON first), so they live in one file rather
// than two — mirroring the vega/vega-lite pairing.
import { getD2Config } from '../d2-config'
import { findBlocks, getCdn, resetCustomBlocks } from '../diagram-dom'
import { loadScript } from '../load-script'

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

// Basemap tile source for a geojson/topojson map, chosen by the `theme.geoBasemap` setting (task 99 +
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
    zoomControl: true,
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
  })

  // Optional remote basemap (task 99): default is geometry-only on a transparent canvas (fully
  // offline). When the user has opted into remote images, add a basemap UNDER the geometry; its style
  // follows the `theme.geoBasemap` setting (default `auto` = themed monochrome CARTO, picked light/dark
  // per the editor mode — see basemapFor). The CSP only allows `https:` images when
  // `image.allowRemoteImages` is on, so without the opt-in these tiles can't (and won't) be requested;
  // `geoBasemap: none` also skips the basemap (basemapFor → null) even when remote images are allowed.
  if ((window as any).__vmarkdAllowRemoteImages) {
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
    map.fitBounds(bounds, { padding: [20, 20] })
  } catch {
    map.setView([0, 0], 2)
  }

  wrapper.setAttribute('data-processed', 'true')
}

export function renderGeojson(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'geojson')
  if (!blocks.length) return

  const cdn = getCdn()
  addStylesheet(`${cdn}/dist/js/leaflet/leaflet.css`, 'vditorLeafletCss')
  loadScript(`${cdn}/dist/js/leaflet/leaflet.js`, 'vditorLeafletScript').then(
    () => {
      if (!window.L) return
      blocks.forEach(({ wrapper, code }) => {
        try {
          const data = JSON.parse(code)
          initLeafletMap(wrapper, data)
        } catch {
          // Invalid JSON — leave source visible
        }
      })
    },
  )
}

export function renderTopojson(root?: ParentNode): void {
  const container = root ?? document
  const blocks = findBlocks(container, 'topojson')
  if (!blocks.length) return

  const cdn = getCdn()
  addStylesheet(`${cdn}/dist/js/leaflet/leaflet.css`, 'vditorLeafletCss')
  Promise.all([
    loadScript(`${cdn}/dist/js/leaflet/leaflet.js`, 'vditorLeafletScript'),
    loadScript(
      `${cdn}/dist/js/topojson/topojson-client.min.js`,
      'vditorTopojsonScript',
    ),
  ]).then(() => {
    if (!window.L || !window.topojson) return
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
  resetCustomBlocks(container, 'geojson')
  renderGeojson(container)
}

export function reRenderTopojson(root?: ParentNode): void {
  const container = root ?? document
  resetCustomBlocks(container, 'topojson')
  renderTopojson(container)
}
