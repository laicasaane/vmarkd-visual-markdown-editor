# 453 — Move the genuinely harness-able specs down a layer (and unblock the rest with a diagram-mount harness)

**Status:** DONE, partial by design (2026-07-30) — 3 harness replacements built
(`list.spec.ts`/`mode-roundtrip.spec.ts`/`width.spec.ts`); move+prove attempted on all 3; only
`preview-width` had an identifiable `media-src/src/**` fix to revert, proven red→green, its
vscode-e2e original retired. `list-ops` and `mode-roundtrip` have no identifiable fix underlying
them (NET/baseline coverage, not regression pins) — their originals were KEPT per the "coverage
moves before it is removed" bar, not deleted. `inline-pad.spec.ts`/`mermaid-markers.spec.ts`
(delete-only candidates) and the two sizing specs (unblocked by the diagram-mount spike) were
never released for action this round — see "Move + prove" and "Diagram-mount spike" below for
full detail.
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Estimated saving:** **−3 to −5 min** — deliberately small; see "why this list is short"

## Why the reverts are paused

Everything in this task EXCEPT the actual "move + prove" revert step only touches
`test/vscode-e2e/**` (delete the old spec) and `media-src/e2e/**` (harness specs/support, NOT
`media-src/src/**` — that's the implementation directory other agents own right now). That
distinction is why the prep work below was safe to do in full: new harness spec files, a new
harness entry, and the diagram-mount spike are all additions to `media-src/e2e/**`, never a touch
to `media-src/src/**`. The one step that genuinely needs `media-src/src/**` is the "prove" half of
"move + prove" — deliberately reverting a real fix there to confirm the harness copy catches its
absence — and that is exactly what's held. Doing the prep now and the reverts later means the
actual migration (move + prove + delete the old spec) becomes a short, mechanical pass once the
tree settles, instead of a from-scratch investigation.

## Candidate list — validated against the current repo (2026-07-30)

Re-checked each of the 5 "move/delete" candidates and the diagram-mount spike's prerequisites
against the actual current files (the original list below was accurate; this confirms it wasn't
stale and adds what each migration concretely needs):

- **`inline-pad.spec.ts` → delete.** Confirmed: `media-src/e2e/wysiwyg-inline-pad.spec.ts` already
  asserts IR==WYSIWYG inline-code padding parity for `vscode-light-2026.css` (3px) and
  `github-markdown-light.css` (.4em/5.6px) via the same ADR-0004 single-patched-CSS path the real
  spec exercises (it just pins `vscode-dark-2026` instead of `-light-`, same numeric contract).
  Nothing to build — ready to delete once released.
- **`mermaid-markers.spec.ts` → delete.** Confirmed: already `@probe`-tagged (task 449, excluded
  from the default run) and its own header already says `media-src/e2e/mermaid.spec.ts` covers
  markers — it is a zero-assertion `console.log` dump. Nothing to build — ready to delete once
  released.
- **`list-ops.spec.ts` → harness `list.spec.ts`.** `media-src/e2e/list.spec.ts` exists but currently
  only covers a DIFFERENT bug (task 56, listToggle crash) — the "Enter continues a bullet list"
  case needs a NEW test added to it (or a new describe block), using the same fixture shape
  (`list-harness.ts`/`list.html` already mount a real IR Vditor) plus real `page.keyboard.press
  ('Enter')` / `page.keyboard.type(...)` — Playwright's chromium harness supports real keyboard
  input identically to `workbox.keyboard`, so the vscode-e2e spec's logic ports directly, just
  swap `workbox.keyboard` → `page.keyboard` and `getValue()` stays the same call.
- **`mode-roundtrip.spec.ts` → harness.** No existing harness file — a NEW one is needed
  (`mode-roundtrip-harness.ts`/`.html`, or fold into an existing torture-fixture harness if one
  already mounts `torture.md`). The spec is pure Vditor: `getValue()` + clicking the toolbar's
  `data-mode` buttons — nothing here needs a host API, so it is fully portable as written, just
  needs its own harness entry (same `harness-entries.mjs` pattern used for `diagram-mount` below).
- **`preview-width.spec.ts` → harness `width.spec.ts`.** `width-harness.ts` exists but is text-only
  (no diagram) — the real spec measures an ECharts canvas's width edit↔preview. Confirmed ECharts
  DOES render in the harness (`echarts-harness.ts`, task 89/90) with a real canvas, so migrating
  this needs `width-harness.ts` extended with an echarts block (or a new width+diagram harness
  entry) plus the edit↔preview-overlay toggle logic width-harness.ts already has for narrow-mode
  centring. Not built yet — real content work, not just wiring.

## Diagram-mount spike (task 453's "verify-then-migrate" unblocker) — RESULT: POSITIVE

Built and ran the spike (all new files, `media-src/e2e/**` only):

- `media-src/e2e/diagram-mount-harness.ts` + `diagram-mount.html` — mounts a real WYSIWYG Vditor
  with `abc`/`graphviz`/`flowchart`/`mermaid` fenced blocks. These four are all Vditor NATIVE
  renderers (auto-detected by fenced-block language, same mechanism `mermaid-harness.ts`, task 59,
  already proved works) — **no custom `installDiagramRuntime` wiring needed**, unlike
  wavedrom/nomnoml/geojson/topojson/stl/vega/d2 (task 101/103/99/100/104, which DO need it — see
  `custom-diagrams-harness.ts`). Registered in `harness-entries.mjs` (`{ key: 'diagram-mount' }`)
  — the registry meta-test (`test/backend/harness-registry.test.ts`) passes with the new entry.
- `media-src/e2e/diagram-mount-spike.spec.ts` — measures each language's rendered `svg`/`canvas`
  the SAME way `diagram-width.spec.ts` does (`.vditor-wysiwyg__preview > .language-X` /
  `code.language-X`, first `svg, canvas` inside — an apples-to-apples stand-in for that spec's
  real-VS-Code measurement shape).
- **Measured** (`xvfb-run -a npm --prefix media-src run test:e2e -- diagram-mount-spike.spec.ts`,
  passed): `abc={found:true, hasGraphic:true, tag:"svg", w:770, h:139}`,
  `graphviz={found:true, hasGraphic:true, tag:"svg", w:119, h:251}`,
  `flowchart={found:true, hasGraphic:true, tag:"svg", w:59, h:137}`,
  `mermaid={found:true, hasGraphic:true, tag:"svg", w:110, h:174}` — all four render real,
  non-degenerate SVG geometry in the chromium harness.

**Conclusion**: `diagram-width.spec.ts` and `diagram-sizing.spec.ts`'s abc/graphviz/flowchart/
mermaid assertions ARE migratable — the harness renders them faithfully. `echarts` (used by
`diagram-sizing.spec.ts`'s narrow-mode check) is already proven separately via
`echarts-harness.ts`. `mindmap` (`diagram-sizing.spec.ts`) and `d2` (both specs) were not spiked
here — `d2` stays on the "explicitly NOT migratable" list per the task's own prior note
(resource-URI pipeline, `fixme` in the harness); `mindmap` is part of the custom diagram runtime
(`installDiagramRuntime`, same family as echarts) and likely follows the same pattern but wasn't
directly measured — flag for whoever does the actual migration, don't assume.

Per the task's own spike checklist: this is a genuine positive result, recorded either way as
asked. The two sizing specs' non-d2/non-mindmap portions are now unblocked; the actual migration
(harness copy + prove-with-a-reverted-fix + delete the real-VS-Code original) is still gated on
the tree settling, same as the other 5 candidates.

**Does NOT contradict the "explicitly NOT migratable" list's `graphviz` entry** — that entry is
`graphviz.spec.ts` (a different file: PALETTE pairing against the real theme's computed colour,
"the worker + transparency behaviour does not reproduce in the harness" per its own header). This
spike only measured plain rendered SIZE/geometry for `diagram-width.spec.ts`/`diagram-sizing.
spec.ts`, a different concern entirely — `graphviz.spec.ts` itself stays real-VS-Code-only,
untouched by this finding.

## Why this list is short

The keep-rule from 447: a spec may leave `test/vscode-e2e` only if `evaluateInVSCode` is used
**solely** to open the fixture and it touches no filesystem / `TextDocument` / clipboard / command /
setting. It must stay if it asserts computed style or `--vscode-*` (VS Code injects its own default
CSS — `[[vscode-injects-webview-default-css]]`), goes through CSP / `asWebviewUri` / `loadScript` /
Workers (`[[d2-elk-main-thread]]`), touches the host document or disk, drives the real clipboard
bridge (`[[mouseops-l2-vs-l3-edit-pipeline]]`), or is about caret/focus
(`[[webview-focus-scroll-not-in-harness]]`).

Applied to all 145 default spec files, that leaves **five**. The suite is not mis-layered; it is
structurally expensive (tasks 449–452).

## Move / delete

| spec | tests | action | why it is safe |
|---|---|---|---|
| `inline-pad.spec.ts` | 1 | **delete** | it exists to catch a bundled-vs-copied `index.css` mismatch; ADR-0004 removed that drift (one `<link>` to one patched copy — the same file the harness loads), and `media-src/e2e/wysiwyg-inline-pad.spec.ts` already asserts the padding parity |
| `mermaid-markers.spec.ts` | 1 | **delete** (or fold into `media-src/e2e/mermaid.spec.ts`) | one-line header, title *"mermaid SVG marker probe"* — probe-grade; the harness renders mermaid |
| `list-ops.spec.ts` | 1 | → harness `list.spec.ts` | Enter-continues-a-list asserted via `getValue()`: pure Vditor + Lute, no host API |
| `mode-roundtrip.spec.ts` | 1 | → harness | ir→wysiwyg→sv→ir byte-stability is Vditor's per-mode serialisation. **It is in the FAST tier**, so this also lightens the routine run — keep the same torture fixture |
| `preview-width.spec.ts` | 1 | → harness `width.spec.ts` | edit↔preview column width; `width-harness.ts` already exists |

Each migration must land as **move + prove**, not move + assume: the harness copy has to FAIL
against a deliberately reverted fix before it is trusted (a harness spec that silently asserts
nothing is worse than the slow spec it replaced).

## Verify-then-migrate (spike, do not move blind)

`diagram-width.spec.ts`, `diagram-sizing.spec.ts` — their headers claim *"the harness doesn't render
the real diagrams"*, which was true when written but is now only partly true (`custom-diagrams-harness.ts`,
`mermaid-harness.ts`, `echarts-harness.ts` exist). What is still missing is a harness entry that
mounts an **arbitrary fenced block** — the same gap that makes the D2 assertions `test.fixme` in the
harness (its DOM has no `.language-d2`).

- [x] Spike: add a generic diagram-mount harness entry (fixture markdown in → Vditor render out).
      Done — `media-src/e2e/diagram-mount-harness.ts` + `diagram-mount.html`, registered in
      `harness-entries.mjs`. See "Diagram-mount spike" above.
- [x] If it renders abc/graphviz/flowchart faithfully, migrate the two sizing specs and re-open the
      D2 `fixme`s. **Renders faithfully — measured positive** (abc/graphviz/flowchart/mermaid all
      produced real, non-degenerate SVG geometry). The actual migration of the two sizing specs
      is NOT done yet (needs the same move+prove discipline as the other 5 candidates, held for
      the same tree-settling reason) — this only closes the spike/blocker question, which is what
      the checkbox asks. D2's `fixme`s stay closed (unrelated gap — resource-URI pipeline, not
      the fenced-block-mount gap this spike closed).

