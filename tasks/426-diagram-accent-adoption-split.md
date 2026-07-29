# Task 426 — Inconsistent adoption of the vscode-2026 accent-blue across node/edge engines (Codex visual finding #3)

**Status:** ✅ RESOLVED (2026-07-28) — closed as WONTFIX, no code change needed · **Impact:** 🟡 low as a "bug" — turned out to be entirely policy + one screenshot-reading imprecision · **Origin:** Codex visual-consistency audit (2026-07-28), finding #3

## Resolution (2026-07-28, Codex — pixel-verified graphviz check)

**Verdict: graphviz IS correctly accent-coloured — screenshot-reading imprecision, not a
regression.** Decoded the actual PNGs with pngjs and ran a pixel-frequency scan (not eyeballing):

- `diagram-graphviz-vscode-dark-2026-linux.png`: 3rd most common non-background colour is
  `rgb(72,160,199)` = **`#48a0c7`** — an EXACT match to `MERMAID_PALETTES['vscode-dark-2026'].line`.
- `diagram-graphviz-vscode-light-2026-linux.png`: 3rd most common colour is `rgb(0,105,204)` =
  **`#0069cc`** — an EXACT match to `MERMAID_PALETTES['vscode-light-2026'].line`.

`applyGraphvizTheme()` (`media-src/src/graphviz-render.ts:64-78`) correctly injects the accent
colour into the DOT graph/node/edge defaults, `resolveDiagramPalette()` correctly resolves the
paired palette for the NAMED vscode-dark/light-2026 themes (not just `auto`), and
`themeGraphvizSvg()`'s foreground-neutralization pass correctly leaves the injected colour alone
(it only rewrites literal `#000000`/`black`). **No regression, no fix needed.**

Why it reads as gray at a glance: the graphviz fixture (`digraph G { rankdir=LR; A->B; B->C; A->C;
C->D [label="ok"]; }`) is drawn almost entirely in thin 1px anti-aliased strokes over a small
diagram — the accent-blue pixel COUNT is genuinely low relative to the canvas (430px on dark, 565px
on light, out of ~57,000 total), spread across curved/diagonal anti-aliased edges rather than
mermaid's thick rectangular borders. Low-coverage, thin, anti-aliased strokes desaturate visually
to the eye even at full colour-value saturation — exactly Option (B)'s predicted "screenshot read
was imprecise" outcome.

**Follow-up recorded, not a new task:** worth a one-line note in the `vmarkd-renderer-theming`
skill that graphviz's accent colour is real but low-coverage/easy to misjudge by eye, so a future
visual audit pixel-checks before re-flagging it.

## ⚠️ Read this before touching any code — most of what Codex flagged is deliberate, twice-decided policy

Codex's raw observation: in both vscode-2026 themes, **d2, mermaid, plantuml** pick up the theme's
vivid accent blue for borders/lines, while **graphviz, flowchart, nomnoml, mindmap, markmap** stay
flat neutral gray in the exact same theme — "half the diagram family looks themed, half doesn't."

Verified against `docs/adr/0006-diagram-theming-policy.md` (Accepted, 2026-06-27) and
`src/mermaid-palettes.ts`: **this split is the intended, explicitly documented, and — for two of
the five "non-adopting" engines — a policy that was already tried the other way and reverted BY
THE USER'S OWN REQUEST.** Re-implementing it without reading this first risks undoing a decision
that's already been made once and reversed once.

### The full documented history (ADR-0006 §1, dated entries)

- **mermaid, echarts, D2** — full palette-paired by original design. `mermaid-palettes.ts:32-43`
  sets `vscode-light-2026`/`vscode-dark-2026`'s `line`/`accent` to `#0069cc`/`#48a0c7` — the same
  VS Code blue — **on purpose** (see memory note `install-vsix-to-see-visual-changes`: "vscode-2026 line==accent →
  palette diagram lines are blue there ON PURPOSE, don't neutralize" — this exact question was
  raised before, the line colour was flipped to neutral grey, then **reversed back to blue**,
  per the project history).
- **plantuml, graphviz** — promoted to full palette-pairing on 2026-06-28, **at the user's own
  request** ("dobre tematy"/"good themes") — ADR-0006 §1 amendment: `color = line` injected into
  DOT graph/node/edge defaults for graphviz, a `<style>` block for plantuml. Both SHOULD show the
  accent blue on vscode-2026 per this decision.
