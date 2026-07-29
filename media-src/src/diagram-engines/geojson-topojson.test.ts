// @vitest-environment jsdom
// Task 409: moved out of custom-diagrams.test.ts alongside the geojson/topojson engine itself.
import { test, expect, beforeEach, describe } from 'vitest'
import {
  basemapFor,
  initLeafletMap,
  renderGeojson,
  renderTopojson,
} from './geojson-topojson'

beforeEach(() => {
  document.body.innerHTML = ''
})

// The `theme.geoBasemap` setting → Leaflet tile source (initLeafletMap reads this). `auto` (default)
// is themed monochrome CARTO (Positron light / Dark Matter dark); `voyager`/`osm` are colored; `none`
// disables the basemap. Keep in sync with the package.json enum.
describe('basemapFor (theme.geoBasemap → tile source)', () => {
  test('auto (default) is themed monochrome CARTO, flipping light/dark by mode', () => {
    const light = basemapFor('auto', false)
    const dark = basemapFor('auto', true)
    expect(light?.url).toContain('cartocdn.com/light_all/')
    expect(dark?.url).toContain('cartocdn.com/dark_all/')
    expect(light?.subdomains).toBe('abcd')
  })

  test('an unknown value falls back to auto (themed monochrome), NOT none', () => {
    expect(basemapFor(undefined, false)?.url).toContain(
      'cartocdn.com/light_all/',
    )
    expect(basemapFor('bogus', true)?.url).toContain('cartocdn.com/dark_all/')
  })

  test('voyager is the colored CARTO Voyager basemap (mode-independent)', () => {
    expect(basemapFor('voyager', false)?.url).toContain(
      'cartocdn.com/rastertiles/voyager/',
    )
    expect(basemapFor('voyager', true)?.url).toContain(
      'cartocdn.com/rastertiles/voyager/',
    )
  })

  test('osm is the OpenStreetMap basemap (abc subdomains, no retina token)', () => {
    const osm = basemapFor('osm', false)
    expect(osm?.url).toContain('tile.openstreetmap.org/')
    expect(osm?.url).not.toContain('{r}') // OSM has no retina tiles
    expect(osm?.subdomains).toBe('abc')
  })

  test('none disables the basemap (null → geometry only)', () => {
    expect(basemapFor('none', false)).toBeNull()
    expect(basemapFor('none', true)).toBeNull()
  })
})