## Explicitly NOT migratable (checked, so nobody re-checks)

Every `plantuml-*` (TeaVM lazy-load + the `!include` expander run behind CSP/`loadScript`), every
`d2-*` (resource-URI pipeline; `fixme` in the harness), `graphviz` / `nomnoml` / `wavedrom` /
`vega-theme` / `stl-material` / `geojson-*` (palette pairing reads the real theme's computed colour;
Leaflet tiles are CSP-gated), `local-assets-only`, `hljs-initial-stylesheet`, `font-parity`,
`editor-gutter`, `diagram-bg`, `trailing`, `bottom-gap`, `viewport-scroll`, and everything touching
disk / clipboard / caret.

## Harness-side replacements — BUILT AND GREEN (2026-07-30), reverts/deletes still held

Team lead released the three harness-side ports (no `media-src/src/**` involvement, safe
alongside the agents still editing that tree). All three built, run, and passing; the OLD
`test/vscode-e2e/` specs are still in place (not deleted — coverage moves before it is removed,
per the team lead's explicit ordering) and no `media-src/src/**` fix has been touched or reverted:

- **`list-ops.spec.ts` → `media-src/e2e/list.spec.ts`**: added an `ops` fixture to
  `list-harness.ts` (mirrors `test/vscode-e2e/fixtures/list-ops.md` — a task list above a bullet
  list, so the "task list undisturbed" assertion still means something) and a new describe block
  porting the Enter-continues-a-list case verbatim (real `page.keyboard.press`/`.type`, same
  `getValue()` regex assertions). `xvfb-run -a npm --prefix media-src run test:e2e -- list.spec.ts`
  — 2/2 passing (the pre-existing task-56 crash test unaffected).
- **`mode-roundtrip.spec.ts` → new `media-src/e2e/mode-roundtrip-harness.ts` + `.html` +
  `.spec.ts`**: the same torture-fixture content inlined (pure Vditor + Lute, no host API, so it
  ports unchanged), mode-switching via a synthetic `dispatchEvent` click on
  `.vditor-toolbar button[data-mode=…]` (matches the real spec's own mechanism — needs
  `toolbar: ['edit-mode']` explicitly, since a custom `toolbar` array overrides Vditor's default
  set). Registered in `harness-entries.mjs`; `harness-registry.test.ts` still 5/5.
  `xvfb-run -a npm --prefix media-src run test:e2e -- mode-roundtrip.spec.ts` — 1/1 passing,
  `ir0 === ir1` confirmed byte-stable (len 982 both ends).
- **`preview-width.spec.ts` → `media-src/e2e/width.spec.ts`**: extended `width-harness.ts`'s
  existing document with a plain `echarts` fenced block (Vditor-native renderer, no
  `installDiagramRuntime` needed — confirmed via `echarts-harness.ts`, task 89/90; theme-pairing
  calls in the real spec were about colour, not geometry, so not needed here) and reused the
  harness's EXISTING `[data-type="preview"]` toolbar-click mechanism (already proven by the other
  9 tests in this file) instead of the real spec's more manual DOM-hiding approach — simpler and
  consistent with the rest of the suite. New test measures `.vditor-ir__preview
  .language-echarts canvas` vs `.vditor-preview .language-echarts` width (not `.vditor-ir` bare —
  IR's diagram preview area is `.vditor-ir__preview`, confirmed against `echarts-harness.ts`'s own
  selector). `xvfb-run -a npm --prefix media-src run test:e2e -- width.spec.ts` — **10/10 passing**
  (the 9 pre-existing centring tests unaffected by the added echarts content, plus the new one:
  `irPara=800 irCanvas=800 pvPara=800 pvDiv=800`, exact parity).

