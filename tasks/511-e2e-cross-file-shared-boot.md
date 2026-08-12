# 511 — Share one VS Code boot across whole spec FAMILIES (cross-file), not just within a file

**Status:** 🚧 PARTIAL (2026-08-12) — PlantUML, D2 and `diagram-*` safe groups implemented and
verified (20 boots removed: 16 PlantUML/D2 + 4 `diagram-*`). Rubric (rules 1–7) established for
whoever picks up the rest of the suite (`paste-*`, `caret-*`, `list-*`/`echarts-*`/`clipboard-*`
remain unaudited, see "Candidate families" below).
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Follows:** [450](450-e2e-collapse-per-parameter-boots.md) (collapsed boots *inside* a file — done),
[452](452-e2e-sharding-investigation.md) (parallelism measured at 1.6× and declined — so boot count
is once again the only lever on the full suite's wall clock)
**Potential:** the largest remaining one. 253 tests × 8–13 s of boot ≈ **34–55 min** of the full
suite is VS Code launching, and **119 of the 171 spec files declare exactly one test**, so 450's
within-file merging cannot touch them at all.

## Why this is not just "450 again"

450's rule was *merge only what shares a fixture AND a starting state*, applied within a file. The
same rule applies across files — the boot does not care which file a `test()` was declared in. What
blocks it is not the file boundary, it is state: 450 found reproducible reset boundaries (a fresh
panel opened after closing a WYSIWYG one leaves `.vditor-ir` permanently hidden; an edited
in-memory `TextDocument` cannot be reset by rewriting the file on disk).

But there is counter-evidence that a shared boot CAN carry many independent cases:
`clipboard-elements.spec.ts`'s paste sweep (`test(` at :303) already does close-all + reopen **10×**
inside one `test()`, successfully — its local `boot()` (:35, called at :319) is the cheap reset, with
`test.setTimeout(300_000)` (:312) sized to the case count and `expect.soft()` per case. That is the
pattern to generalise — for the families where every test is a *render-and-assert* with no document
mutation.

## Candidate families (default tier, counted 2026-08-12 from `--list --reporter=json`)

| family | tests / files | shape |
|---|---|---|
| `plantuml-*` | 27 / 19 | mostly render-a-fixture-and-assert; heaviest engine in the suite |
| `d2-*` | 18 / 15 | same shape, plus the theme-flip legs |
| `diagram-*` | 17 / 13 | mixed — some are edit/monitor specs, NOT read-only |
| `paste-*` | 11 / 6 | excluded, clipboard (see 452) |
| `caret-*` | 9 / 5 | excluded, focus/caret state is the thing under test |
| `list-*`, `echarts-*`, `clipboard-*` | 7–8 each | mixed |

`plantuml-*` and `d2-*` are the first targets: read-only renders, one fixture each, no clipboard, no
focus dependency.

## Audit rubric (widened 2026-08-12 during execution — plantuml exposed axes 450 never needed)

Exclude a spec from cross-file merging if ANY of these hold:

1. **Document mutation** — 450's original rule: typing, cutting, mode-switching, anything that
   leaves the in-memory `TextDocument` or the panel/Preview state different from open.
2. **Cold-start / lazy-load freshness** — the assertion IS "this is the first time X loads/fetches"
   (`plantuml-cache`, `plantuml-loading`, and — found only on inspection, not from the filename —
   `plantuml-stdlib`/`plantuml-stdlib-more`, which assert "each lib's map is fetched **once** via
   loadScript"; `d2-lazy-load` is the same class). A shared boot's second case runs on a warm
   loadScript cache and the assertion is no longer testing what it claims to.
3. **Persistent global settings mutation** — `vscode.workspace.getConfiguration(...).update(key,
   value, true)` (global scope) or `ConfigurationTarget.Global`. Unlike document state, `boot()`
   (close-all + reopen) does **not** reset this — it survives to every later case in the same
   `test()`. Found on inspection: `plantuml.spec.ts` (`theme.content` → `vscode-dark-2026`, global),
   `plantuml-native-dark.spec.ts` (`colorTheme` + `theme.content`, global),
   `plantuml-theme-flip.spec.ts` (both, global, then flips again). This is a **distinct hazard from
   "theme-state"** — theme-state names specs that read a still-settling live flip; this names specs
   that leave a config value stuck for whoever runs after them in the same boot.
4. **Engine-instance-count assertions** — `plantuml-family-matrix` (`__vmarkdPumlEngineLoads` ≤ 2 for
   the whole document), `plantuml-typeswitch` ("on a cold render... EXACTLY 2 engine instances"),
   `plantuml-multiblock` (explicitly "non-deterministic → worth re-running a few times", i.e. wants
   its own boot + its own retries), `plantuml-edit-recovery` (also mutates, category 1). The PlantUML
   engine's sticky/shared-instance history (tasks 178/347/350) makes "how many times did the engine
   load in this webview session" load-bearing — a shared boot changes the count by definition.
5. **Timing-bound convergence** — `plantuml-rapid-edit` (asserts a bounded-time convergence after
   spaced edits) and `plantuml-phase-timing` (a timing INSTRUMENT, explicitly modelled on
   `perf-timeline.spec.ts`, meant to be re-run standalone, not merged into a sweep that would jitter
   its cold/warm/cache-hit numbers).

**Audit first, merge second, per remaining family. Record the classification table for each family
in this file** — the exclusions are the valuable output, same as in 450.

## PlantUML audit (19 files, 27 tests) — DONE

| file | tests | verdict | reason |
|---|---|---|---|
| `plantuml-domainstory` | 1 | ✅ merge | render-and-assert, no settings/state |
| `plantuml-missing-include` | 1 | ✅ merge | render-and-assert, no settings/state |
| `plantuml-multidiagram` | 2 | ✅ merge | render-and-assert, single-block fixtures by design |
| `plantuml-sprite-size` | 1 | ✅ merge | render-and-assert, no settings/state |
| `plantuml-overlay-size` | 1 | ❌ exclude | edits during typing (rule 1) |
| `plantuml-edit-recovery` | 2 | ❌ exclude | edits + engine-instance count (rules 1+4) |
| `plantuml-rapid-edit` | 1 | ❌ exclude | timing-bound convergence (rule 5) |
| `plantuml-cache` | 1 | ❌ exclude | cold-vs-cache IS the assertion (rule 2) |
| `plantuml-loading` | 1 | ❌ exclude | cold-load placeholder IS the assertion (rule 2) |
| `plantuml-stdlib` | 2 | ❌ exclude | asserts fetch-freshness (rule 2) |
| `plantuml-stdlib-more` | 1 | ❌ exclude | asserts fetch-freshness (rule 2) |
| `plantuml.spec.ts` | 1 | ❌ exclude (for now) | global `theme.content` mutation (rule 3) — could join a LATER sweep as the last case with an explicit revert, not attempted this round |
| `plantuml-native-dark` | 1 | ❌ exclude | global `colorTheme`+`theme.content` mutation (rule 3) |
| `plantuml-theme-flip` | 1 | ❌ exclude | global settings + live flip (rules 3+ theme-state) |
| `plantuml-family-matrix` | 3 | ❌ exclude | engine-load-count assertion (rule 4) |
| `plantuml-typeswitch` | 1 | ❌ exclude | engine-instance-count assertion (rule 4) |
| `plantuml-multiblock` | 1 | ❌ exclude | non-deterministic, wants its own retries (rule 4) |
| `plantuml-phase-timing` | 2 | ❌ exclude | timing instrument (rule 5) |
| `plantuml-type-support` | 1 | ⏸ deferred | no hazard found, but already internally isolated (fresh engine per type) and large — low value to touch first |

**Result: 4 files / 5 tests → 1 merged test.** Far short of "26 tests" the family's raw count
suggested — PlantUML's sticky-engine and lazy-load history (the reason tasks 178/347/350/136 exist
at all) makes most of the family state-coupled by design, not an oversight to fix. This is the
finding, not a shortfall.

- [x] PlantUML safe group implemented and verified: `plantuml-render-sweep.spec.ts` — 1 `test()`,
      local `boot()` (close-all + reopen, same pattern as `clipboard-elements.spec.ts:35`), 5 case
      bodies (domainstory, missing-include, multidiagram's 2, sprite-size), every original
      `expect()` converted to `expect.soft()`, `test.setTimeout(900_000)` = sum of the 5 donors' own
      timeouts. The 4 donor files were deleted (git history keeps them). 3 independent real-VS-Code
      runs, all green (46.2s, 40.7s, 1.1m — the third machine-load-affected). Biome clean.
- [x] `d2-*` audit — DONE, table below.
- [x] `diagram-*` audit — DONE. All 4 candidates re-read in full afterwards (the caveat below applied
      only to the first pass); implementation DONE, see the bullet under the `diagram-*` table below.

### Rule 6 refined (2026-08-12, while auditing `diagram-*`)

Rule 6 as first written said a case may join a shared boot only if its diagram source is not
byte-identical to an earlier case's. Auditing `diagram-*` showed that is too blunt: three of its four
safe candidates (`diagram-bg`, `diagram-zoom`, `diagram-inline-zoom`) open the SAME fixture
(`all-renderers.md`), and copying it to another filename would not help — cache keys hash the diagram
SOURCE, not the path. The distinction that actually matters:

- A case that asserts **on the render itself** (was an SVG produced, is it byte-identical, did the
  engine run, how long did it take) must not run on a source an earlier case already cached — that is
  rules 2/6 and it still stands.
- A case that asserts **on the decoration layer** — wrapper classes, background, observer-applied
  markers like `data-vmarkd-zoom`, event handlers — is indifferent to whether the SVG underneath was
  painted fresh or from cache, because the decoration observers run over whatever painted.

So: identical sources may share a boot **iff** every case on that source is a decoration-layer
assertion, and the coldest-cache case is ordered first. Treated as a hypothesis to TEST, not an
assumption — a decoration assertion failing on a cache-painted diagram would be a real product
finding (decoration not running on the cache-paint path), never a reason to loosen the test.

## D2 audit (15 files, 18 tests, excl. `@probe`/spike) — DONE

New hazard found here, not present in the PlantUML pass: a global settings mutation with **no
reset** at end of test is fine as long as every other case in the sweep is indifferent to that key
— i.e. either shares the same value or never reads it. `theme.content: 'auto'` and
`diagram.d2.layout: 'vmarkd'` are the current DEFAULTS, so a spec that sets them explicitly (without
resetting) is functionally a no-op for its own case AND harmless to every other default-assuming
case after it. A spec that sets a **non-default** value with no reset is not — it silently changes
the environment for every later case. Call this **rule 3b**: a same-boot case may set a config key
to a value ONLY if that value equals every other case's expectation for that key (usually: the
default), OR it explicitly resets the key to `undefined`/default before its own case ends.

| file | tests | verdict | reason |
|---|---|---|---|
| `d2-explicit-dimensions` | 1 | ✅ merge | zero settings mutation |
| `d2-feature-parity` | 1 | ✅ merge | zero settings mutation |
| `d2-imports` | 1 | ✅ merge | zero settings mutation |
| `d2-label-halo` | 1 | ✅ merge | sets `theme.content='auto'` (= default), no reset — rule 3b |
| `d2-multiline-label` | 1 | ✅ merge | sets `diagram.d2.layout='vmarkd'` (= default), no reset — rule 3b |
| `d2-parallel-lane` | 1 | ✅ merge | sets `diagram.d2.layout='vmarkd'` (= default), no reset — rule 3b |
| `d2-code-highlight` | 1 | ✅ merge, LAST in sweep | sets `theme.content` to 2 non-default values mid-test but explicitly resets both keys to `undefined` at the end — the one case in the group that actually deviates, so it must run last |
| `d2-container-edge` | 1 | ❌ exclude | sets `diagram.d2.layout='dagre'` (non-default), **no reset** — would silently switch every later case in a shared boot off the default ELK engine (rule 3b violation) |
| `d2-md-content-theme` | 1 | ❌ exclude | sets `theme.content='github-light'` (non-default), no reset (rule 3b violation) |
| `d2-content-theme-flip` | 1 | ❌ exclude | theme-state: live content-theme flip is the assertion, plus depends on a render being a cache HIT on open |
| `d2-lazy-load` | 2 | ❌ exclude | cold-start/lazy-load freshness IS the assertion (rule 2) — same class as `plantuml-loading`/`plantuml-stdlib` |
| `d2-sketch` | 2 | ❌ exclude | already within-file merged (450); live setting-flip test, own settings-heavy concern |
| `d2-theme` | 1 | ❌ exclude | already within-file merged (450); settings sweep IS the test |
| `d2-table-chrome` | N (parametrized `for` loop, not yet 450-merged) | ❌ exclude, flagged | content-theme parametrized, no single default state — also a candidate for a SEPARATE within-file (450-style, not this task's cross-file) merge that nobody has done yet; out of scope here, noted for whoever picks up loose 450 ends |
| `d2-edit-perf` | — | n/a | `@probe`-tagged, not in default tier |
| `d2-insert-gap-spike` | — | n/a | filename matches `**/*spike*`, excluded by `testIgnore` |

**Result: 7 files / 7 tests → 1 merged test.** Smaller than the raw "18 tests" family count for the
same reason as PlantUML: D2's settings-driven theme/engine tests (the bulk of the family) are
state-coupled by design.

- [x] D2 safe group implemented and verified: `d2-render-sweep.spec.ts`, 7 cases in the order the
      audit table requires (`d2-code-highlight` last — the one case that deviates from default
      settings, self-resets in a `finally`). 3 independent real-VS-Code runs, all green (27.9s,
      32.9s, 25.8s). Biome clean (one cognitive-complexity fix: `closestPair`'s nested loop split
      out a `pairGap` helper to stay under the 15 threshold).

## Result (2026-08-12)

**Boots removed: 20** — 4 PlantUML files (5 tests) + 7 D2 files (7 tests) + 4 `diagram-*` files
(4 tests) collapsed into 3 sweep files.

## `diagram-*` audit (13 files, 17 tests) — lighter pass, caveat below

**Caveat:** unlike the PlantUML/D2 tables above (full-file reads, settings-grep on every candidate),
this pass classified from header comments + a targeted grep for `setViewportSize|resize|.update(` +
a `keyboard.type`/`.fill`/`.press` check on the files that looked borderline. It is good enough to
route work, not a substitute for reading each candidate fully before merging — do that as step 1 of
implementation, the way the other two families did.

| file | tests | verdict | reason |
|---|---|---|---|
| `diagram-bg` | 1 | ✅ candidate | render-and-assert, no settings/resize/typing found |
| `diagram-inline-zoom` | 1 | ✅ candidate | render + zoom/pan interaction, but that's webview-local UI state a fresh `boot()` panel discards — not document/settings state |
| `diagram-zoom` | 1 | ✅ candidate | same reasoning — wheel-based Ctrl-interact gate, no settings/resize |
| `diagram-zoom-keys` | 1 | ✅ candidate | same reasoning — keyboard zoom, no settings/resize |
| `diagram-errors` | 2 | ❌ exclude | types into the document (`workbox.keyboard.type(' @@@bad', …)`) — rule 1 |
| `diagram-edit-monitor` | 2 | ❌ exclude | edit-cycle monitor by definition — rule 1 |
| `diagram-edit-scroll` | 1 | ❌ exclude | edits + scroll-stutter regression — rule 1 |
| `diagram-fast-edit-safety` | 2 | ❌ exclude | typing-corruption safety net — rule 1 |
| `diagram-cache` | 2 | ❌ exclude | close/reopen cache-hit IS the assertion — rule 2 |
| `diagram-cache-mermaid` | 1 | ❌ exclude | same — rule 2 |
| `diagram-cache-reply-source` | 1 | ❌ exclude | cache-fallback timing net — rules 2/5 |
| `diagram-resize` | 1 | ❌ exclude | mutates the Electron window/viewport size, found via grep, no reset seen — new hazard, same shape as rule 3b but for viewport instead of settings; name it **rule 7** for the next family |
| `diagram-retheme-viewport-gate` | 1 | ❌ exclude | theme-state (viewport gate on a retheme) |
| `diagram-sizing-audit` | 1 | ❌ exclude | explicitly "measurement, not an assertion gate" — rule 5 |
| `diagram-sizing` | 1 | ❌ exclude | resize/settings hit by the same grep as `diagram-resize` — rule 7 |
| `diagram-visual` | — | n/a | `@visual`-tagged, not in default tier |
| `diagram-175spike-all` | — | n/a | filename matches `**/*spike*`, excluded by `testIgnore` |
| `diagram-resettle-spike` | — | n/a | same |

**Result: 4 files / 4 tests → 1 merged test.** Smallest of the three families audited — `diagram-*`
is disproportionately edit/cache/timing specs by construction (it is literally the family the task
447 cost analysis flagged as "mixed" up front).

- [x] `diagram-*` safe group implemented and verified: `diagram-render-sweep.spec.ts` — 1 `test()`,
      local `boot()` (same pattern as the D2/PlantUML sweeps), 4 case bodies in the order the audit
      table requires (`diagram-bg` first — see "Rule 6 refined" above, it guarantees at least one
      case runs against a genuinely cold render cache), every original `expect()` converted to
      `expect.soft()`, `test.setTimeout(600_000)`. The 4 donor files were deleted (git history keeps
      them); two source comments that referenced the old filenames
      (`diagram-kit/diagram-dom.test.ts`, `diagrams/diagram-zoom-keys-gated.ts`) were repointed at
      the sweep. 2 independent real-VS-Code runs, both green (34.8s, 32.8s). Biome clean, no
      cognitive-complexity fixes needed.
      **The Rule 6-refined hypothesis was tested, not assumed: it held.** Cases 1-3 all open
      `all-renderers.md`; case 1 (`diagram-bg`) populates the render cache, so cases 2
      (`diagram-zoom`) and 3 (`diagram-inline-zoom`) run against a cache HIT rather than a fresh
      engine render. Both passed on every run — the decoration observers (wrapper classes, the
      Ctrl-wheel zoom gate, `data-vmarkd-zoom` markers) ran correctly over the cache-painted SVGs,
      confirming decoration is keyed off the painted DOM, not off a fresh-render event. Had either
      failed, the fix would have been to make the decoration path re-run on a cache-hit paint, not to
      reorder or loosen this sweep.

## Mechanics (apply to every family)

- [ ] Extract the shared-boot pattern as a helper (`test/vscode-e2e/webview-helpers.ts` already
      exists) rather than copy-pasting a `for` loop per family: one `test()`, N cases, `boot()`
      between cases, `expect.soft()` per case so failure isolation survives (450's Rules section).
- [ ] `test.setTimeout()` must scale with the case count — 450's post-merge correction found that a
      merged sweep can otherwise be killed mid-loop by the 90 s default and silently drop the
      `expect.soft()` reports for every case after that point. Same trap applies here, larger.
- [ ] Keep `test.describe` titles as the subject so the reporter stays readable. Single-test donor
      files whose only test moves into a sweep are DELETED (git history keeps them) — a family's
      spec count genuinely shrinks; this is not "merges `test()` blocks but keeps every file."
- [ ] Per family: run it solo in real VS Code **more than once**, before and after, and record both
      wall clocks here.
- [ ] Deliberately break one case in a merged sweep and confirm the other cases still report
      (450 proved the mechanism once; re-prove it once here because the reset between cases is
      cross-file this time, not a plain loop).
- [x] `freshStart` traced: `src/app/markdown-editor-provider.ts:110` constructs the
      `DiagramCacheHost` with `freshStart: !!process.env.VMARKD_E2E`, and it wipes on
      **construction** (`diagram-cache-host.ts:110-112`) — i.e. once per extension activation, which
      is once per VS Code boot/process, NOT once per document open. Confirmed by the comment
      recovered from `tmp/483/*/plantuml-phase-timing.spec.ts`: "VMARKD_E2E wipes the disk
      render-cache once per TEST, not per document open." So merging N cases into one `test()` does
      remove N−1 of the wipes — exactly the hazard the advisor flagged. It does NOT threaten the
      4-file group implemented below: none of those 4 assert cache-hit/cold-render behaviour (that
      IS `plantuml-cache.spec.ts`, already excluded by rule 2), and their fixtures are 4 distinct
      `.md` files with distinct diagram source, so cache keys (hashed on source) cannot alias across
      cases. **Rule for future sweeps: a case may only join a shared boot if it does not assert on
      cache state AND its diagram source is not byte-identical to an earlier case's in the same
      sweep** — add this as rule 6 alongside cold-start/lazy-load (rule 2), which already covers the
      specs that assert cache state directly.

## Explicitly out of scope

- A worker-scoped `electronApp` fixture (one VS Code for the whole run). That is the maximal version
  of this idea and the maximal version of 450's reset-boundary risk; it would make every spec's
  starting state depend on every earlier spec. Opt-in per family only.
- The 16 clipboard/focus specs (see 452) — they are fragile about focus even serially.
- `echarts-theme.spec.ts` and `cut-selection-sv.spec.ts` — excluded by 450's documented reasons,
  which do not change here.
