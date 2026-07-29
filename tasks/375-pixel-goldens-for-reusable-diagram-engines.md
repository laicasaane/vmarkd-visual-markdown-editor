# 375 — pixel goldens for every reusable diagram engine

**Status: ✅ built + green, baselines APPROVED (2026-07-28, expected to keep drifting as diagram styling continues)**

## Why

Two regressions in two days (373 lost arrowheads, 374 black mermaid) both lived in the
**paint-a-copy** path — the Preview pane reusing the edit pane's render — and both were reported by
the user looking at the screen, not by a test. The structural nets we had could not see them: the
markup was byte-identical in 373 and the styling never was a *reference* in 374.

> "musimy zrobić testy porównywania wizualnego po pikselach"

## What it does

`test/vscode-e2e/diagram-visual.spec.ts`, one test over all 8 reusable engines (d2, nomnoml,
wavedrom, vega, vega-lite, mermaid, flowchart, abc), each asserted twice:

1. **cross-pane** — the Preview render must be pixel-equal to the edit-pane render it was copied
   from. **No baseline**, so it is immune to font drift and valid on any machine: both images come
   from the same run, same page, same DPR. Scope is **IR ↔ Preview only**; WYSIWYG is covered
   structurally by `wysiwyg-parity.spec.ts` but NOT visually — future scope, currently a gap.
2. **golden** — the Preview render must match a committed baseline. Catches both panes breaking
   *identically* (a theme or engine change), which (1) cannot see by construction.

Engines excluded from reuse (echarts/mindmap canvas, markmap, graphviz, stl, geojson/topojson) are
deliberately out: they re-render per pane, so cross-pane equality is not their contract.

## Coverage — 16 engines x 3 surfaces x 5 themes

Every engine in the fixture except `stl`, captured in **IR, WYSIWYG and full Preview**:

- **golden** — ONE per engine+theme, taken from Preview. The equality checks below pin the other two
  surfaces to it, so a golden per pane would be three files asserting the same thing (80 baselines,
  not 240).
- **cross-pane** — IR vs Preview and WYSIWYG vs Preview, no baseline, so this half is font-drift
  immune and valid on any machine. For the 8 reusable engines it is byte-identity by construction;
  for the other 8 the renders are independent and it was MEASURED before being asserted — all of them
  come out at a delta of exactly 0.0000.

Two things the WYSIWYG surface forced, both measured rather than assumed:

1. **Vditor's block popover** ("⌄ 🗑 IR<Alt+Enter>") is painted over the top-left of a block and made
   vega-lite fail at a stable 0.60%. Dumping the capture proved it: the same element screenshotted
   outside the full run is pixel-identical to Preview. It is editing chrome, so it is hidden for the
   capture — loosening the threshold instead would have made the check meaningless.
2. **Captures now wait for layout to settle** (two identical bounding boxes 250 ms apart). Diagram
   renders land at different times and each reflows what follows; one abc capture came back with a
   neighbouring block bleeding into it and was clean on the retry.

`stl` is excluded: under xvfb there is no GPU, three.js reports "Error creating WebGL context" and
the element renders as the error box. Committing that as the reference would lock in a broken render
and never fail on a real STL regression.

## Themes — 5 per engine, none redundant

Five content themes (`vscode-dark-2026`, `vscode-light-2026`, `github-dark`, `github-light`,
`material-dark`) × 8 engines. Each content theme is **paired with the VS Code colour theme of the
same mode**, and that pairing is load-bearing: the webview body is transparent, so the page
background behind a diagram comes from `editor.background` — a light content theme on a dark
workbench would bake a hybrid no user ever sees into the reference.

The user's rule was "per theme if the renderer is theme-aware, otherwise just vscode light + dark".
Checked rather than assumed: all 8 engines are theme-aware (full palette-pairing for mermaid/d2,
themed foreground for the monochrome tier — ADR-0006), and comparing the generated PNGs by hash
confirms **all 5 renders differ for every engine** — 5 distinct images each, no duplicate baseline.
The fallback tier is empty here; engines that ignore theming (markmap) are not in this suite at all.

## The measurement that shaped it

