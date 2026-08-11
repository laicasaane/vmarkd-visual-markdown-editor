// Shared D2 renderer constants (task 474 — extracted from d2-render.ts so the new split modules
// d2-svg-paths / d2-style / d2-layout / d2-svg-shapes all read the same numbers without importing
// each other's internals). Every value moved verbatim; d2-render re-exports EDGE_FONT_SIZE so the
// public surface (elk-layout.ts, tests) is unchanged.

export const FONT_SIZE = 16
export const EDGE_FONT_SIZE = 14
export const INNER_PAD = 5
export const P = 40 // d2 defaultPadding
// shape:text / shape:code (task 124 #2). Code uses a monospace face, but the injected Sizer can't
// switch font, so code boxes are sized from the char count at the monospace advance (~0.6em). These two
// are LEFT-ALIGNED prose at their own line-height (PROSE_LH) — every other shape/edge label breaks on
// \n through labelRows at LABEL_LH instead (task 493).
export const CODE_FONT = 13
export const CODE_CHAR_W = 0.6 // monospace advance per char (em)
export const PROSE_LH = 1.35 // multi-line label line-height factor
// Line-height factor for a multi-row ORDINARY label (task 493 — every shape/edge label, as opposed to
// the shape:text/code prose above). MUST equal canvasMeasure's factor, or the block of rows drifts out
// of the box the sizer reserved. Guarded by a unit test.
export const LABEL_LH = 1.25
export const TEXT_PAD = 4 // borderless text gutter
export const CODE_PAD = 10 // code panel padding

export const ceil = Math.ceil
export const SQRT2 = Math.SQRT2

// sql_table / class row geometry (both the sizer and the draw pass read these — keep in one place).
export const ROW_H = 26
export const HEADER_H = 32
export const CELL_PAD = 10

// Rounded-corner radius for orthogonal routes (mirrors d2's pathData, task 122).
export const CORNER_R = 8

// Browser Canvas sizer font stack (production). INVARIANT: this MUST stay identical to the @font-face
// family in main.css and the bundled media/fonts/ files — change one, change all three, or measureText
// drifts from the rendered SVG. Guarded by a unit test.
export const D2_FONT_STACK =
  '"Source Sans 3","Source Sans Pro",system-ui,sans-serif'
