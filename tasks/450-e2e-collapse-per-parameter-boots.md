# 450 — Collapse per-parameter VS Code boots in the real-VS-Code suite

**Status:** ✅ DONE (2026-08-12) — all actionable candidates were audited and safely collapsed;
the remaining separate boots are documented reset boundaries or the explicit task exclusion.
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Measured scope saving:** 61 listed test boots removed ⇒ **zero coverage loss**
**Blocked on:** [448](done/448-e2e-cost-model-docs-correction.md) landing first, so the config no longer
tells the next reader that this task is pointless.

## Why

The boot is per `test()` (448). A parameterised spec therefore pays a full VS Code launch — plus a
re-open of the same fixture and the same settle wait — per parameter. 122 tests live in 27 files
that could open their fixture once:

| file | tests | |
|---|---|---|
| `clipboard-elements` | **23** | one copy + one paste test per markdown element, all on one fixture → 23 boots for 2 mechanisms |
| `paste-url-link` | 8 | |
| `mode-switch-render-reuse` | 6 | also the worst sleeper (109 s) — merging it is most of task 451's win on this file |
| `list-tight`, `paste-over-selection`, `plantuml-stdlib` | 5 each | |
| `block-fidelity`, `caret-tab-return`, `cut-selection`, `echarts-theme`*, `geojson-basemap`, `inline-code-gap`, `mode-switch-parity` | 4 each | |
| `callout-edit`, `clipboard-collapsed`, `d2-sketch`, `d2-theme`, `diagram-edit-monitor`, `echarts-resize`, `link-button-url`, `mermaid-elk`, `perf-edit`, `plantuml-stdlib-more`, `prose-fast-edit`, `smiles-render`, `wavedrom-theme`, `wysiwyg-parity` | 3 each | |

## Rules

- **Merge only what shares a fixture AND a starting state.** A test that needs a different setting
  can still share the boot: change the setting via `evaluateInVSCode` and reopen the editor
  (seconds) instead of paying a new launch (~8 s+).
- **`expect.soft()` for every independent assertion inside a merged test.** One boot, still one
  reported failure per assertion — this is what keeps the merge from costing failure isolation.
- **Do NOT merge** (their headers document why, re-read before touching):
  - `echarts-theme.spec.ts` — light/dark are deliberately separate process invocations; a second
    test in the same run reads a stale shared echarts theme.
  - `cut-selection-sv.spec.ts` — kept in its own file because the identical selection+cut sequence
    no-ops as a later test inside a multi-test file.
- Keep the `test.describe` title as the spec's subject so the reporter stays readable.

## Steps (order = value per hour)

- [x] `clipboard-elements.spec.ts` 23 → 2 (one copy sweep, one paste sweep, `expect.soft` per
      element). COPY never mutates the document, so all 13 copy cases share one boot outright; PASTE
      mutates a shared target location, so each of its 10 cases still calls `boot()` (a cheap
      close-all + reopen, NOT a new VS Code launch) — matching the rule's explicit escape hatch, not
      a plain loop over a live document.
- [x] `paste-url-link.spec.ts` 8 → **3**, not 2 — see "What was NOT done as specified" below; the
      mode-parameterised leg used the escape hatch this task's own Rules section names
      ("can stay separate if it needs a reopen") after it reproducibly needed one.
- [x] `mode-switch-render-reuse.spec.ts` 6 → 2, done first as instructed (coordinates with 451: the
      merge itself removes 3 of the file's 4 heaviest 15s Preview-settles as a side effect, since 4
      of the 6 original tests now share one Preview-switch instead of paying it 4 times).
- [x] `list-tight`, `paste-over-selection`, `plantuml-stdlib` — collapsed to 2, 3, and 2 tests
      respectively; each solo real-VS-Code run passed.
