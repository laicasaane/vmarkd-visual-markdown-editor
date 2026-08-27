# 512 — The residual fixed settle sleeps 451 did not reach

**Status:** Nine batches done — see Sessions 1–9 below. 36 files converted, 6 audited and retained;
the remaining default-tier inventory is in progress.
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Follows:** [451](done/451-e2e-replace-fixed-sleeps.md) — converted 7 candidate files, deliberately
left 3, and never inventoried the long tail
**Potential:** **≈11 min** of the full suite, and it is *smeared*, not concentrated — see the shape
below before deciding this is worth a session.

## Inventory (2026-08-12, corrected — default tier only, `@probe`/`@visual`/spike excluded)

**Correction:** the first pass of this inventory only grepped raw `setTimeout(ident, N)` and missed
that most specs call the shared `settle(frame, N)` / `settle(N)` helper
(`webview-helpers.ts:settle`), which wraps the identical `setTimeout` internally — so specs calling
`settle()` were invisible to a `setTimeout`-only grep. Counting both:

- **134 files, 408 calls, 813 s total (13.6 min).** A further 209 s lives in probe/visual/spike
  files that no tier runs — ignore those.
- The **top 3 files are 140 s of that (2.3 min) and are already excluded by 451 with reasons
  recorded in-source**: `wysiwyg-parity` 51 s, `theme-flip-during-first-render` 45 s,
  `mode-switch-parity` 43.7 s. Do not re-litigate them without new evidence.
