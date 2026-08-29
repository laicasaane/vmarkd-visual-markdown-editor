// @vitest-environment jsdom
// Task 409: moved out of custom-diagrams.test.ts alongside the geojson/topojson engine itself.
import { test, expect, beforeEach, describe, vi } from 'vitest'
import {
  basemapFor,
  initLeafletMap,
  isDegenerateBounds,
  reRenderGeojson,
  reRenderTopojson,
  renderGeojson,
  renderTopojson,
} from './geojson-topojson'

beforeEach(() => {
  document.body.innerHTML = ''
})

// The `diagram.geo.basemap` setting → Leaflet tile source (initLeafletMap reads this). `auto` (default)
// is themed monochrome CARTO (Positron light / Dark Matter dark); `voyager`/`osm` are colored; `none`
// disables the basemap. Keep in sync with the package.json enum.
describe('basemapFor (diagram.geo.basemap → tile source)', () => {
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
  // (__vmdeAllowRemoteImages is unset in these tests, so tileLayer/control aren't hit).
  function installFakeLeaflet() {
    ;(window as any).L = {
      map: () => ({
        fitBounds: () => {
          /* fake Leaflet API — unused in this test */
        },
        setView: () => {
          /* fake Leaflet API — unused in this test */
        },
        // task 459: initLeafletMap stashes the post-fit view (map.getCenter()/getZoom()) for the
        // keyboard-zoom reset — the real Leaflet API these stand in for.
        getCenter: () => ({ lat: 0, lng: 0 }),
        getZoom: () => 2,
      }),
      geoJSON: () => ({
        addTo: () => {
          /* fake Leaflet API — unused in this test */
        },
        getBounds: () => ({}),
      }),
      circleMarker: () => ({}),
    }
  }

  beforeEach(() => {
    delete (window as any).L
    delete (window as any).topojson
    document
      .querySelectorAll('#vditorLeafletScript, #vditorTopojsonScript')
      .forEach((el) => {
        el.remove()
      })
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
    expect(wrapper.querySelector('.vmde-diagram-error')).not.toBeNull()
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
    expect(wrapper.querySelector('.vmde-diagram-error')).not.toBeNull()
    expect(wrapper.textContent).toContain('Leaflet and TopoJSON')
    expect(wrapper.getAttribute('data-topojson-error')).toBe('load')
    expect(wrapper.getAttribute('data-processed')).toBe('true')
  })

  test('rerender clears stale load-failure metadata before retrying GeoJSON and TopoJSON', () => {
    document.body.innerHTML = `
      <div class="vditor-preview">
        <div class="language-geojson" data-processed="true" data-geojson-error="load">old</div>
        <div class="language-topojson" data-processed="true" data-topojson-error="load">old</div>
      </div>`

    reRenderGeojson()
    reRenderTopojson()

    expect(
      document
        .querySelector('.language-geojson')
        ?.hasAttribute('data-geojson-error'),
    ).toBe(false)
    expect(
      document
        .querySelector('.language-topojson')
        ?.hasAttribute('data-topojson-error'),
    ).toBe(false)
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
      // Explicit return type: without it, `geometry: null` infers as `any` (strictNullChecks is
      // off project-wide, and non-strict-null mode widens a bare `null` literal to `any` rather
      // than keeping it as the `null` type — noImplicitAny then flags that widening).
      feature: (): { type: string; geometry: null; properties: object } => ({
        type: 'Feature',
        geometry: null,
        properties: {},
      }),
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
    fitBounds: () => {
      /* fake Leaflet API — unused in this test */
    },
    setView: () => {
      /* fake Leaflet API — unused in this test */
    },
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 2,
  }
  const layer = {
    addTo: () => {
      /* fake Leaflet API — unused in this test */
    },
    getBounds: () => ({}),
  }
  ;(window as any).L = {
    map: (_el: HTMLElement, o: Record<string, unknown>) => {
      opts.push(o)
      return map
    },
    geoJSON: () => layer,
    circleMarker: () => ({}),
    control: {
      attribution: () => ({
        addTo: () => {
          /* fake Leaflet API — unused in this test */
        },
      }),
    },
  }
  const wrapper = document.createElement('div')
  document.body.replaceChildren(wrapper)
  initLeafletMap(wrapper, { type: 'FeatureCollection', features: [] })
  expect(opts).toHaveLength(1)
  expect(opts[0].zoomSnap).toBe(0)
})

// Task 459: Leaflet's built-in Map.Keyboard handler (default on) both (a) sets a real tabIndex="0"
// on `.leaflet-container` — a stray Tab stop that contradicts 457's decision that diagram content is
// click/Ctrl-focusable but never a Tab stop — and (b) steals focus back onto that container on its own
// `mousedown` listener, firing AFTER diagram-zoom-gate.ts's capture-phase Ctrl+mousedown has already
// focused our wrapper (measured in the real VS Code e2e: `document.activeElement` ended up on
// `.leaflet-container`, not the wrapper). Our own +/-/0 keyboard zoom (diagram-zoom-keys-gated.ts)
// already reaches Leaflet's zoomIn()/zoomOut()/setView() directly, so Leaflet's own keyboard handler
// is a redundant, competing authority — disabling it removes both problems in one step.
test("the map disables Leaflet's own keyboard handler (own focus-stealing + stray tab stop)", () => {
  const opts: Record<string, unknown>[] = []
  const map = {
    fitBounds: () => {
      /* fake Leaflet API — unused in this test */
    },
    setView: () => {
      /* fake Leaflet API — unused in this test */
    },
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 2,
  }
  const layer = {
    addTo: () => {
      /* fake Leaflet API — unused in this test */
    },
    getBounds: () => ({}),
  }
  ;(window as any).L = {
    map: (_el: HTMLElement, o: Record<string, unknown>) => {
      opts.push(o)
      return map
    },
    geoJSON: () => layer,
    circleMarker: () => ({}),
    control: {
      attribution: () => ({
        addTo: () => {
          /* fake Leaflet API — unused in this test */
        },
      }),
    },
  }
  const wrapper = document.createElement('div')
  document.body.replaceChildren(wrapper)
  initLeafletMap(wrapper, { type: 'FeatureCollection', features: [] })
  expect(opts[0].keyboard).toBe(false)
})

// Task 479: a single-point map (one Point feature, N Points at identical coordinates, or a
// LineString whose points all coincide) collapses to bounds with ZERO AREA. Fed to fitBounds(),
// Leaflet's getBoundsZoom() computes zoom = Infinity for a zero-size box and RETURNS it rather than
// throwing, so the map silently rendered at infinite zoom. Fix: detect the degenerate case and use
// setView(center, fixed zoom) instead — isDegenerateBounds() is the detector, unit-tested directly
// below; the initLeafletMap wiring tests confirm it is actually consulted, for both geojson and
// topojson (which share this exact code path — there's nothing topojson-specific to test).
function fakeLatLng(lat: number, lng: number) {
  return { lat, lng, equals: (o: any) => o?.lat === lat && o?.lng === lng }
}
function fakeBounds(
  sw: { lat: number; lng: number },
  ne: { lat: number; lng: number },
) {
  return {
    isValid: () => true,
    getSouthWest: () => fakeLatLng(sw.lat, sw.lng),
    getNorthEast: () => fakeLatLng(ne.lat, ne.lng),
    getCenter: () => fakeLatLng((sw.lat + ne.lat) / 2, (sw.lng + ne.lng) / 2),
  }
}

describe('isDegenerateBounds (task 479)', () => {
  test('a single point (southWest === northEast) is degenerate', () => {
    const point = { lat: 12, lng: 34 }
    expect(isDegenerateBounds(fakeBounds(point, point))).toBe(true)
  })

  test('a real extent (southWest !== northEast) is not degenerate', () => {
    expect(
      isDegenerateBounds(fakeBounds({ lat: 0, lng: 0 }, { lat: 10, lng: 10 })),
    ).toBe(false)
  })

  test('invalid bounds (no layers added) are not degenerate — that path throws in fitBounds instead', () => {
    expect(
      isDegenerateBounds({
        isValid: () => false,
        getNorthEast: () => fakeLatLng(0, 0),
        getSouthWest: () => fakeLatLng(0, 0),
      }),
    ).toBe(false)
  })
})

describe('initLeafletMap zero-area bounds (task 479)', () => {
  // Minimal fake Leaflet whose geoJSON().getBounds() returns whatever `bounds` the test supplies —
  // standing in for a Point feature / all-identical-coordinate FeatureCollection / collapsed
  // LineString, all of which reach initLeafletMap as an already-computed zero-area LatLngBounds via
  // the SAME layer.getBounds() call, so faking the bounds is equivalent to faking the geometry.
  function installFakeLeafletWithBounds(bounds: unknown) {
    const map = {
      fitBounds: vi.fn(),
      setView: vi.fn(),
      getCenter: () => ({ lat: 0, lng: 0 }),
      getZoom: () => 2,
    }
    ;(window as any).L = {
      map: () => map,
      geoJSON: () => ({
        addTo: () => {
          /* fake Leaflet API — unused in this test */
        },
        getBounds: () => bounds,
      }),
      circleMarker: () => ({}),
      control: {
        attribution: () => ({
          addTo: () => {
            /* fake Leaflet API — unused in this test */
          },
        }),
      },
    }
    return map
  }

  test('a single-Point map uses setView at the fallback zoom, not fitBounds', () => {
    const point = { lat: 51.5, lng: -0.12 }
    const map = installFakeLeafletWithBounds(fakeBounds(point, point))
    const wrapper = document.createElement('div')
    document.body.replaceChildren(wrapper)

    initLeafletMap(wrapper, { type: 'Point', coordinates: [-0.12, 51.5] })

    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.setView).toHaveBeenCalledTimes(1)
    const [center, zoom] = map.setView.mock.calls[0]
    expect(center).toMatchObject({ lat: 51.5, lng: -0.12 })
    expect(Number.isFinite(zoom)).toBe(true)
  })

  test('a FeatureCollection of identical-coordinate Points is degenerate too', () => {
    const point = { lat: 10, lng: 20 }
    const map = installFakeLeafletWithBounds(fakeBounds(point, point))
    const wrapper = document.createElement('div')
    document.body.replaceChildren(wrapper)

    initLeafletMap(wrapper, {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [20, 10] } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [20, 10] } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [20, 10] } },
      ],
    })

    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.setView).toHaveBeenCalledTimes(1)
    expect(Number.isFinite(map.setView.mock.calls[0][1])).toBe(true)
  })

  test('a LineString whose points all coincide is degenerate too', () => {
    const point = { lat: -33, lng: 151 }
    const map = installFakeLeafletWithBounds(fakeBounds(point, point))
    const wrapper = document.createElement('div')
    document.body.replaceChildren(wrapper)

    initLeafletMap(wrapper, {
      type: 'LineString',
      coordinates: [
        [151, -33],
        [151, -33],
      ],
    })

    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.setView).toHaveBeenCalledTimes(1)
    expect(Number.isFinite(map.setView.mock.calls[0][1])).toBe(true)
  })

  test('a normal multi-extent map is UNCHANGED by the fix: fitBounds with the same padding, no setView', () => {
    const bounds = fakeBounds({ lat: 0, lng: 0 }, { lat: 10, lng: 10 })
    const map = installFakeLeafletWithBounds(bounds)
    const wrapper = document.createElement('div')
    document.body.replaceChildren(wrapper)

    initLeafletMap(wrapper, {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    })

    expect(map.setView).not.toHaveBeenCalled()
    expect(map.fitBounds).toHaveBeenCalledTimes(1)
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, { padding: [20, 20] })
  })

  test('topojson goes through the same degenerate-bounds path as geojson', async () => {
    const point = { lat: 5, lng: 6 }
    const map = installFakeLeafletWithBounds(fakeBounds(point, point))
    ;(window as any).topojson = {
      feature: () => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [6, 5] },
      }),
    }
    document
      .querySelectorAll('#vditorLeafletScript, #vditorTopojsonScript')
      .forEach((el) => {
        el.remove()
      })

    const pane = document.createElement('div')
    pane.innerHTML = `<div class="language-topojson" data-code='{"type":"Topology","objects":{"a":{"type":"Point","coordinates":[6,5]}},"arcs":[]}'></div>`
    document.body.appendChild(pane)

    renderTopojson(pane)
    document
      .getElementById('vditorLeafletScript')!
      .dispatchEvent(new Event('load'))
    document
      .getElementById('vditorTopojsonScript')!
      .dispatchEvent(new Event('load'))
    await new Promise((r) => setTimeout(r, 0))

    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.setView).toHaveBeenCalledTimes(1)
    expect(Number.isFinite(map.setView.mock.calls[0][1])).toBe(true)
  })
})
