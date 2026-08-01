# 365 — the same d2 diagram lays out differently in IR and in Preview

**Status: ✅ FIXED** (product fix + new e2e suite + unit tests + mutation-verified)

## Report

After the task-364 scroll fix:

> "lekko teraz przesuwają się w lewo po przełączeniu na preview, tak i px, oraz jakby niektóre
> elementy na diagramach się źle renderowały np labelki nie mają [tła] przez co linie pod nimi widać
> albo boxy dostają horizontal scroll"

## Measured (all-renderers fixture, `theme.content: auto`)

Pane geometry is IDENTICAL (both 630px wide, 35px gutters, host 545px, `overflow-x: hidden`, no
horizontal scroll on either side). The difference was in the SVG the engine PRODUCED:

| d2 block | IR `width` | Preview `width` |
|---|---|---|
| #6 | 375 | **342** |
| #9 | 247 | **197** |
| #10 | 863 | **851** |
| all others (9 of 12) | — | identical |

The markup was otherwise the same length and carried the same `font-family` — only the coordinates
and `width`/`viewBox` differed. So d2 laid out the SAME graph twice and got NARROWER text metrics the
second time. A narrower layout with the same rendered glyphs is exactly "the label sticks out of its
box / the line underneath shows through", and a narrower diagram is also horizontally re-centred,
which reads as "it shifted left".

## Root cause — the Preview pane never reached the render cache at all

The cache's reserve+request (`reserveAndRequest`) is a **one-shot at open**, and the full Preview
pane does not exist yet at that moment — Vditor builds it on the first switch. Probed in the real
editor: every one of the 12 Preview d2 blocks carried `data-vmarkd-cache-reserve: null` and
`data-vmarkd-cache-hit: null`, i.e. it bypassed the cache entirely and the engine laid it out a
second time.

Why two fresh runs of the same engine on the same source disagree (the leading suspect was a webfont
race in `canvasMeasure`) is now **moot and deliberately not chased** — the fix removes the second
render, so there is no second measurement to disagree.

## Fix — reuse this session's own render (the user's suggestion)

> "a nie możesz cachować diagramu między ir i potem użyć go w preview?"

`media-src/src/render-cache-client.ts` gained the SAME-SESSION, in-memory half of the cache:
`localSvgByHash` (hash → the markup this webview already produced), populated wherever a render is
reported or a host hit is painted, and applied by `paintLocalHits()`.

Two properties make it work:

- **Synchronous, straight from the MutationObserver callback** — NOT the rAF path.
  `observeCustomDiagrams` also schedules on rAF, so a paint deferred to rAF would race the very
  engine run it exists to pre-empt. A mutation callback always runs first.
- **Shared paint helper.** `paintCached()` is now the single site for both the host-reply HIT and the
  local paint, so they cannot drift — in particular on `data-code`, whose absence is the task-361 bug
  (a painted node with no source re-renders EMPTY on the next theme flip).

Guards: skipped while `isTyping()` (a block being edited changes hash every keystroke, so the lookup
can only miss and the per-mutation `findBlocks` walk is pure cost), a re-entrancy flag for the
observer's own paint, LRU-capped at 200 entries, and cleared whenever `version`/`themeKey` changes
(those are folded into the hash, so the old entries are unreachable anyway).

Result: **12/12 d2 blocks byte-identical between the panes**, all painted from the reuse map, and one
full engine layout pass per diagram saved on every mode switch.

### Secondary fix — hljs was decorating diagram labels

Reuse SURFACED a second, pre-existing divergence: d2 markdown labels (`|md ... |`) emit real
`<pre><code>` inside a `<foreignObject>`, and Vditor's `highlightRender` walks **every** `pre > code`
under the pane — so it highlighted the diagram's own labels, adding `class="hljs"` (hljs colours plus
the code-panel background). Before reuse the diagram simply did not exist yet when that pass ran; now
it does, and the two panes differed by exactly that class on block #11.

Fixed at the source with a new esbuild patch, `patchHighlightSkipDiagrams`
(`media-src/esbuild-shared.mjs`): skip any block inside an `<svg>`. Anchored on Vditor's existing
marker-pre skip and throws on version drift, like the sibling patches.

## Verification

- **Mutation**: with `paintLocalHits` disabled, all three new e2e tests fail — and fail with exactly
  the originally reported numbers (`375 → 342`, `247 → 197`, `863 → 851`, `cache-hit=null`). With it
  enabled, all three pass.
- Unit: 3 new cases in `render-cache-client.test.ts` (reuse into a later pane incl. the `data-code`
  stamp, no false reuse on a different source, drop on theme change) + 3 in
  `vditor-source-patches.test.ts` for the highlight patch. `render-cache-client.ts` at 91.5% lines.
- Regression: `diagram-cache`, `diagram-cache-mermaid`, `mode-switch-parity`, `scroll-preserve`,
  `parity`, `diagram-bg`, `bottom-gap`, `inline-pad`, `custom-diagrams-render`, `d2-feature-parity`
  all green. Unit 1376/1376, lint clean (446 files).

## Tests

`test/vscode-e2e/mode-switch-render-reuse.spec.ts` (new, 3 tests):
- every cacheable diagram is **byte-identical** IR vs Preview — the discriminator that actually
  matches the complaint. A cache-hit attribute alone is NOT sufficient (a hit that painted a re-sized
  SVG would still be the bug), and genuine reuse needs no id normalisation to compare equal,
- the Preview pane REUSES rather than re-renders (pins the mechanism, so a doc where two engine runs
  happen to agree cannot hide a regression),
- a round trip IR → Preview → IR → Preview stays identical.

Both identity tests assert `compared > 10` first, so an empty fixture can never pass as "everything
matched" — the vacuous-assertion trap that hid task 361.

## Not done

- **Vditor-NATIVE engines (mermaid/abc/flowchart/plantuml) in the full Preview pane are NOT covered.**
  `PREVIEW_PANE_SEL` in the cache client lists only `.vditor-ir__preview` / `.vditor-wysiwyg__preview`,
  so `.vditor-preview` is outside the native reserve path, and reserving there has to beat Vditor's
  deferred `addScript().then()` render rather than our own rAF. Whether they diverge the same way is
  untested — it belongs to task 366's sweep.
- **WYSIWYG** is untouched here (task 366).
- The `canvasMeasure` font hypothesis is unproven and now unnecessary; left recorded in case a
  non-cacheable engine shows the same signature.

## Not to be confused with

- Task 362 — a 9px IR-vs-Preview *height* delta under a github content theme. Different measurement,
  different trigger.
- Task 364 — the scroll jump on mode switch (fixed).