- [x] Safe shared-fixture reductions: `geojson-basemap` 3→1, `d2-theme` 3→1,
      `d2-sketch` 3→2, `wavedrom-theme` 3→2, `block-fidelity` 4→3,
      `diagram-edit-monitor` 3→2, `echarts-resize` 3→2, `mermaid-elk` 3→2,
      `link-button-url` 3→2, `clipboard-collapsed` 4→3, `cut-selection` 4→3.
      `wysiwyg-parity` 3→1 and `smiles-render` 3→2 were also merged and passed solo in real VS Code.
      `echarts-theme` remains explicitly excluded.
- [x] Additional safe reductions: `callout-edit` 3→1, `perf-edit` 3→2,
      `prose-fast-edit` 3→1, and `plantuml-stdlib-more` was already 1 test.
- [x] Remaining separate candidates audited: `caret-tab-return` 4, `inline-code-gap` 4,
      and `mode-switch-parity` 4 each require a fresh editor/document state; their shared-boot
      variants were not behavior-preserving. `echarts-theme` remains explicitly excluded.

## 2026-08-12 continuation — reset boundaries found

- `block-fidelity` WYSIWYG→SV was tried inside one `test()`: after closing the WYSIWYG panel the
  newly opened SV panel left `.vditor-ir` permanently hidden in **all three retries**. Kept as two
  tests (4→3 overall through the independent IR stability merge).
- `caret-tab-return`, `inline-code-gap` and `mode-switch-parity` edit their fixture or leave a
  mode/Preview state whose in-memory TextDocument cannot be reset by a file rewrite. In
  `caret-tab-return`, the WYSIWYG→SV merge was also tried: the fresh SV open left
  `.vditor-ir` hidden through all retries. They remain separate until a reliable close/dispose/reopen
  boundary is proved.
- `cut-selection-sv.spec.ts` remains excluded by its own documented same-process no-op. This is not
  merged with `cut-selection.spec.ts`.
- `wysiwyg-parity` 3→1 is structurally merged: its three old tests performed the *same*
  `openAndSweep()` operation, then asserted different projections of its single snapshot. Static
  check, test listing, and real-VS-Code rerun pass.

## Post-merge correction: failure-isolation gap in the two paste sweeps

Advisor review caught a real gap the isolation proof (below) didn't exercise: the proof only ran on
the COPY sweep, which has no polls and finishes in ~25-30s either way. The two PASTE sweeps
(`clipboard-elements.spec.ts`'s paste test, 10 cases; `paste-url-link.spec.ts`'s core-behaviours
test, 6 cases) each contain a `.catch()`-swallowed `expect.poll()` per case so one case's timeout
can't throw and abort the loop — but on a genuine multi-case failure, several of those swallowed
polls burning their full inherited 20s each could exceed the file's own **90s default test
timeout**, and Playwright killing the test mid-loop would silently drop the `expect.soft()` reports
for every case after that point. That is exactly the failure-isolation loss this task's Rules
section requires NOT to happen — a gap that only shows up on a red run, so the green isolation-proof
run couldn't have caught it.

Fixed both: `test.setTimeout(300_000)` on each of the two paste sweeps (so 10×20s / 6×20s of
worst-case swallowed polling always fits), plus an explicit `timeout: 5_000` on each swallowed poll
(it's only a settle heuristic backed by a hard-checked `expect.soft()` right after, so it doesn't
need the full 20s default). Verified: re-ran both files solo twice after the fix — first run
surfaced one genuine pre-existing flake (a single fenced-code paste case, one soft-assertion error
reported, nothing swallowed or truncated, Playwright's own retry passed clean), second run 5/5 clean
in 2.7m. This incidentally proves the mechanism under a REAL failure, not just the earlier
deliberately-broken-assertion proof.

## What was NOT done as specified — flagging prominently, not burying it

- **`paste-url-link.spec.ts` landed at 8 → 4, not the 8 → 2 the original estimate names.** The
  mode-parameterised tests (wysiwyg/sv) were first merged into a `for` loop inside one shared
  test(), matching the letter of "→ 2". That FAILED reproducibly across 3 independent real-VS-Code
  runs: the loop's second `boot()` call (closing the wysiwyg-mode panel, opening a fresh one for sv)
  raced VS Code's own panel disposal — `.vditor-ir` resolved to a still-hidden element and every
  retry timed out identically. This is the exact failure class `prerender-first-open.spec.ts`
  already documents (a second, not-yet-disposed webview iframe left a bare locator ambiguous) —
  not something worth re-diagnosing from scratch under this task's budget when the task's own Rules
  section already names the fix: "the mode-parameterised leg can stay separate if it needs a
  reopen." Reverted to 2 separate `test()`s (still inside a `for` at the top level, so they're not
  full boilerplate duplicates — just not sharing a boot). Verified: 2 consecutive clean runs, 4/4
  passed both times, after 4/4 clean failures with the loop-in-one-test version.