Gates re-run: `npx vitest run --config test/vitest.config.ts test/backend/harness-registry.test.ts`
green, `biome check` clean on every touched file. `npm run typecheck` shows one PRE-EXISTING,
unrelated failure (`media-src/src/zz-debug-puml.test.ts` — a phantom reference to a file that
doesn't exist on disk; `media-src/e2e/**` isn't even in that tsconfig's `include`, so this can't be
from this work) — not touched, not mine, flagged rather than silently ignored.

## Move + prove — RESULT: 1 of 3 proven and retired, 2 of 3 KEPT (no fix to revert)

Released to do the reverts. For each of the 3 harness replacements, looked for the specific
`media-src/src/**` (or `media-src/esbuild-shared.mjs` — that file is technically outside
`media-src/src/**`, but still checked) fix the migrated behaviour depends on, since a spec whose
underlying "fix" can't be found can't be proven red-on-revert. Result: only one of the three has
one.

### `preview-width.spec.ts` → `width.spec.ts` — PROVEN, RETIRED

**Fix identified**: `media-src/src/main.css`, the narrow-mode Preview padding rule (~line 1514),
from task 438. Its own comment names the exact bug: "Preview previously used `max(0px, …)` (no
floor), so below 800px its content column was ~70px WIDER than the editor's (no gutter) …
responsive renders (echarts) visibly grew" — literally the bug `preview-width.spec.ts` exists to
catch.