- ⇒ reachable ≈ **11.2 min**, of which `format-hotkeys` alone (31 `settle()` calls, one per hotkey
  case, task 456's toolbar-debounce wait) holds 25.7 s, the rest of the head-20 holds ~3.7 min, and
  a tail of **114 files holds 440 s** — i.e. ~3.9 s per file. That tail is where the audit cost
  exceeds the payoff; take it only opportunistically, when already editing the file for another
  reason.

Head of the reachable list (seconds of sleep, number of calls):

| file | sleep | calls | note |
|---|---|---|---|
| `format-hotkeys` | 25.7 s | 31 | ⚠️ **deprioritized despite #1 by raw seconds** — see the new rule above; its settles guard a delayed double-fire, not a positive completion signal |
| `paste-over-selection` | 16.0 s | 7 | |
| `inline-code-gap` | 15.5 s | 8 | already partially converted by task 419; remaining settles are the vetted residue |
| `diagram-edit-monitor` | 15.0 s | 5 | |
| `list-tight` | 14.5 s | 6 | |
| `cross-diagram-edit` | 14.0 s | 3 | |
| `plantuml-stdlib-more` | 14.0 s | 3 | |
| `plantuml-stdlib` | 14.0 s | 3 | |
| `echarts-resize` | 13.7 s | 6 | resize/geometry settle — likely a positive completion signal, good first candidate |
| `cut-selection` | 13.5 s | 6 | already partially converted by task 419; remaining settles are the vetted residue |
| `sv-split` | 13.0 s | 6 | pane-geometry settle — likely convertible, good first candidate |
| `local-link-open` | 11.5 s | 8 | |
| `diagram-resize` | 11.3 s | 5 | window-resize settle — likely convertible, good first candidate |
| `echarts-theme` | 11.0 s | 4 | theme-state, see 451's own exclusion for the family — do not convert without re-reading why |
| `markmap-resize` | 10.2 s | 5 | resize/geometry settle — likely convertible, good first candidate |
| `doc-sync` | 10.0 s | 5 | |
| `ir-inline-code-line` | 10.0 s | 1 | |

`format-hotkeys`, `inline-code-gap`, `cut-selection` are in the FAST tier (they run every routine
pass) — converting those buys back FAST wall clock too, not just the full suite's, but two of the
three are already-vetted residue and the third is deprioritized (see above), so the FAST-tier win
from this table is smaller than "3 files are in FAST" suggests. The rest of the head-20
(`diagram-sizing`, `retheme-flip-matrix`, `smiles-render`, `abc-flip-cache-hit`) are default tier
only.

**Suggested first batch (2026-08-12): `diagram-resize`, `echarts-resize`, `markmap-resize`,
`sv-split`** — 4 files, ~48.3s / 22 calls, all resize/pane-geometry settles with a plausible
positive-completion signal (final rendered width/height), none flagged by the double-fire hazard
above. Read each fully before converting — this is a plausibility read from headers/names, not the
full-file audit 511's PlantUML/D2 passes did.

Reproduce (counts BOTH forms; write the character class out — `[\w$]` inside a JS/ERE bracket is a
literal `w`, not a shorthand, and silently under-counts):

```bash
grep -ohE 'setTimeout\(\s*[A-Za-z_$][a-zA-Z0-9_$]*\s*,\s*[0-9_]+|settle\(\s*([A-Za-z_$][\w$.]*\s*,\s*)?[0-9_]+\)' test/vscode-e2e/*.spec.ts
```

## Rules (carried over from 451, they were learned the hard way — plus one found here 2026-08-12)

- A sleep may only become a poll when there is a **condition that is actually observable** —
  451's premise correction: several of these sleeps wait for something with no DOM/state signal
  (an engine settling, a theme batch landing), and a poll there just re-invents the sleep with
  extra flakiness.
- `block-fidelity` is the cautionary case: 3 of 4 sleeps converted clean, the 4th passed 28/28 solo
  and still flaked once inside a 39-test FAST run. **Solo green is not proof.** Convert, then run
  the file inside the FAST tier, not only on its own.
- Any conversion that removes ≤1 s is not worth the flake risk — skip it and say so.
- **New rule, found auditing `format-hotkeys.spec.ts` (do NOT convert that file on the strength of
  its raw seconds count):** a sleep that exists to prove a DELAYED SECOND EFFECT never fires is not
  convertible to `expect.poll(...).toContain(...)` even though the assertion right after it looks
  like an ordinary positive-completion check. `format-hotkeys` exists because of native-execCommand
  double-fire bugs (Ctrl+B running both the VS Code command AND Chrome's built-in contenteditable
  bold) and hotkey-dedupe regressions — its 900ms/1200ms settles are there so a delayed SECOND fire
  has time to corrupt the text before the assertion reads it. A poll that resolves the instant
  `getValue()` first matches the expected string would pass on the FIRST (correct) fire and never
  wait around for a second one — which is exactly the bug class this file was written to catch, so
  converting it would keep the test green while quietly deleting its regression coverage. The
  distinguishing question before converting ANY settle-then-assert pair: is the wait proving
  something POSITIVE happened (convertible — poll for that positive signal), or proving something
  NEGATIVE does NOT happen afterward (not convertible — a poll can only detect presence, not
  confirm absence-over-time). `format-hotkeys` is reclassified out of the head-of-list priority
  order below for this reason, despite being the single largest file (25.7s/31 calls) — do not
  "fix" it without re-deriving this reasoning first.

## Steps

- [x] Take the head of the table above file by file, cheapest-observable-condition first. (First
      batch: `diagram-resize`, `echarts-resize`, `markmap-resize`, `sv-split` — see Session 1.)
- [x] Per file: measure before/after with a `git show HEAD:<path> > <path>` swap (451's method — a
      real baseline, not an inferred one), and record both numbers here. (Gotcha hit on
      `echarts-resize`: the working tree already had uncommitted changes to that file BEFORE this
      session started — visible in the session's initial `git status`, unrelated prior work had
      already merged its 3 tests down to 2. `git show HEAD:` therefore returned a STALE 3-test
      baseline, not what this session actually started editing from. Caught by comparing baseline
      line counts against the file content read at the very start of the session; the true baseline
      was reconstructed from that first read, not from `git show HEAD:`. Always check `git status`
      for the target file before trusting a `git show HEAD:` swap as "the real baseline" — HEAD is
      only correct when the working tree matches it.)
- [x] After each converted file, run it solo **and** inside `test:vscode:fast` before ticking it.
- [x] Record every sleep deliberately left, with the reason, in-source *and* here — the exclusions
      are the durable output; the next reader must not re-open them. (See Session 1.)

## Session 1 (2026-08-12) — first batch: diagram-resize, echarts-resize, markmap-resize, sv-split

Converted 3 of 4 files (12 of 25 real sleep calls); `sv-split` left entirely untouched (comment-only,
0 of 6 converted) per its own SMOKE-tier conservatism instruction. Every solo run used
`--repeat-each≥2` (rule: "solo green is not proof", task 451's `block-fidelity` lesson) before being
accepted, and a real regression WAS caught this way (see `diagram-resize` below) — proof the extra
runs were load-bearing, not ceremony.

| file | before (solo) | after (solo) | repeat runs | sleeps converted | sleeps left |
|---|---|---|---|---|---|
| `diagram-resize.spec.ts` | 20.4s | ~10.5s (10.6/10.5/10.3s) | 3/3 clean (after a fix — see below) | 4 of 5 | 1 (800ms, pre-mode-switch-click) |
| `markmap-resize.spec.ts` | 18.3s | ~9.2s (9.3/9.5/8.8s) | 3/3 clean | 4 of 5 | 1 (800ms, pre-mode-switch-click) |
| `echarts-resize.spec.ts` | **36.1s** (true baseline, see gotcha above — NOT the 13.7s/6-call inventory figure) | ~26-27s (26.2s solo; 24.8s avg across a `--repeat-each=2` pair) | 5/5 clean across 3 separate runs | 4 of 9 real sleeps | 5 (2×2000ms sidebar-animation settle, 3× `wait()` calls in the negative preview-resize scenario) |
| `sv-split.spec.ts` | n/a (unchanged) | n/a (unchanged) | 1/1 (sanity only, no logic changed) | 0 of 6 | 6 (all — SMOKE-tier conservatism) |

**`echarts-resize.spec.ts` census correction:** the file actually contains **9** real sleep calls,
not the 6 the inventory's regex counted (17.3s of real sleep time, not 13.7s) — 3 of them go through
a LOCAL `wait(ms)` helper defined inside the test (`const wait = (ms) => …evaluate((_b, m) =>
setTimeout(r, m), ms)`), which passes `ms` as a **variable** at the `setTimeout` call site, invisible
to the inventory's `setTimeout(ident, LITERAL)` regex — the exact class of undercount the inventory's
own "Correction" section already flagged for the `settle()` helper, but this is a THIRD undercounted
shape (a per-file local helper, not the shared one). Worth a grep pass for other local `wait`/`pause`
helpers in the untouched tail before trusting their inventory numbers at face value.

**`diagram-resize.spec.ts` — a real regression, caught by `--repeat-each=2`, fixed before acceptance.**
First conversion attempt used a bare `value > 0` poll condition to establish the WYSIWYG "wide"
baseline (`wyAbcWide`) after a viewport widen + mode-switch. On the very first `--repeat-each=2` run
this flaked: `wyAbcNarrow < wyAbcWide` failed with `21` not `< 21` — both reads were `21`, the
**narrow** value, not the expected wide value (~92). The bare `>0` condition was satisfied by a STALE
leftover measurement (abc's content hadn't yet reflowed to the newly-widened container) on the very
first poll tick, so the poll resolved instantly on the wrong state — an `expect.poll` will always
take the FIRST true reading, and "nonzero" was too weak a bar when both the transitional and the
final values are nonzero. Root-cause fixed with a `pollStable()` helper (in-source in
`diagram-resize.spec.ts`) that requires the SAME nonzero value on two CONSECUTIVE poll ticks before
accepting it — abc's viewBox rescale is a one-shot synchronous re-layout, not an eased animation, so
"unchanged across an interval" is a real completion signal that doesn't need a magic width threshold.
Re-verified 3/3 clean after the fix. `markmap-resize.spec.ts`'s analogous conditions were NOT
switched to `pollStable` — its floor thresholds (`contentW > 300`) sit meaningfully between the
fixture's actual narrow (~101px) and wide (~513-801px) values, so a stale-narrow leftover reading
cannot satisfy them by coincidence the way abc's near-zero `>0` bar could; verified 3/3 clean as
originally converted. **Lesson for the untouched tail:** a poll's threshold must be strong enough
that a STALE prior-state reading cannot satisfy it — a bare presence/`>0` check is only safe when the
prior and target states can't both be "present"; prefer a magnitude floor with real margin, or
`pollStable`-style two-consecutive-reads, over presence alone.

**Per-sleep classification (positive vs. negative, rule 2):**
- `diagram-resize.spec.ts`: all 5 sleeps are POSITIVE (proving a resize/mode-switch DID reshape the
  content) — 4 converted, 1 (800ms, immediately before the WYSIWYG mode-switch toolbar click) left
  because it is BOTH ≤1s (rule 3) AND the exact pre-mode-switch-click shape `block-fidelity` (task
  451) had to revert after a poll-based fix passed solo and flaked in the FAST tier for an
  unidentified reason.
- `markmap-resize.spec.ts`: same shape, same verdict — 4 converted, 1 (800ms, pre-mode-switch-click)
  left for the identical two-reason stack.
- `echarts-resize.spec.ts`: the 4 converted (initial-render + narrow/wide viewport settles in the
  second test, initial-render in the first) are POSITIVE. The 2 left sidebar-toggle sleeps (2000ms
  each) are POSITIVE in principle but the completing signal is VS Code's OWN CSS transition
  (sidebar collapse), which carries no code-level marker — a width-stability poll there is the
  geometry-quiescence-across-an-animation shape task 451 already excluded (`wysiwyg-parity` /
  `mode-switch-parity`), so left as sleeps rather than risk a false-early poll mid-transition. The 3
  `wait()` calls in the preview-overlay block are NEGATIVE (rule 2 outright): the scenario proves a
  resize arriving while the IR chart is hidden does NOT collapse it — `wait(600)` is the window in
  which a buggy fit() would do its damage, and the trailing `wait(1500)` guards a DELAYED
  post-unhide collapse that a poll on `end > 0` would resolve past before it could occur.
- `sv-split.spec.ts`: LEFT ENTIRELY, all 6 POSITIVE-vs-NEGATIVE calls stated in-source. Two are
  outright NEGATIVE (rule 2: the 3000ms morph-probe settle proves a delayed teardown does NOT tear
  an unchanged diagram down — a poll on the edit landing would resolve before that teardown had its
  chance). Two are ≤1s (rule 3: 400ms scroll-snapshot, 600ms split-sync-snapshot). Two are POSITIVE
  and technically pollable but left per the file's own SMOKE-tier conservatism instruction: the
  6000ms post-sv-switch settle gates a 5-engine render battery that the very next block (the morph
  probe) needs FULLY quiescent, not just first-true — a composite poll would resolve the instant the
  fastest engine crosses its floor, racing the morph probe against still-in-flight engines; the
  1500ms post-ir-switch settle is a POST-mode-switch-click settle, the same family as
  `block-fidelity`'s reverted PRE-click settle, and this file is the batch's designated
  most-conservative member. Net: `sv-split` stays exactly as it was — 0 conversions, all 6 sleeps now
  carry an inline `task 512: leave` comment naming the specific reason.

**Verification:** `node build.mjs` clean; `npx biome check` clean on all 4 files; each converted file
run solo `--repeat-each≥2` (3/3 or 5/5 clean after the `diagram-resize` fix above);
`xvfb-run -a npm run test:vscode:fast` run once as the combined-tier check (result recorded once the
run completes — see below).

## Session 2 (2026-08-27) — paste/list writeback and diagram edit-monitor batch

Rebuilt the inventory from the current Playwright default discovery set before selecting the batch:
**160 files / 128 files with fixed waits / 400 static call sites / 779.55s** remaining after Session
1. The census now includes imported `settle`, direct literal `setTimeout`, `waitForTimeout`, and
local literal-delay wrappers; it excludes `@probe`, `@visual`, and spike tests. After this batch:
**386 call sites / 745.05s** remain — **14 fixed waits and 34.5 static seconds removed**.

| file | before (solo) | after (solo) | repeat evidence | converted | retained |
|---|---:|---:|---|---:|---:|
| `paste-over-selection.spec.ts` | 41.3s | 28.2s avg (27.6/28.7s) | 10/10 after restoring the pre-mode-switch guard | 6 of 7 | 1×1500ms |
| `list-tight.spec.ts` | 28.4s | 20.3s avg (20.6/19.9s) | 4/4 after restoring the pre-mode-switch guard | 5 of 6 | 1×1500ms |
| `diagram-edit-monitor.spec.ts` | 26.0s | 21.4s avg (21.6/21.2s) | 4/4 | 3 of 5 | 2×4000ms |
| `cross-diagram-edit.spec.ts` | 30.3s | unchanged | 1/1 baseline; comment-only | 0 of 3 | all 3 |
| `cross-diagram-edit-ir.spec.ts` | 16.2s | unchanged | 1/1 baseline; comment-only | 0 of 2 | both |

**Conversions and retained waits:**

- `paste-over-selection`: boot readiness now polls for the actual editor text; every paste/type
  waits for the exact host-document bytes the hard assertion reads; mode-switch completion polls
  the target pane's content. The one retained 1500ms wait is immediately before the mode-switch
  click — the task-451 `block-fidelity` family.
- `list-tight`: boot and mode-switch readiness poll rendered content. Each list mutation polls its
  required document invariants and requires the same satisfying document state across consecutive
  reads, so a transient pre-repair state cannot end the wait. The WYSIWYG case retains the same
  1500ms pre-mode-switch-click guard as `paste-over-selection`.
- `diagram-edit-monitor`: initial single-engine geometry requires two identical complete snapshots;
  graphviz recovery polls for the restored SVG/error/height state. The two 4000ms post-edit waits
  remain because they are deliberate observation windows: rAF sampling must stay active long enough
  to catch a transient collapse before the final render.
- `cross-diagram-edit` and `cross-diagram-edit-ir`: all waits remain. Their assertions fingerprint
  geometry across 14 asynchronous renderer families; first-true polling can accept a transient
  plateau. Each retained wait now carries its reason in-source.

**Regression caught and fixed red-to-green:** the first conversion removed the pre-mode-switch
margin from `paste-over-selection` and `list-tight`. Under `--repeat-each=2`, both WYSIWYG attempts
lost the click permanently (`.vditor-wysiwyg` stayed hidden for 61 checks) and passed only on retry —
the exact task-451 failure shape. Restored only the 1500ms pre-click guards; the next no-retry
equivalent set was 10/10 clean, and both list-tight tests were clean inside FAST.

**Verification:** `node build.mjs` exit 0; focused Biome checks and
`npm run typecheck:vscode-e2e` clean. Five-file baseline: 9/9 in 2.5m. Post-change converted specs
ran repeated as recorded above. `npm run test:vscode:fast` exited 0 in 11.9m: all 59 expected tests
eventually passed and the changed list-tight spec was first-attempt green; two untouched
`noop-check-on-save` tests failed their first attempts and passed their configured retries. A
systematic follow-up reproduced that spec's existing undo-setup instability with retries disabled;
three attempted readiness/focus-isolation hypotheses did not fix it, so all experimental changes to
that unrelated file were reverted rather than broadening task 512 into a task-434 test redesign.
Real-VS-Code commands used the host's existing `DISPLAY=:0` with `ELECTRON_RUN_AS_NODE` unset because
this managed image does not contain `xvfb-run`; Electron also required the approved unsandboxed
execution path.

## Session 3 (2026-08-27) — PlantUML completion signals and local-link outcomes

Re-ran Playwright default discovery before selection: **241 tests / 160 files**, with the same 128
files containing static wait syntax as Session 2. Applying this batch's exact delta to Session 2's
census leaves **372 static call sites / 704.05s**: **14 calls and 41.0 static seconds removed**. A
second AST census exposed two distinctions the old file-level inventory blurred:

- two waits totalling 9s in `plantuml-stdlib-more.spec.ts` live only inside `test.skip` blocks and
  therefore cost no default-tier runtime; they were classified as dormant rather than claimed as
  savings;
- `plantuml-type-support.spec.ts`'s 12s `waitForSvg` value is a MutationObserver deadline that
  resolves immediately when the SVG arrives, not an unconditional settle. It remains with an inline
  classification and is excluded from the fixed-sleep total.

| file | before | after (two no-retry passes) | converted | retained / excluded |
|---|---:|---:|---:|---:|
| `plantuml-render-sweep.spec.ts` | 26.6s | 13.7s / 12.8s | 4 calls / 14.0s | none |
| `plantuml-stdlib-more.spec.ts` | 12.7s | 8.8s / 7.9s | 1 call / 5.0s | 2 skipped-only calls / 9.0s |
| `plantuml-stdlib.spec.ts` | 66.1s | 32.8s / 32.2s | 3 calls / 14.0s | none |
| `plantuml-type-support.spec.ts` | 26.9s | 23.0s / 23.3s | 1 call / 1.0s | conditional 12s deadline |
| `local-link-open.spec.ts` | 52.4s | 35.2s / 34.8s | 5 calls / 7.0s | 3 calls / 4.5s |

The focused baseline was **11 passed / 2 skipped in 3.2m**. Repeated post-change verification was
**22 passed / 4 skipped in 4.0m**, or ~2.0m per pass. The per-test durations improved by ~72.5s per
pass (184.7s baseline versus 112.3s average); the deterministic static reduction is 41.0s, and the
remainder is machine/load variance rather than claimed wait savings.

**Completion conditions and retained waits:**

- The PlantUML render sweep now waits on the notes, text, dimensions, and final
  `data-vmarkd-scaled` state its assertions consume. Source tracing confirmed that PlantUML's
  MutationObserver performs note insertion and scaling synchronously after SVG insertion and before
  releasing the serial render queue. The DomainStory no-note case requires two identical complete
  reads so a first-true negative cannot end the wait before that observer callback.
- Stdlib readiness polls the exact non-fatal, non-empty, loaded-map and palette/sprite contracts.
  This replaces SVG-count-plus-sleep without inventing a geometry threshold.
- Type-support readiness polls the real `window.__vmarkdCdn` dependency; its per-generated-diagram
  MutationObserver deadline remains because it is already condition-based.
- Local markdown targets poll for the exact new vMarkd tab, and the missing target polls the captured
  error message. The pre-mode-switch 1500ms guard remains in the task-451 lost-click family. The
  directory and HTTPS cases retain 1500ms observation windows because they assert that no editor tab
  opens while their Explorer/OS effects have no pollable completion state in this harness.

**Verification:** focused Biome and `npm run typecheck:vscode-e2e` clean; focused repeated
real-VS-Code run 22/22 passed with 4 expected skips; `node build.mjs` exit 0; routine
`npm run test:vscode:fast` **59/59 first-attempt passed in 9.8m** (including both
`noop-check-on-save` cases that retried in Session 2). Commands again used `DISPLAY=:0`,
`ELECTRON_RUN_AS_NODE` unset, and the approved unsandboxed Electron path because `xvfb-run` is not
installed in this managed image.

## Session 4 (2026-08-27) — document sync, inline geometry, and tab-return focus

This FAST-tier batch removed **6 static call sites / 20.5s**, leaving **366 call sites / 683.55s**
under Session 2's census method.

| file | before | after | converted | retained |
|---|---:|---:|---:|---:|
| `doc-sync.spec.ts` | 24.1s | 15.5s avg across 3 no-retry pairs | 3 calls / 6.0s | 2 calls / 4.0s |
| `ir-inline-code-line.spec.ts` | 16.9s | 6.0s / 8.6s | 1 call / 10.0s | none |
| `caret-tab-return.spec.ts` | 66.5s | 41.9s / 44.6s | 2 calls / 4.5s | 6 calls / 4.7s |

The static reduction is 20.5s. Summed test durations improved from 107.5s to ~66.1s average
(~41.4s observed); the difference is runtime/load variance and repeated execution of helper call
sites, not additional claimed static savings.

**Conversions and retained waits:**

- `doc-sync`: boot and webview-to-host writeback poll rendered/source text; external update polls the
  exact rendered-text plus preserved-scroll contract. The 2500ms no-echo window remains because it
  proves a delayed version increment does not occur. The external-scroll test's 1500ms initial-layout
  settle also remains: removing it made late Vditor lifecycle work reset the deliberately-set
  `scrollTop` to 0 in 2/3 no-retry diagnostic runs even though the fixture text was already rendered.
- `ir-inline-code-line`: the former 10s wait now polls the complete fixture, line-position, hidden and
  expanded marker widths, and non-code marker-scope contract. A transitional table cannot satisfy
  the composite.
- `caret-tab-return`: returning polls the actual visible/focused caret state, and WYSIWYG/SV mode
  readiness polls the anchor content. The 1500ms tab-away window remains: a failed conversion proved
  VS Code reports this retained-context webview's `document.visibilityState` as `visible` even while
  another editor is active, so the hide/focus-loss phase has no webview marker. The boot guard remains
  for the task-451 pre-mode-switch lost-click family; 400–500ms caret/scroll snapshots remain under
  the ≤1s rule.

**Systematic regression evidence:** the first tab-away conversion failed 2/2 with expected `hidden`,
received `visible`; restoring only that observation window made the no-retry IR case green. The first
external-scroll conversion then failed 2/3 with `{ hasExternal: true, scrollTop: 0 }`; restoring only
its pre-scroll layout guard made the scenario 3/3 no-retry green at `scrollTop=90`.

**Verification:** focused Biome and `npm run typecheck:vscode-e2e` clean; corrected focused runs gave
repeated green evidence as above; final `npm run test:vscode:fast` **59/59 first-attempt passed in
9.9m**, including all seven changed-file tests. Electron used the same approved `DISPLAY=:0`,
`ELECTRON_RUN_AS_NODE`-unset path.

## Session 5 (2026-08-27) — shared diagram render/interaction sweep

`diagram-render-sweep.spec.ts` removed all **5 long unconditional calls / 16.5s**. Under Session 2's
census method this leaves **361 calls / 667.05s**. Its short behavior-bearing waits remain: two
400ms D3 transition observations, one 150ms re-decoration handoff, and a 20ms Leaflet rAF polling
interval (the latter is conditional rather than a one-shot settle).

The four merged cases now gate on their actual dependencies:

- background audit: all seven custom-renderer families have painted before the negative
  `hljs`/background census runs;
- zoom gate: IR and Preview markmap/mindmap canvases exist and plain/Ctrl wheel events report the
  expected handler state;
- inline zoom: `data-vmarkd-zoom="1"` is itself the observer's completion marker, so no follow-on
  sleep is needed;
- keyboard zoom: the static-SVG decorator, retained Markmap instance (`svg.__vmarkdMm`), and retained
  Leaflet map (`wrapper.__vmarkdMap`) are all present before interaction.

**Systematic regression evidence:** the first keyboard probe incorrectly expected tab stops and
failed 2/2 (`mermaid=-1`, Markmap/GeoJSON had no tabindex). Source tracing confirmed these controls
are intentionally programmatic-focus targets; changing the probe to the three real instance/handler
markers made the complete sweep 2/2 no-retry green.

**Measurement and verification:** the exact HEAD static baseline was 16.5s; no trustworthy clean
wall-clock baseline was captured before editing, so none is invented here. The post-change test ran
in 17.2s / 17.1s. Focused Biome and `npm run typecheck:vscode-e2e` passed. This file is full-tier-only;
its affected default tier remains part of task 512's final full-suite gate.

## Session 6 (2026-08-27) — diagram sizing, SMILES repair, cache-hit flip, ECharts themes

Four full-tier-only files removed **10 calls / 28.5 static seconds**, leaving **351 calls / 638.55s**
under the continuing census.

| file | before | after pass 1 / pass 2 | converted | retained |
|---|---:|---:|---:|---:|
| `diagram-sizing.spec.ts` | 17.0s | 13.7s / 21.5s | 3 calls / 8.0s | 1 call / 1.5s |
| `smiles-render.spec.ts` | 22.3s | 28.6s / 20.9s | 1 call / 3.5s | 5 calls / 5.6s |
| `abc-flip-cache-hit.spec.ts` | 20.1s | 12.3s / 13.6s | 2 calls / 6.0s | 1 call / 3.0s |
| `echarts-theme.spec.ts` | 50.4s | 49.5s / 50.7s | 4 calls / 11.0s | none |

The unchanged baseline was **8/8 in 1.9m** (109.8s summed test durations). Post-change repeated
verification was **16/16 in 3.8m** (105.4s average summed durations). The deterministic saving is
28.5 static seconds; renderer/machine variance consumed most of it in this sample, so only the
static reduction is credited.

**Conversions and retained waits:**

- diagram sizing polls the final WYSIWYG mindmap/ABC bounds, Preview `max-width` contract, and narrow
  ABC/Graphviz widths. Its 1500ms pre-mode click stays in the task-451 lost-click family;
- direct-WYSIWYG SMILES repair polls the complete SVG box, non-flattened text, and vendored-script
  version. Mode-persistence has no host acknowledgement and remains, as do pre-mode and ≤1s waits;
- ABC cache reopen polls `data-vmarkd-cache-hit`; theme changes poll the VS Code body class plus
  re-rendered SVG/source stamp. The initial 3000ms cache PUT remains because the rAF-debounced
  client→host round trip has no acknowledgement marker before the editor closes;
- ECharts initial, Preview, live-flip, and material-dark cases poll their painted canvas pixels,
  retained mindmap option, and Vega mark fills — the exact truth consumed by the assertions.

**Verification:** focused Biome and `npm run typecheck:vscode-e2e` passed; all four files passed two
no-retry runs (16/16). They are default/full-tier-only and remain covered by the final full-suite
gate.

## Session 7 (2026-08-27) — renderer theme-transition family

Six full-tier theme specs removed **10 calls / 26.0 static seconds**, leaving **341 calls / 612.55s**.

| file | baseline | after pass 1 / pass 2 | converted | retained |
|---|---:|---:|---:|---:|
| `retheme-flip-matrix.spec.ts` | 56.1s | 49.9s / 48.3s | 1 call / 3.0s | 4 calls / 6.12s |
| `wavedrom-theme.spec.ts` | 25.5s | 15.8s / 16.8s | 3 calls / 7.5s | 1 call / 1.0s |
| `flowchart-theme.spec.ts` | 12.4s | 9.8s / 7.6s | 2 calls / 5.0s | none |
| `vega-theme.spec.ts` | 12.2s | 7.3s / 7.7s | 2 calls / 5.0s | none |
| `plantuml-theme-flip.spec.ts` | baseline red (stale literal) | 11.7s / 9.9s | 1 call / 1.5s | late-fire 3.0s window |
| `d2-theme.spec.ts` | 29.1s | 16.8s / 13.8s | 1 call / 4.0s | none |

The valid unchanged cases totalled 135.3s; their post-change average was 96.9s. The deterministic
static reduction is 26.0s. PlantUML is excluded from that before/after calculation because its
unchanged baseline failed both attempts before timing conversion.

**Conversions and retained waits:** WaveDrom, Flowchart, Vega, and D2 now poll the exact rendered
stroke/fill/background/SVG contracts; PlantUML initial readiness polls all blocks plus live foreground
pairing. The PlantUML trailing 3s window remains because it detects the delayed second redraw that
the test exists to reject. The 14-family matrix's initial wait was redundant with its existing
all-family poll and was removed; its per-flip 4s remains because the fleet has no single monotonic
completion marker and a first-true census can accept a transient plateau. Its 1500ms cache-population
wait also remains because client cache PUT has no host acknowledgement. The 120ms per-element and
500ms poll intervals remain below the conversion threshold.

**Red-to-green test fix:** the unchanged PlantUML baseline failed 2/2 because `LIGHT_FILL='#3b3b3b'`
was stale against current VS Code's `#202020`. The test now compares the baked SVG fill to the live
webview foreground before and after the flip, still requires the fill to change, and keeps the exact
single-redraw stats assertion. The focused RED was captured; the corrected single test passed without
retry, then passed both combined no-retry runs.

**Verification:** focused Biome and `npm run typecheck:vscode-e2e` passed; combined post-change run
was **16/16 no-retry passed in 3.8m**. These specs are default/full-tier-only and remain in the final
full-suite gate.

## Session 8 (2026-08-27) — render/cache infrastructure and negative-window audit

Five files converted and three were audited/retained, removing **6 calls / 23.0 static seconds** and
leaving **335 calls / 589.55s**.

| file | baseline | after pass 1 / pass 2 | disposition |
|---|---:|---:|---|
| `content-visibility-modes.spec.ts` | 14.7s | 6.0s / 5.8s | 2 calls / 8.0s converted |
| `custom-diagrams-render.spec.ts` | 13.3s | 8.7s / 7.7s | 1 call / 8.0s converted |
| `d2-content-theme-flip.spec.ts` | 23.4s | 22.6s / 20.3s | 1 call / 3.0s converted; 4.0s PUT retained |
| `d2-lazy-load.spec.ts` | 16.9s | 16.4s / 15.5s | 1 call / 2.0s converted; 4.0s negative retained |
| `plantuml-phase-timing.spec.ts` | 20.3s | 19.5s / 18.7s | 1 call / 2.0s converted; 3.0s PUT + 1.0s negative retained |
| `diagram-cache-reply-source.spec.ts` | 11.8s | 12.3s / 11.7s | 8.0s negative fallback window retained |
| `local-assets-only.spec.ts` | 14.4s | 14.7s / 14.6s | 8.0s negative network window retained |
| `flip-skip.spec.ts` | 20.2s | 20.9s / 20.1s | 3.0s viewport handoff + 4.0s negative redraw window retained |

The unchanged baseline summed to 135.0s; the post-change average was 117.8s. Static saving is 23.0s.

**Evidence:** content visibility polls the actual large-doc class/block containment in both modes;
the custom render gate polls every renderer target/processed count and painted fleet (and now installs
its console listener before open, so lazy-render errors cannot precede it); D2 and PlantUML reopen
paths poll cache-hit markers; positive D2 lazy loading polls SVG/engine/script/bridge state.

The retained waits all prove absence over time or cross an unacknowledged cache boundary:
cache-reply must wait past its 2s fallback to prove `timeout===0`; local-assets must observe the whole
late-render resource window; flip-skip must allow a buggy delayed node replacement; the no-D2 test
must allow a wrongly eager bundle to appear; D2/PlantUML first passes must let rAF-debounced cache PUT
reach the host before close. These reasons are now inline.

**Verification:** focused Biome and `npm run typecheck:vscode-e2e` passed; combined focused run was
**20/20 no-retry passed in 4.2m**; routine FAST was **59/59 first-attempt passed in 9.5m**.

## Session 9 (2026-08-27) — FAST edit, clipboard, undo, and scroll batch

Six files removed **14 inventoried calls / 30.0 static seconds**. This audit also found five
`settle(CASCADE_SETTLE_MS)` call sites in `undo-redo-steps.spec.ts` (2.2s each) that the literal-only
census missed because the delay is a named constant. Correcting that +11.0s undercount leaves
**326 remaining calls / 570.55s**, not the mechanically-subtracted 321 / 559.55s.

| file | baseline | after evidence | converted | retained |
|---|---:|---:|---:|---:|
| `undo-redo-steps.spec.ts` | 1.4m | 1.3m / 1.3m | 4 calls / 6.5s | 120ms/1s sequencing + 5×2.2s cascade |
| `clipboard-preview.spec.ts` | 27.0s | 15.3s / 15.3s | 2 calls / 5.5s | 2.0s pre-mode guard |
| `diagram-fast-edit-safety.spec.ts` | 18.2s | 11.0s / 9.9s | 3 calls / 6.5s | none |
| `undo-dirty-probe.spec.ts` | 13.3s | 9.0s / 9.0s | 2 calls / 4.5s | 1.5s undo-stack boot + 200ms sequencing |
| `cut-selection-sv.spec.ts` | 11.6s | 5.7s / 5.4s | 2 calls / 4.5s | 1.5s pre-mode guard |
| `scroll-preserve.spec.ts` | 12.0s | 8.5s / 8.4s | 1 call / 2.5s | 2.5s initial render quiescence + 200ms snapshot |

The unchanged baseline summed to ~166.1s; the post-change average was ~126.8s. Deterministic
inventoried saving is 30.0s; the five newly-censused cascade calls are retained cost, not a regression.

**Conversions:** host-document text/dirty state, system clipboard, SV rendered content, cut result,
and Preview scroll fraction are all polled directly. The long undo matrix keeps its named 2.2s
windows because it asserts that one engine call maps to exactly one version change only after both
Vditor's 800ms and host forwarding's 250ms delayed paths could expose a second mutation.

**Rejected conversions and root causes:**

- `undo-dirty` first used an unasserted exact text placement; narrowing to the real `isDirty`
  contract exposed that removing boot quiescence started editing before Vditor's initial undo
  snapshot. Restoring only that 1.5s guard returned the opening bytes and passed focused/FAST.
- `scroll-preserve` passed 3/3 solo without its initial wait but failed once under combined load:
  scrollable height crossed the floor before late diagram reflow, so the 50% snapshot was premature.
  Restoring only the initial 2.5s geometry guard made repeated focused runs and FAST green.

**Verification:** focused Biome and `npm run typecheck:vscode-e2e` passed; shorter specs were **14/14
no-retry**, the long undo matrix **2/2 no-retry**, and routine FAST **59/59 first-attempt in 9.1m**.
