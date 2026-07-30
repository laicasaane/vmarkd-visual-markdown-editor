# 447 — Real-VS-Code e2e suite cost: where the time actually goes, and what to move down a layer

**Status:** analysis / proposal (nothing implemented, nothing deleted).
**Question asked:** which `test/vscode-e2e` specs can be moved to a lighter test layer to unclog the pipeline?

**Short answer:** very few — and that is the finding. Almost every spec header documents a
real-VS-Code-only mechanism (CSP + `asWebviewUri` resource pipeline, VS Code's injected default CSS,
the TeaVM/lazy-`loadScript` engines, the host `TextDocument`, VS Code's clipboard bridge), and the
keep-rule below vetoes them. The suite is not slow because it tests the wrong things at the wrong
layer; it is slow because of **four structural costs** that have nothing to do with which layer a
spec belongs to. Fixing those is worth an estimated **30–50 min of wall clock with zero coverage
loss**; the genuine layer-migrations are worth ~3–5 min.

⚠️ **The R1/R2/R3 savings below are NOT additive** — the sets intersect on the same files
(`mode-switch-render-reuse` is both the #1 sleeper and a 6→2 merge candidate;
`diagram-sizing-audit`'s 25 s of sleeps leave with it in R1). The 30–50 min total is
de-duplicated; the per-lever numbers are not.

⚠️ **Measured against the working tree, not `main`.** `caret-first-click-probe`,
`caret-focused-open-probe`, `caret-on-open-probe`, `font-parity` and `list-autoformat-space` are
still untracked on `feat/offline-diagram-renderers`, so ~7 of R1's 29 tests are this branch's own
uncommitted work.

---

## 1. Measured facts (2026-07-30, this machine)

| fact | value | how it was measured |
|---|---|---|
| spec files in the default run | **145** (13 `*spike*` files excluded by `testIgnore`, `@visual` by `grepInvert`) | `playwright test --list` |
| `test()` blocks in the default run | **270** | same |
| **VS Code boots per run** | **270 — one per `test()`, not per spec** | `vscode-test-playwright/dist/index.js`: the `electronApp` fixture is declared `{ timeout: 0 }` with **no** `scope: 'worker'`, so it launches + `electronApp.close()`s per test. Only `_vscodeInstall` / `_createTempDir` are worker-scoped. |
| cheapest possible real-VS-Code test | **3.2 s** | `webview.spec.ts` (boot → open → one assert) |
| typical cheap test | **4.5–8 s** | `copy-clipboard`, `editor-gutter`, `hr-edit` (7 tests / 44 s wall) |
| FAST tier | **33 tests / 12.8–15.8 min** ⇒ **23–29 s per test** | recorded in `playwright.config.ts` 2026-07-27 |
| chromium harness (`media-src/e2e`) | **9 tests / 5.9 s ⇒ 0.65 s per test** | `echarts.spec.ts` |
| **layer cost ratio** | **~20–40×** | above two rows |
| hardcoded sleep in the 145 default files | **945 s ≈ 15.8 min** (static floor — undercounts sleeps inside helpers called N times) | sum of `setTimeout(r, N)` + `waitForTimeout(N)` literals |
| estimated full-suite wall clock | **~90–115 min** (270 × ~20–25 s) | extrapolation from the FAST tier |

**Two comments in the tree are now wrong and should be fixed first, because they misdirect exactly
this kind of optimisation:**

- `playwright.config.ts:23` — *"every spec boots its own VS Code, so the cost is per SPEC, not per
  assertion — trimming slow assertions barely helps, dropping specs does"*. It is **per `test()`**.
  Consequence: splitting one test into four quadruples the boot cost, and merging four into one
  removes three boots. That inverts the optimisation advice the comment gives.
- `AGENTS.md` — *"164 tests, ~40 min"*. It is 270 tests and, on the FAST tier's own measured
  per-test rate, ~1.5–2 h.

---

## 2. The keep-rule used to classify

A spec **may** move down a layer when it needs nothing from VS Code but "open a document":

- `evaluateInVSCode` used **only** to `vscode.openWith` the fixture (grep count == 2), and
- no filesystem / `TextDocument` / clipboard / command / settings interaction.

It **must stay** in `test/vscode-e2e` when any of these hold — each backed by a scar in this repo:

| veto | why | evidence |
|---|---|---|
| `getComputedStyle` / `--vscode-*` / theme colour assertions | VS Code injects its own default CSS into the webview; the harness does not | `vscode-injects-webview-default-css`, `vditor-content-theme-shadows-markdown-body` |
| CSP / `asWebviewUri` / `loadScript` / Worker | the harness has no custom-editor resource pipeline; blob Workers are *rejected* in the real webview | `d2-elk-main-thread`, `graphviz-render-and-theme` |
| host `TextDocument`, save-to-disk, dirty state, undo-to-disk | only exists behind the custom-editor pipeline | task 190/191 nets |
| VS Code clipboard bridge, real `Ctrl+C/V/X` | a synthetic `ClipboardEvent` does not drive Vditor's edit/undo pipeline | `mouseops-l2-vs-l3-edit-pipeline` |
| caret / focus / OS-focus behaviour | does not reproduce in the harness iframe | `webview-focus-scroll-not-in-harness` |

Applying that rule to all 145 files leaves the migration list in §4 — deliberately short.

---

## 3. The four structural costs (this is where the time is)

### R1 — ~29 tests are measurements that assert nothing (est. **−12 to −20 min**, zero coverage loss)

*(29 tests at the FAST tier's measured 23–29 s ⇒ ~12–14 min; the upper end is for this set being
heavier than average — `d2-edit-perf` types letter-by-letter, `perf-prose-typing` opens large docs,
`diagram-sizing-audit` carries 25 s of its own sleeps.)*

Their own headers say so: *"pure measurement: nothing is asserted pass/fail"*, *"MEASUREMENT, not a
gate"*, *"THROWAWAY probe"*, *"prints; asserts nothing"*, *"the assertion is trivial so it never
blocks CI"*. `*spike*` files are already excluded for exactly this reason (audit 185/1c); these were
simply never given the same treatment.

| file | tests | file | tests |
|---|---|---|---|
| `d2-edit-perf` | 6 | `perf-observer-fleet` | 2 |
| `caret-focused-open-probe` | 3 | `probe-cloudogu` | 2 |
| `caret-on-open-probe` | 2 | `caret-first-click-probe` | 2 |
| `perf-prose-typing` | 1 | `perf-timeline` | 1 |
| `katex-open-cost` | 1 | `diagram-sizing-audit` | 1 |
| `list-typing-probe` | 1 | `list-editing-probe` | 1 |
| `probe-pumlmode` | 1 | `native-preview-probe` | 1 |
| `webview-message-origin-probe` | 1 | `prerender-first-open` | 1 |
| `diagram-edit-scroll` | 1 (timing comparison — inherently noisy) | `mermaid-markers` | 1 (a one-assert "probe", harness `mermaid.spec.ts` covers markers) |

**Do it with a `@probe` tag + `grepInvert`, not a filename glob** — the glob `**/*probe*` would also
catch three files that are real regression nets despite their names: `undo-dirty-probe` (in SMOKE),
`undo-redo-steps`, `diagram-cache-reply-source` (its header explicitly says *"STANDING NET — do not
delete it as scratch"*). `hljs-colour-timing` also started as a probe and is now the regression net
for tasks 427/431 — keep it. Run the tier on demand: `VMARKD_PROBES=1`.

### R2 — 122 tests live in 27 files that re-boot VS Code for the same fixture (est. **−15 to −20 min**, zero coverage loss)

Because the boot is per `test()`, a parameterised spec pays a full VS Code launch per parameter.
The worst offenders:

| file | tests | note |
|---|---|---|
| `clipboard-elements` | **23** | one copy + one paste test per markdown element, all on one fixture → 23 boots for 2 mechanisms |
| `paste-url-link` | 8 | |
| `mode-switch-render-reuse` | 6 | also the worst sleeper (109 s) — this file is why R2 and R3 cannot both bank their savings |
| `list-tight`, `paste-over-selection`, `plantuml-stdlib` | 5 each | |
| `block-fidelity`, `caret-tab-return`, `cut-selection`, `echarts-theme`, `geojson-basemap`, `inline-code-gap`, `mode-switch-parity` | 4 each | |
| 14 further files | 3 each | `callout-edit`, `clipboard-collapsed`, `d2-sketch`, `d2-theme`, `diagram-edit-monitor`, `echarts-resize`, `link-button-url`, `mermaid-elk`, `perf-edit`, `plantuml-stdlib-more`, `prose-fast-edit`, `smiles-render`, `wavedrom-theme`, `wysiwyg-parity` |

(`d2-edit-perf`, 6 tests, and `caret-focused-open-probe`, 3, are counted in **R1** only.)
Merging each to ~2 tests → ~54 tests, i.e. **~68 fewer boots**, plus the redundant re-open + settle
each of those boots pays.

- **Trade-off (stated, not hidden):** one merged test = one failure line, and it stops at the first
  failed assertion. **Mitigation: `expect.soft()`** for the independent assertions inside a merged
  test — every failure is still reported separately, one boot pays for all of them.
- **Two files must NOT be merged**, their headers document why: `echarts-theme` (light/dark
  deliberately separate process invocations — a second test in the same run reads a stale shared
  echarts theme) and `cut-selection-sv` (kept separate because the identical sequence no-ops as a
  later test in a multi-test file).

### R3 — 15.8 min of hardcoded `setTimeout` settles (est. **−8 to −12 min**)

Static floor over the 145 default files. Top: `mode-switch-render-reuse` **109 s**,
`wysiwyg-parity` 51 s, `theme-flip-during-first-render` 45 s, `mode-switch-parity` 43.7 s,
then `d2-table-chrome` / `diagram-sizing-audit` / `plantuml-sprite-size` 25 s each,
`mermaid-style-scope` / `svg-marker-refs` 24 s, `inline-code-gap` 22 s.

Most are "settle" waits that can become `expect.poll` / `waitFor` on the condition the test already
knows (`data-vmarkd-cache-hit` set, SVG child count stable, `data-processed`). A settle that must
stay a sleep (a *negative* assertion — "nothing re-renders in the next N ms") should say so in a
comment, so the next reader does not retry the conversion.

### R4 — the suite runs on ONE worker; sharding is unverified but the fixtures look built for it (potential **2–3×** on whatever remains)

`playwright.config.ts` sets `workers: 1` with the comment *"VS Code single-instances; never
parallelise within a worker"*. `git log -S"workers"` shows that line has been there since the
initial scaffold commit (`35cdf99`) — **it is an untested default, not scar tissue from a failed
attempt.** And the fixture design already isolates per worker: `_vscodeInstall` installs into
`.vscode-test/worker-${parallelIndex}`, `_createTempDir` is worker-scoped, so `--user-data-dir`
(hence `globalStorageUri`, hence the diagram cache the config warns about) is per worker.

**Unresolved, and narrowed:** `--workers=3` (with *and* without `--fully-parallel`) did **not**
spawn extra workers — the JSON report shows `config.workers: 3` (so Playwright **did** receive the
flag; it is not the CLI or the `rtk` wrapper eating it) yet every one of the 7 tests ran on
`workerIndex: 0`, `.vscode-test/worker-1` / `worker-2` were never touched, and the wall clock was
flat (44.2 s → 42.3 s → 49.1 s). No spec declares `describe.configure({mode:'serial'})`. So
Playwright accepted a 3-worker config and executed serially anyway — the cause is in the project /
fixture setup (prime suspect: the worker-scoped `_vscodeInstall` fixture declared `timeout: 0`),
**not** in the tier scripts. That is a ~30-minute dig with a real 2–3× payoff. Note the one-time
cost when it works: each worker unzips its own VS Code (**~2 GB per worker dir**); pre-seeding by
copying `worker-0` avoids the re-download.

**Related, cheaper knob:** `retries: 2` means every genuinely failing test costs **three** boots.
On a green run that is free; on a red one it inflates the suite by exactly the flaky tail. Consider
`retries: 1` for local/full runs and keeping 2 only for the CI smoke gate.

---

## 4. Genuine layer migrations (small — est. −3 to −5 min)

These pass the keep-rule. Everything else in the suite fails it.

| spec | tests | move to | why it is safe |
|---|---|---|---|
| `inline-pad` | 1 | **delete** | it asserts IR == WYSIWYG inline-code padding "in the real webview to catch a bundled-vs-copied `index.css` mismatch" — ADR-0004 removed that drift (one `<link>` to one patched copy, the same file the harness loads), and `media-src/e2e/wysiwyg-inline-pad.spec.ts` already covers the property |
| `mermaid-markers` | 1 | **delete** (or fold into the harness) | header is one line, title is *"mermaid SVG marker probe"*; `media-src/e2e/mermaid.spec.ts` renders mermaid |
| `list-ops` | 1 | harness `list.spec.ts` | Enter-continues-a-list asserted via `getValue()` — pure Vditor + Lute, no host API |
| `mode-roundtrip` | 1 | harness | ir→wysiwyg→sv→ir byte-stability is Vditor's per-mode serialisation; no host API (it is in FAST today, so this also lightens the routine tier) |
| `preview-width` | 1 | harness `width.spec.ts` | edit↔preview column width; the harness has `width-harness.ts` |

**Verify-then-migrate (do NOT move blind):** `diagram-width`, `diagram-sizing`. Their headers claim
*"the harness doesn't render the real diagrams"* — that was true when written, but the harness now
has `custom-diagrams-harness.ts`, `mermaid-harness.ts` and `echarts-harness.ts`. Unblocking them
needs a harness entry that mounts arbitrary fenced blocks (the same gap that makes D2 `test.fixme`
there: the harness DOM has no `.language-d2`). Worth a spike only after R1–R3.

**Explicitly NOT migratable**, though they look like renderer-only tests at first glance — each is
vetoed by a documented mechanism: every `plantuml-*` spec (TeaVM lazy-load + the `!include` expander
run behind CSP/`loadScript`), every `d2-*` spec (resource-URI pipeline; D2 is `fixme` in the
harness), `graphviz` / `nomnoml` / `wavedrom` / `vega` / `stl` / `geojson-*` (palette pairing reads
the real theme's computed colour; Leaflet tiles are CSP-gated), `local-assets-only`,
`hljs-initial-stylesheet`, `font-parity`, `editor-gutter`, `diagram-bg`, `trailing`, `bottom-gap`,
`viewport-scroll`, and everything touching disk / clipboard / caret.

---

## 5. Recommended order

1. **Fix the two stale comments** (`playwright.config.ts:23`, `AGENTS.md`) — 5 min, prevents the next
   person optimising against the wrong cost model.
2. **R1** `@probe` tag + `grepInvert`, `VMARKD_PROBES=1` to run them. Biggest win per hour of work.
3. **R2** merge the top 8 files (`clipboard-elements` alone is 23 → 2 boots), `expect.soft` inside.
4. **R3** convert the top 6 sleepers to `expect.poll`.
5. **R4** the 10-minute sharding experiment; only then decide.
6. **§4** migrations + the harness diagram-mount spike.

Arithmetic: today **~90–115 min**, minus the de-duplicated **30–50 min** of R1+R2+R3 ⇒ the full
suite should land around **45–60 min** with unchanged coverage. R4, if it works, would take that to
**15–25 min**.

## 6. Checklist

- [ ] `playwright.config.ts` cost comment corrected (per-test, not per-spec)
- [ ] `AGENTS.md` tier numbers refreshed (270 tests; measured full-suite time)
- [ ] `@probe` tag + `VMARKD_PROBES` gate; the 29 tests in R1 tagged (nets in R1's note NOT tagged)
- [ ] top-8 R2 files merged with `expect.soft`; `echarts-theme` + `cut-selection-sv` left alone
- [ ] top-6 R3 sleepers converted to `expect.poll`; unavoidable sleeps commented as negative assertions
- [ ] sharding experiment run and recorded here (worker count proven via `--reporter=json`)
- [ ] §4 migrations landed; harness diagram-mount spike decided
- [ ] re-measure the full suite and record the before/after here
