// Hand-drawn ("sketch") SVG emit for D2 shapes + edges (task 120) — the opt-in
// (`vmarkd.diagram.d2Sketch`) alternative to the crisp primitives in d2-render's `toSVG`, mirroring the
// official `d2 --sketch` look (wobbly strokes, hachure fills). We own `toSVG`, so sketch is a pure drop-in
// on the per-shape emit: rough.js's DOM-less generator turns each shape into multi-stroke <path>s. This
// module is imported by d2-render, so it rides the lazy d2-main.js chunk (task 165) — a non-D2 document
// never loads rough.js.
//
// Why this threads the theme for free: rough.js does NOT parse colours — it passes `stroke`/`fill`
// straight into the emitted SVG attributes. So `currentColor` (and task-119 palette colours) work for
// BOTH the outline stroke AND the hachure fill (which rough draws as its own stroke lines), unlike
// flowchart.js/Raphael which mangled `currentColor`. A stable per-shape `seed` (djb2 of the shape id,
// passed in by toSVG) makes the wobble DETERMINISTIC: re-render / scroll / theme-flip reproduce
// byte-identical paths, and `toSVG` stays pure (the generator is injected here, never imported there).
import type { Options, PathInfo } from 'roughjs/bin/core'
import { RoughGenerator } from 'roughjs/bin/generator'
import type { Paint, Sketch } from './d2-render'

// Tuned to read as hand-drawn without going noisy at diagram scale (close to d2 --sketch).
const ROUGHNESS = 1.1
const BOWING = 1
const HACHURE_GAP = 6 // px between hachure fill lines (rough's default is denser than d2's)
const FILL_WEIGHT = 1.2 // hachure line thickness

// A transparent / absent fill → no rough fill (just the wobbly outline), matching mono D2 (currentColor
// stroke, no fill).
function fillOf(p: Paint): string | undefined {
  return p.fill && p.fill !== 'transparent' && p.fill !== 'none'
    ? p.fill
    : undefined
}

// rough options for a CLOSED shape: outline + (optional) hachure fill.
function shapeOpts(p: Paint, seed: number): Options {
  const fill = fillOf(p)
  return {
    seed,
    roughness: ROUGHNESS,
    bowing: BOWING,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    ...(fill
      ? {
          fill,
          fillStyle: 'hachure',
          fillWeight: FILL_WEIGHT,
          hachureGap: HACHURE_GAP,
        }
      : {}),
  }
}

export function makeSketch(): Sketch {
  const gen = new RoughGenerator()
  // Serialize rough's path sets into <path>s. rough already resolves stroke/fill per PathInfo (a hachure
  // fill's lines carry stroke=fillColour, fill=none; the outline carries the shape stroke), so we emit
  // them verbatim; a shape opacity wraps the whole set in one <g> (matches the crisp `opacity` attr).
  const render = (paths: PathInfo[], p: Paint): string => {
    const inner = paths
      .map(
        (pi) =>
          `<path d="${pi.d}" stroke="${pi.stroke}" stroke-width="${pi.strokeWidth.toFixed(2)}" fill="${pi.fill ?? 'none'}"/>`,
      )
      .join('')
    return p.opacity != null ? `<g opacity="${p.opacity}">${inner}</g>` : inner
  }
  return {
    rect: (x, y, w, h, p, seed) =>
      render(gen.toPaths(gen.rectangle(x, y, w, h, shapeOpts(p, seed))), p),
    // rough.ellipse takes (centreX, centreY, width, height) → our rx/ry are half-extents.
    ellipse: (cx, cy, rx, ry, p, seed) =>
      render(
        gen.toPaths(gen.ellipse(cx, cy, rx * 2, ry * 2, shapeOpts(p, seed))),
        p,
      ),
    polygon: (points, p, seed) =>
      render(
        gen.toPaths(
          gen.polygon(points as [number, number][], shapeOpts(p, seed)),
        ),
        p,
      ),
    // Arbitrary bespoke shape path (cylinder/cloud/person/…) — rough.path(d) sketchifies any `d` verbatim,
    // which is exactly why one integration covers every bespoke shape with no geometry rework.
    path: (d, p, seed) =>
      render(gen.toPaths(gen.path(d, shapeOpts(p, seed))), p),
    // A connection line: OPEN path, SINGLE stroke (disableMultiStroke — a double line reads as messy for
    // a thin connector) with EXACT endpoints (preserveVertices) so the wobble never pulls the end off the
    // crisp arrowhead. `extra` (dash / anim class / mask / opacity, already built by toSVG) is appended to
    // each emitted <path>, mirroring the crisp edge's own attributes.
    edge: (d, p, seed, extra = '') =>
      gen
        .toPaths(
          gen.path(d, {
            seed,
            roughness: ROUGHNESS,
            bowing: BOWING,
            stroke: p.stroke,
            strokeWidth: p.strokeWidth,
            disableMultiStroke: true,
            preserveVertices: true,
          }),
        )
        .map(
          (pi) =>
            `<path d="${pi.d}" stroke="${pi.stroke}" stroke-width="${pi.strokeWidth.toFixed(2)}" fill="none"${extra}/>`,
        )
        .join(''),
  }
}