describe('renderGeojson + renderTopojson sharing vditorLeafletScript (task 407)', () => {
  // Minimal L stub — only the calls initLeafletMap makes on the non-basemap path
  // (__vmarkdAllowRemoteImages is unset in these tests, so tileLayer/control aren't hit).
  function installFakeLeaflet() {
    ;(window as any).L = {
      map: () => ({ fitBounds: () => {}, setView: () => {} }),
      geoJSON: () => ({ addTo: () => {}, getBounds: () => ({}) }),
      circleMarker: () => ({}),
    }
  }

  beforeEach(() => {
    delete (window as any).L
    delete (window as any).topojson
    document
      .querySelectorAll('#vditorLeafletScript, #vditorTopojsonScript')
      .forEach((el) => el.remove())
  })

  test('a failed Leaflet load shows a terminal GeoJSON error instead of returning silently', async () => {
    const pane = document.createElement('div')
    pane.innerHTML = `<div class="language-geojson" data-code='{"type":"Point","coordinates":[0,0]}'></div>`
    document.body.appendChild(pane)

    renderGeojson(pane)
    document
      .getElementById('vditorLeafletScript')!
      .dispatchEvent(new Event('error'))
    await new Promise((r) => setTimeout(r, 0))

    const wrapper = pane.querySelector<HTMLElement>('.language-geojson')!
    expect(wrapper.querySelector('.vmarkd-diagram-error')).not.toBeNull()
    expect(wrapper.textContent).toContain('Leaflet')
    expect(wrapper.getAttribute('data-geojson-error')).toBe('load')
    expect(wrapper.getAttribute('data-processed')).toBe('true')
  })

  test('failed Leaflet and TopoJSON loads show a terminal TopoJSON error instead of returning silently', async () => {
    const pane = document.createElement('div')
    pane.innerHTML = `<div class="language-topojson" data-code='{"type":"Topology","objects":{},"arcs":[]}'></div>`
    document.body.appendChild(pane)

    renderTopojson(pane)
    document
      .getElementById('vditorLeafletScript')!
      .dispatchEvent(new Event('error'))
    document
      .getElementById('vditorTopojsonScript')!
      .dispatchEvent(new Event('error'))
    await new Promise((r) => setTimeout(r, 0))

    const wrapper = pane.querySelector<HTMLElement>('.language-topojson')!
    expect(wrapper.querySelector('.vmarkd-diagram-error')).not.toBeNull()
    expect(wrapper.textContent).toContain('Leaflet and TopoJSON')
    expect(wrapper.getAttribute('data-topojson-error')).toBe('load')
    expect(wrapper.getAttribute('data-processed')).toBe('true')
  })

  test('a topojson render that starts while leaflet is still loading is NOT silently dropped', async () => {
    const geoPane = document.createElement('div')
    geoPane.innerHTML = `<div class="language-geojson" data-code='{"type":"Point","coordinates":[0,0]}'></div>`
    document.body.appendChild(geoPane)
    const topoPane = document.createElement('div')
    topoPane.innerHTML = `<div class="language-topojson" data-code='{"type":"Topology","objects":{"a":{"type":"GeometryCollection","geometries":[]}},"arcs":[]}'></div>`
    document.body.appendChild(topoPane)

    // First caller for 'vditorLeafletScript' — creates the tag; its own load hasn't fired yet.
    renderGeojson(geoPane)
    // Second caller for the SAME script id, requested before the first load completes — the
    // real-world trigger is two diagram blocks resolving on the same document open (task 407).
    renderTopojson(topoPane)

    // The topojson-client script is smaller/faster and can finish loading BEFORE leaflet does —
    // simulate that ordering. window.L is deliberately still unset at this point.
    ;(window as any).topojson = {
      feature: () => ({ type: 'Feature', geometry: null, properties: {} }),
    }
    document
      .getElementById('vditorTopojsonScript')!
      .dispatchEvent(new Event('load'))
    await new Promise((r) => setTimeout(r, 0))

    // Now the real leaflet load completes (this is what actually populates window.L).
    installFakeLeaflet()
    document
      .getElementById('vditorLeafletScript')!
      .dispatchEvent(new Event('load'))
    await new Promise((r) => setTimeout(r, 0))

    expect(
      geoPane
        .querySelector('.language-geojson')
        ?.getAttribute('data-processed'),
    ).toBe('true')
    // Buggy addScript(): the 2nd caller's addScript('vditorLeafletScript') resolved the moment
    // the tag EXISTED (step above), so renderTopojson's Promise.all already fired its `.then()`
    // with window.L still undefined and bailed for good — this block never gets a second chance.
    expect(
      topoPane
        .querySelector('.language-topojson')
        ?.getAttribute('data-processed'),
    ).toBe('true')
  })
})

// Task 379 — Leaflet snaps fitBounds to WHOLE zoom levels by default, and a level is a factor of 2,
// so a dataset can be drawn at up to half the size the box could show. `zoomSnap: 0` removes that
// quantisation. Measured gain on the fixture: 3% — small, but free. The visible size of a map is
// otherwise geometry, not a bug: fitBounds keeps geographic proportions.
test('the map is created with fractional zoom', () => {
  const opts: Record<string, unknown>[] = []
  const map = {
    fitBounds: () => {},
    setView: () => {},
  }
  const layer = { addTo: () => {}, getBounds: () => ({}) }
  ;(window as any).L = {
    map: (_el: HTMLElement, o: Record<string, unknown>) => {
      opts.push(o)
      return map
    },
    geoJSON: () => layer,
    circleMarker: () => ({}),
    control: { attribution: () => ({ addTo: () => {} }) },
  }
  const wrapper = document.createElement('div')
  document.body.replaceChildren(wrapper)
  initLeafletMap(wrapper, { type: 'FeatureCollection', features: [] })
  expect(opts).toHaveLength(1)
  expect(opts[0].zoomSnap).toBe(0)
})
