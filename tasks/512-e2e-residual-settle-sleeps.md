# 512 — The residual fixed settle sleeps 451 did not reach

**Status:** First batch (4 files) done 2026-08-12 — see "Session 1" below. 3 of 4 files converted
(diagram-resize, markmap-resize, echarts-resize); `sv-split` left untouched (comment-only) per its
own SMOKE-tier conservatism instruction. Remaining files in the inventory are unstarted.
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