A strict pixel-for-pixel diff put mermaid at **0.92%** and vega at **1.30%** — and the diff PNGs
showed every stroke and glyph merely *outlined*, bar bodies identical: the two panes place the same
SVG at a different sub-pixel phase, so each edge lands on a different pixel boundary. The
alternative was loosening the threshold to ~2%, which would have left no room to catch anything
real. Instead the comparison tolerates a **one-pixel displacement** (a pixel counts as different
only if it matches nothing in the other image's 3×3 neighbourhood) and the threshold stays at 0.5%.

A second rounding artefact surfaced when the themes were added: under both github themes, d2's
screenshots came out `545x247` vs `545x246` and the size check failed. Probed instead of assumed —
the element boxes are **identical in both panes** (545 × 245.390625) and only their fractional `top`
differs (`…​.64` vs `…​.33`), so a fractional-height box rounds to a different number of device rows.
Not a layout difference; the comparison now allows a **one device-pixel** size delta and compares
the common region, while anything larger still fails as "the panes laid it out differently".

## Verification

**Mutation** — with task 374's bug reinstated (rename every id), mermaid's cross-pane diff is
**1.88%**, 3.7× the threshold and stable across all three retries, and the golden fails too. Both
nets fire on a bug that shipped.

## Where it runs, and why not in CI

Behind the `@visual` tag, skipped unless `VMARKD_VISUAL=1` — `npm run test:vscode:visual`. Golden
images depend on linux-electron font rendering, so a runner with different fonts would turn the
nightly gate red for nothing. Assertion (1) is machine-safe and could be promoted to the default run
later; it lives with (2) for now so one command tells the whole story.

Regenerate deliberately: `npm run test:vscode:visual -- --update-snapshots`, then **look at every
changed PNG** before committing it. A baseline refreshed on autopilot is how a broken render becomes
the reference — which is precisely the failure mode this task exists to prevent.

## Open

- [x] Full 5-theme verification run: **5/5 green** after the layout-settle fix.
- [x] **Approved by the user (2026-07-28).** "reszta ok, jeszcze może się zmienić jak zacznę stylować
      diagramy dalej, ale na teraz jest ok" — accepted as the current reference set, with the explicit
      understanding that further diagram-styling work will keep moving individual baselines (not a
      one-time final sign-off). The `material-dark` set was regenerated as part of this approval: 4 of
      its 20 baselines actually changed on disk — `vega`/`vega-lite` (task 424 reprise: blue → the
      shared salmon), `smiles` (task 397: 56%→42% size cap), `topojson` (imperceptible, byte-level only
      — same blank Leaflet map + zoom control, confirmed visually, almost certainly renderer AA noise,
      not a real regression). `echarts-material-dark` did NOT change — task 424 landed then reverted,
      ending back at the exact pre-424 vintage salmon, so its baseline was already correct. The other 4
      themes' baselines are untouched.
- [x] Reviewed with the user. mermaid's edge-label rectangle: accepted as-is ("mermaid jest ok").
      flowchart's label-on-the-line → task 378. nomnoml/flowchart ink → tasks 376/377.
- [x] **d2's "own background" was my error, not a defect.** Measured: the d2 canvas corner is the
      page background in every theme (`#0d1117` github-dark, `#121314` vscode-dark, `#282c34`
      material, `#ffffff` light) and identical to mermaid/nomnoml/flowchart/vega in the same theme.
      What looked like a panel was my REVIEW SHEET: its cards use a `#010409` background, darker than
      the editor canvas, so every diagram stood out as a rectangle — d2 most, because its node fills
      are the lightest. Nothing to fix; recorded so it is not "discovered" again.
- [ ] Still unjudged from that review: vega/vega-lite axis labels sitting on the axis line.

## Concurrency — measured, and the answer is one worker

The suite is heavy on the dev machine, so two Playwright workers (two VS Code instances) were tried
and measured against one:

| | 1 worker | 2 workers |
|---|---|---|
| peak RSS (node/electron/Xvfb) | 2931 MB | **2913 MB** — no saving |
| minimum available memory | — | 6116 MB (never close to exhaustion) |
| load average peak (16 cores) | 5.8 | **23.7** — heavily oversubscribed |
| wall clock, full matrix | 8.7 min | **9.7 min** — slower |

Two instances buy nothing: the same peak memory, four times the run queue, and a LONGER run because
the tests compete (2.2 min per theme vs 1.3). Keep `workers: 1`.

The measurement also corrects the earlier guess that the stutter is memory exhaustion — available
memory never dropped below 6.1 GB even with two instances. It is the boot burst (CPU + I/O) of each
VS Code launch. The effective mitigation is fewer launches per sitting:
`npm run test:vscode:visual -- --grep "github-dark"` runs one theme, i.e. one launch instead of five.
