// Task 499 — the ONE clamp: `Math.max(lo, Math.min(v, hi))` (or the mirrored
// `Math.min(hi, Math.max(lo, v))`) had drifted into ~12 call sites across both trees, in two
// different argument orders. Pure, no vscode/DOM dependency — importable from both media-src/src
// and src (same cross-tree shape as heading-slug.ts).
//
// Contract, spelled out because it's now load-bearing for geometry/colour paths where an
// off-by-one is silent:
//  - `lo <= hi` (the normal case): returns `v` clamped into `[lo, hi]`.
//  - `lo > hi`: NOT validated — returns `lo` (the outer `Math.max` runs last and wins). Chosen
//    to match the majority shape already in use at the migrated call sites (`Math.max(0,
//    Math.min(v, hi))`, and heading-align.ts's original `v < lo ? lo : …` which checks `lo`
//    first). No caller in the tree can currently reach it — every call site passes constant
//    bounds or a provably `lo <= hi` pair. It is documented anyway because
//    media-src/src/nav/outline-resize.ts cites this exact clause as its reason for staying
//    inline: it needs the OPPOSITE winner, and that comment is where the consequence is worked
//    out. Don't change this tie-break without re-reading it.
//  - `v` is `NaN`: returns `NaN` (both `Math.max`/`Math.min` propagate it).
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi))
}