**What the harness test proves** (`echarts width is identical edit↔preview`, added to
`width.spec.ts`): the echarts chart's container is the same width in Edit and Preview, at both a
wide pane (800px cap) and — the actual bug condition — a narrow one (<904px, where the
`--vmarkd-gutter` floor matters). The FIRST version of this test (wide-pane only, as built when
released) did NOT catch the reverted bug — checked empirically, not assumed: reverting the CSS
and re-running left it green, because at the file's default 1300px test viewport the floor never
binds. Added a narrow-viewport (700px) leg to make it test the actual bug condition, and one more
correction: comparing the preview's live container width against the editor's CANVAS was
comparing a fresh measurement against a stale one (echarts doesn't repaint its canvas on a bare
viewport resize without an explicit `resize()` call — already flagged as a known quirk in this
file's comments) — switched the narrow-case comparison to the editor's PARAGRAPH width instead,
which reflects the same live CSS.

**Red → green, measured**:
- RED (main.css reverted to `padding: 10px max(0px, calc((100% - 800px) / 2))`): narrow-pane
  measurement `irParaNarrow=594` vs `pvDivNarrow=698` — a 104px gap, `near()` fails as expected.
  Full run: 9/10 passing (only the new test fails; the 9 pre-existing tests are insensitive to
  this rule since none of them use a narrow viewport against the Preview pane specifically).
- Restored `main.css` exactly (`git diff --stat` on `media-src/src/` afterward shows the file
  absent from the changed list — byte-identical to its committed state).
- GREEN: rebuilt, reran — 10/10 passing, `irParaNarrow=594 pvDivNarrow=594` (exact match).

**Retired**: `test/vscode-e2e/preview-width.spec.ts` deleted.

### `list-ops.spec.ts` → `list.spec.ts` — NO FIX FOUND, KEPT

Investigated for ~20 minutes before concluding there is nothing to revert. Evidence:
- `list-harness.ts` constructs a BARE `Vditor` — it never calls `runFinishInit`
  (`finish-init.ts`) or wires any of our observers (`gap-paragraph.ts`, `list-backspace.ts`, …).
  The "Enter continues a bullet list, `getValue()` serializes correctly" behaviour is 100%
  Vditor+Lute internal; nothing of ours sits between the keystroke and the serialization.
- Grepped `media-src/esbuild-shared.mjs` (all vditor source patches) for anything touching Enter,
  list continuation, or list markers on Enter specifically — task 441's `patchIrListMarkerOnSpace`/
  `patchWysiwygListMarkerOnSpace` are about typing `-`+SPACE to CREATE a list, a different moment
  than pressing Enter INSIDE an already-existing list. Nothing else matched.
- The real spec's own header says why it exists: "list editing round-trips to correct markdown
  (J4, previously UNCOVERED end-to-end)" (task 190) — it was written to fill a coverage gap, not
  as a regression pin for a specific bug that was fixed. There is no historical "before" to
  revert to.
- (`../../src/lute-gap-repair.ts`, imported transitively via `preload.ts`, task 370 whitespace-gap
  repair, is a candidate that's at least PLAUSIBLE by name — but it's under `src/**`, which was
  explicitly out of scope for this whole session from the start, not just `media-src/src/**`, so
  it was not touched or even seriously investigated as a revert target.)

**Conclusion**: the harness copy only proves green, and I cannot make it fail against a reverted
implementation because no implementation of ours underlies the tested behaviour. Per the stated
bar, **kept `test/vscode-e2e/list-ops.spec.ts`** — not deleted. `media-src/e2e/list.spec.ts`'s
new test stays too (real, if less rigorously provable, coverage; cheap; harmless) — just not as a
replacement.

### `mode-roundtrip.spec.ts` → `mode-roundtrip.spec.ts` (harness) — NO FIX FOUND, KEPT

Same investigation, same conclusion. `mode-roundtrip-harness.ts` is also a bare `Vditor`
construction (no `finish-init` wiring). The ir→wysiwyg→sv→ir byte-stability round-trip is Vditor's
own per-mode serializer fidelity (`VditorIRDOM2Md`/`VditorDOM2Md`/raw textContent), not anything
we patch. The real spec's own header: "No coverage existed for the mode-switch journey before
this" (task 190 P0) — same NET-coverage shape as list-ops, not a regression pin. Grepped
`esbuild-shared.mjs` for anything mode-switch/serialization-related — nothing matched.

**Conclusion**: **kept `test/vscode-e2e/mode-roundtrip.spec.ts`** — not deleted, and it stays in
`FAST_SPECS` (`playwright.config.ts`) unchanged. `media-src/e2e/mode-roundtrip.spec.ts` stays too,
same reasoning as list-ops.

## Verification

- [x] Each new harness spec fails against the reverted fix, passes with it — **true for 1 of 3**
      (`preview-width` → `width.spec.ts`, see red/green evidence above). The other 2 have no
      identifiable fix to revert (see "NO FIX FOUND" sections) — their vscode-e2e originals were
      KEPT rather than deleted, per the stated bar, so no red/green claim is made for them.
- [x] `xvfb-run -a npm --prefix media-src run test:e2e -- list.spec.ts mode-roundtrip.spec.ts width.spec.ts diagram-mount-spike.spec.ts`
      — 14/14 green (post-restore state).
- [ ] `xvfb-run -a npm run test:vscode:fast` green with `mode-roundtrip` removed from `FAST_SPECS`.
      **N/A now** — `mode-roundtrip.spec.ts` was kept, not deleted, so it stays in `FAST_SPECS`.
- [x] `npx playwright test --list` in `test/vscode-e2e` drops by **1** (`preview-width.spec.ts`
      only), not 5 — `inline-pad`/`mermaid-markers` were never released for deletion this round
      (only the 3 named harness replacements were), and `list-ops`/`mode-roundtrip` were kept per
      the finding above.