- **flowchart, nomnoml** — WERE ALSO promoted to full palette-pairing in the same 2026-06-28 pass,
  then **explicitly reverted to foreground-monochrome, at the user's own request** ("the
  surface-fill / themed-line look wasn't wanted there" — ADR-0006 §1, last sentence). Confirmed in
  `flowchart-retheme.ts:42-48`: the code deliberately reads `p.muted` (not `p.line`/`p.accent`) for
  its stroke colour — muted is a desaturated/dimmer derived colour, specifically NOT the vivid
  accent. This is the code-level fossil of that reversal.
- **abc, wavedrom, geojson/topojson, vega, mindmap (◑ partial), markmap** — accepted, permanent
  foreground-monochrome/baked fallbacks (ADR-0006 §§1, 5, 6) — "not debt," explicitly "do not
  revisit" for markmap specifically.

So: mermaid/D2/plantuml/echarts being blue-accented, and flowchart/nomnoml/abc/wavedrom/geojson/
vega/mindmap/markmap NOT being, is **the documented, working-as-intended policy** — ADR-0006 §1's
own words literally predict Codex's exact observation: *"a full-colour mermaid can sit next to a
monochrome graphviz in the same document."*

### The one thing that's actually unclear: graphviz

ADR-0006 states graphviz was promoted to full palette-pairing alongside plantuml (both should show
`color = line` = the accent blue on vscode-2026). Codex's screenshot read says graphviz renders
flat neutral gray, grouped with the monochrome engines — **not** matching the ADR's stated current
behaviour. This is a real discrepancy between "what the ADR says should happen" and "what Codex
saw," and neither side has been independently re-verified in this task.

## Options

- **(A) Close as WONTFIX / not-a-bug for everything except graphviz.** The mermaid/D2/plantuml vs.
  flowchart/nomnoml/others split is settled policy, twice-decided, don't re-litigate without a
  fresh, explicit ask. Spin the graphviz question into its own tight verification task.
- **(B) Investigate graphviz specifically**: read `graphviz-render.ts`'s current DOT-injection code
  and re-render a vscode-2026 graphviz fixture, compare the actual stroke colour against
  `MERMAID_PALETTES['vscode-dark-2026'].line` (`#48a0c7`). If it matches → Codex's screenshot read
  was likely imprecise (small/thin strokes can look grayer than they are at low zoom/compression —
  re-check the actual PNG pixel values, not just eyeballing), close with no change. If it doesn't
  match → this IS a regression since the 2026-06-28 promotion, worth a real fix (find why the
  injected `color = line` default isn't reaching the rendered SVG — check for an author-colour
  override in the fixture, an engine-specific fallback, or a retheme-path gap).
- **(C) If, after (A)/(B), the user genuinely wants MORE engines accent-coloured** (a fresh,
  conscious decision to expand palette-pairing beyond plantuml/graphviz/mermaid/D2/echarts) — that
  is new opt-in work per ADR-0006 §1 ("promoting any of them to full pairing is opt-in future
  work"), not a bug fix, and should be scoped as its own task per-engine, informed by why flowchart/
  nomnoml were reverted last time (so the same objection doesn't just resurface).

## Out of scope

- Re-opening the flowchart/nomnoml/markmap/mindmap decisions without a fresh, explicit user ask —
  these are settled per ADR-0006, not silently up for grabs because a visual audit flagged the
  (already-known, already-accepted) split.
- The echarts findings (424/425) — related "does this engine's colour match its neighbors"
  question, but a structurally different mechanism (baked series palettes, not line/accent).

## Verification

- [x] Pixel-check (not eyeball) graphviz's actual rendered stroke colour on both vscode-2026 themes
      against `MERMAID_PALETTES`'s `line` value — DONE, exact match on both themes (see Resolution).
- [x] No fix needed — graphviz already matches its ADR-0006-stated behaviour.
- [ ] Optional follow-up (not blocking closure): add a one-line note to the `vmarkd-renderer-theming`
      skill about graphviz's low-coverage accent strokes being easy to misjudge by eye.

## See also

- `docs/adr/0006-diagram-theming-policy.md` (the full policy + history).
- Memory `install-vsix-to-see-visual-changes` (the earlier line-colour reversal, vscode-2026 section).
- `src/mermaid-palettes.ts`, `media-src/src/flowchart-retheme.ts`, `media-src/src/graphviz-render.ts`.