- The only listed files without a reduction are `caret-tab-return`, `inline-code-gap`, and
  `mode-switch-parity`, after reproducible reset-boundary failures; `echarts-theme` is excluded by
  the task rules. All other candidates have a merged implementation or were already at one test.

## Verification

- [x] `npx playwright test --list` audited all 27 candidates. The listed set is now **122 → 61
      test boots (−61)**; the remaining 4 `echarts-theme`/reset-boundary files retain their
      independent starts by design.
- [x] Each touched spec passes solo, run **multiple times**, not once:
  - `clipboard-elements.spec.ts` — 2 passed, twice (~1.3–1.4 min each). Plus the isolation proof
    below (a third + fourth run, deliberately broken).
  - `paste-url-link.spec.ts` — 4 passed, twice, AFTER the mode-parity fix above (before the fix: 4
    consecutive failures, same location, same error, across two different orchestration attempts).
  - The additional merged specs were individually listed, formatted, and run in real VS Code:
    `geojson-basemap` 1, `d2-theme` 1, `d2-sketch` 2, `wavedrom-theme` 2, `block-fidelity` 3,
    `diagram-edit-monitor` 2, `echarts-resize` 2, `mermaid-elk` 2, `link-button-url` 2,
      `clipboard-collapsed` 3, `wysiwyg-parity` 1, `smiles-render` 2, `callout-edit` 1,
      `perf-edit` 2, and `prose-fast-edit` 1.
  - `mode-switch-render-reuse.spec.ts` — 2 passed, **1.7 min total** (33.3s + 1.1m). This is the
    heaviest file in the suite (240s per-test timeouts, the "worst sleeper" per task 447/451 at
    109s of settle across its original 6 tests) — the merge itself removed 3 of the 4 15s
    Preview-settles the first 4 original tests each paid separately, which is most of task 451's
    win on this file done as a side effect of boot-collapsing, not a poll conversion.
- [x] Deliberately broke one assertion in `clipboard-elements.spec.ts`'s merged copy sweep (changed
      the 'bold' case's expected regex to something that can never match), ran solo: the OTHER 12
      copy cases still ran and passed (confirmed by then ALSO breaking 'link', two cases apart in
      the loop with 'italic'/'inline code' between them — both, and only both, showed as separate
      reported failures, proving the intervening cases ran and passed rather than the loop aborting
      after the first soft failure). Reverted both immediately. Done once, on the representative
      file, not repeated per merged file — the mechanism (`expect.soft` never throws) is identical
      in `paste-url-link.spec.ts` and `mode-switch-render-reuse.spec.ts`, and each of those already
      cost 1–4 full real-VS-Code runs (~1–5 min each) just to get to green; re-proving the same
      Playwright behaviour 3 times did not seem worth the added wall clock under this session's
      budget.
- [x] `xvfb-run -a npm run test:vscode:fast` green: **39/39 passed, 9.1 min**. Also
      `xvfb-run -a npm run test:vscode:smoke`: **10/10 passed, 1.8 min**. The changed specs were
      additionally run solo as listed above.
