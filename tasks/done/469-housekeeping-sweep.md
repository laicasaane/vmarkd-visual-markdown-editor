# Task 469 — Housekeeping sweep + a standing quality-metrics toolchain

Export surface, a dead test helper, stale docs, coverage baseline — and the tooling that stops all
four classes from silently coming back.

**Status:** ✅ DONE 2026-07-31 — items 1–4 complete, item 5 complete for 5a–5d, item 6 complete.
Item 4 (the bulk) landed last, once task 460 had cleared the sequencing constraint below.

> **Two boxes below stay unticked ON PURPOSE — they are non-goals, not leftovers.** Stated here so
> the file doesn't read as half-finished:
> - **5e `type-coverage`** — explicitly scoped out. `media-src/tsconfig.json` has `strict: false`,
>   and flipping it needs its own plan; see 5e.
> - **Item 6's "wire into CI"** — correct per that item's own condition: each tool gets wired only
>   once it runs clean. `knip` (46 findings → task 471) and `depcruise` (the `caret ↔ gap-paragraph`
>   cycle → task 472) are not clean yet, and wiring a red tool into CI just teaches people to ignore
>   it. ADR-0005's "Philosophy" records this as an accepted exception.
>
> Closing gate — `npm run quality`: **PASS** lint:ci, jscpd, test:coverage, check:coverage-modules;
> **FAIL** knip + depcruise, both the filed baselines above and neither introduced here. The
> coverage ratchet passing is the load-bearing one: unexporting 85 symbols and deleting 2 types
> moves coverage denominators, so that stage could have newly-failed and didn't.

· **Impact:** 🟢 no behaviour change; shrinks public surface, removes misleading
documents, and adds a repeatable quality gate · **Origin:** conventional-debt survey 2026-07-30/31.
**Related:** [task 460](460-module-decomposition-physical-move.md) (sequencing constraint — read §
"Order" below), ADR-0005, `scripts/check-coverage-modules.mjs`.

## Measured baseline — record it, don't re-derive it

Six conventional-debt axes were measured on 2026-07-30. **Five came back clean.** Recording them so
nobody spends an afternoon re-measuring:

| axis | result |
|---|---|
| `TODO` / `FIXME` / `HACK` / `XXX` in `src/` + `media-src/src/` | **0** |
| skipped tests (`test.skip` / `describe.skip` / `it.skip` / `test.fixme`) | **2**, both in `test/vscode-e2e/plantuml-stdlib-more.spec.ts` |
| dead functions (exported, referenced nowhere at all) | **0** |
| `*.vsix` in repo root (88 MB), `tmp/` (258 files) | gitignored + untracked — local clutter, not repo debt |
| in-code debt markers | none |

**Method note that changed the result:** the first scan reported "20 dead values". It excluded the
*defining* file from the reference count, so it conflated *"referenced nowhere"* with *"referenced
only inside its own file"*. After correcting, **zero are dead** — all 20 are used internally. Any
future dead-code scan must count self-file references, or it will report the same false positives.
Throwaway scanner: `tmp/deadexports.mjs` (gitignored; re-create rather than trust it exists).

## The actual work

### 1. Delete the dead test helper (one line)

- [x] `media-src/src/caret.ts` → `resetCaretPaintabilityProbeForTests`. **NOT deleted — verified
      live, not dead.** Re-grepped the whole tree (incl. `test/`, `media-src/e2e/`,
      `test/vscode-e2e/`) 2026-07-31: it's called at `caret.ts:351` inside
      `resetCaretAuthorityForTests()`, which IS exported and IS called from two test files —
      `caret.test.ts:45`/`:56` (the latter's own comment: "also resets the paintability probe, see
      caret.ts") and `initial-caret.test.ts:38`. So it's referenced by another function in its own
      file, not "only by its own definition" as the task description claimed — that's a real call
      site, and deleting it would break both test files' reset helper. Skipped per the team-lead's
      instruction to say so and leave it if it turns out to be referenced.

### 2. Retire two superseded documents

- [x] `docs/editor-session-refactor-plan.md` — a plan for work that **shipped**. `EditorSession`
      exists (`src/editor-session.ts`, 679 lines), `markdown-editor-provider.ts` is down to 241
      lines, and ADR-0005 documents the result. The file reads as pending work. Delete, or move under
      a clearly-archival path. **Deleted** (2026-07-31) — every step in it is checked off, and its
      "Out of scope (future)" note (move `EditorSession` to its own file) shipped anyway.
- [x] `docs/code-review-solid-kiss-2026-06-02.md` — at least two of its findings are resolved
      (`main.ts` 930 → 191 lines; `custom-diagrams.ts` 1182 → 219). Same call. **Before deleting,
      check whether any finding is still open** and rehome it as a task rather than losing it —
      the same discipline task 455 used for task 190's residue. **Checked every finding, deleted**
      (2026-07-31). Result: both god-file splits (`extension.ts`, `main.ts`) and all six "quick win"
      bugs/dedups are resolved and verified in the current tree (see
      [task 470](470-solid-kiss-review-residue.md) "Resolved, checked at retirement" for the
      per-finding evidence). Four "lower-priority notes" items were still genuinely open
      (`fix-table-ir.ts` template literal, `toolbar.ts` inline SVGs, `custom-renderer.ts`
      `lastIndex` resets, and `vscode-api.ts`'s import-time `acquireVsCodeApi()` side effect —
      the `utils.ts` rename fixed "hidden in a grab-bag module" but not "belongs in an explicit
      bootstrap"; `raw-href.ts:11-14` still documents working around it) — rehomed to
      **[task 470](470-solid-kiss-review-residue.md)** rather than lost with the doc. One other
      lower-priority note turned out resolved (wiki-link caching via `WikiCache`) and is recorded
      there as resolved, not reopened as a task.

### 3. Prune the coverage baseline

- [x] `scripts/check-coverage-modules.mjs` → `BASELINE_ZERO`, 24 entries. The script's own header
      says *"PRUNE an entry the moment it gains unit coverage; NEVER add one to silence a failure"*,
      and it **already prints the prune list** as an advisory on every `npm run test:coverage`
      (`"Coverage ratchet: N baseline module(s) now have coverage — prune from BASELINE_ZERO"`).
- [x] Ran `npm run test:coverage` (2026-07-31) and investigated the output. **Tree was not clean** —
      several agents have uncommitted work (see `git status` at task start).
- [x] **The prune — DONE by the team lead 2026-07-31, once task 454 landed.** The deferral below was
      the right call at the time; it was resolved rather than left. `media-src/src/echarts-retheme.ts`
      pruned after 454's real-VS-Code L3 went green (`retheme-preview-surface.spec.ts`, all five
      renderers redrawn), so the coverage it gained is no longer in-flight work that could be dropped.
      **`BASELINE_ZERO` is now 23**, and `npm run check:coverage-modules` reports
      `Coverage ratchet OK — 23 source module(s) at 0% (baseline 23)`.
- [ ] ~~**The actual prune — deferred, tree not clean.**~~ (superseded by the entry above; kept for
      the reasoning.) Manually replicating the script's prune
      computation (the ratchet exits before printing the advisory when there's a failure below, so
      the advisory itself never printed) found exactly one candidate:
      `media-src/src/echarts-retheme.ts` (0% → 47.16%). **Did not prune it** — `git status` shows
      `media-src/src/echarts-retheme.ts` modified and `echarts-retheme.test.ts` untracked (new),
      i.e. uncommitted, in-flight work (matches the active `t454-echarts` agent). Pruning it now
      would be exactly the moving-target mistake this item was warned against — if that WIP is
      reworked or dropped, the entry would silently go stale. Re-run once that work is committed (or
      the tree is otherwise clean).
- [x] **New finding, not previously tracked: the coverage ratchet FAILED outright** — **FIXED by the
      team lead 2026-07-31 with the option this entry correctly identified as the right one: a unit
      test, not a baseline entry.** `media-src/src/open-preview.test.ts` covers all four branches of
      `openInPreview` — clicks when the overlay is down, does NOT click when the button already
      carries `vditor-menu--current` (Preview is a TOGGLE, so clicking then turns it OFF, the exact
      opposite of what `defaultMode: "preview"` asks for — that guard is the load-bearing one), and
      no-ops with no Vditor instance and with a custom toolbar that has no Preview button. Ratchet
      green. Flagging this rather than silently adding it to `BASELINE_ZERO` was the correct call.

      Original finding, for the record — unrelated to pruning:
      `media-src/src/open-preview.ts` was at 0% unit coverage and isn't in
      `BASELINE_ZERO`. This is **not** a moving-target artifact: the file is fully committed (task
      282, commit `42a9e70`), `git status` shows it clean, and the module that calls it
      (`vditor-init.ts`) is also untouched in the working tree. It's a real, pre-existing gap:
      `openInPreview()` drives a real Vditor toolbar click and is only exercised by a real-VS-Code
      e2e (`test/vscode-e2e/preview-spacing.spec.ts`), whose coverage doesn't merge into this
      report — exactly the class of module `BASELINE_ZERO`'s own doc comment describes. **Did not
      add it to BASELINE_ZERO** — that's explicitly the forbidden move ("never add one to silence a
      failure"); it needs either a unit test or a deliberate, documented baseline decision, neither
      of which is a "prune" and both out of scope here. Needs an owner — flagging it here rather
      than fixing or silently ignoring it. `npm run test:coverage` will stay red for anyone who runs
      it on this branch until this is addressed.
- [x] Resulting count: **23** (was 24; `echarts-retheme.ts` pruned 2026-07-31 once task 454 landed).
      for both open items and why neither was resolved inside this item's scope.

### 4. Shrink the export surface (the bulk — see ordering constraint)

- [x] **DONE 2026-07-31 — 85 declarations unexported across 57 files.** The list below predated task
      460's ~250-file relocation, so it was **re-derived on the post-460 tree** rather than trusted
      (`tmp/find-local-only-exports.mjs`, throwaway) — and independently landed on **exactly 85**,
      which is a decent corroboration of the original audit.

      Method, and why it is not knip's metric: a symbol qualifies only if its name has **zero textual
      occurrences in any other file** across `src/`, `media-src/src/`, `media-src/e2e/`, `test/` and
      `scripts/`. Deliberately conservative in the safe direction — a match in a *comment* or an
      unrelated same-named local in another file is enough to disqualify it. This is what keeps the
      ~125 test-imported exports out of scope: a test import is an external use, so they never
      became candidates. knip's "unused exports" is the *wrong* list for this item precisely because
      it would have swept them in.

      **Two symbols turned out to be dead outright**, not merely over-exported — `DiagramRuntimePhase`
      (`diagrams/diagram-runtime.ts`) and `MermaidTheme` (`diagrams/mermaid/mermaid-theme.ts`) had no
      references anywhere at all, inside their own file included; the `export` keyword was the only
      thing keeping Biome quiet about them. Deleted rather than left as unexported dead types.

      **Effect on knip's baseline: 81 → 46 findings** (unused exports 62→40, types 18→5, enum member
      1→1, dead devDeps unchanged at 6). The residue is task 471's, per this item's own scope note.

      Gates after the pass: `lint:ci` clean (655 files), webview `typecheck` clean, host
      `tsc --noEmit` clean, `npm test` **2481/2481**, `node build.mjs` green.

- [x] ~~**85 symbols are exported but used only inside their own file**~~: 20 values
      (`autoCodeStyle`, `bootD2`, `fitAbc`, `flashHeading`, `shapeBox`, `sqlTableSize`, `classSize`,
      `labelCandidates`, `CALLOUT_TYPES`, `BLOCK_WRAPPER_SEL`, `currentThemeKind`,
      `ECHARTS_CUSTOM_NAMES`, `fenceSvIndentedCode`, `matchesFieldType`, `isTableBlock`,
      `extractWikiTarget`, `normalizeWikiSegment`, `assertDiagramRuntimeAdapters`,
      `resolveShortcut`, plus item 1's helper) and 65 types/interfaces (`AssetLinkDeps`,
      `CommandDeps`, `HtmlBuildConfig`, `DocSyncDeps`, …). Drop the `export` keyword.
- [x] **Doc drift fixed in the same pass (2026-07-31).** ADR-0005 listed `autoCodeStyle` as part of
      `theme-registry.ts`'s public API. It is internal-only, so the **ADR was corrected** (not the
      export kept) — `docs/adr/0005-architecture-overview.md:57` now names `resolveContentTheme` and
      `pairedPalette` and records that `autoCodeStyle` was unexported here, so the next reader sees
      why the list shrank instead of suspecting the ADR of being stale again.

**Deliberately NOT in scope:** the ~125 symbols exported *only because a unit test imports them*.
Sampled (`slugify`, `extractCustomId`, `fenceFor`, `matchGlob`, `paletteToEchartsTheme`) they are
pure functions with direct unit tests — that is AGENTS.md's coverage mandate working as intended, not
debt. Do not "clean" them.

## ⚠️ Order — item 4 must come AFTER task 460

Task 460 (physical module decomposition) rewrites every import in ~250 files. Changing the export
surface while that is in flight guarantees conflicts in exactly the files the codemod touches. Items
1-3 are independent and can land any time; **item 4 waits for 460**, or 460 waits for it — but they
must not overlap.

### 5. Stand up a quality-metrics toolchain (user decision, 2026-07-31)

Biome covers lint + format but **not**: cross-file unused exports, duplication, dependency
structure, or type-strictness. Four additions, all local, all devDependencies. Run them as one
command — see item 6.

#### 5a. Cognitive complexity — **done, threshold 15, severity `error`**

Biome 2.4.16 ships `complexity/noExcessiveCognitiveComplexity`, which implements **SonarSource's
Cognitive Complexity algorithm** (the SonarQube metric). It is not in `recommended`, so it is off.

- [x] Enabled in `biome.json` with **`maxAllowedComplexity: 15`, severity `error`**.

⚠️ **Recommendation overridden by the user, 2026-07-31 — record it, don't "fix" it back.** This
section recommended **(a)** warn-plus-ratchet. The team lead relayed the user's explicit decision
to go with **(b) instead**: enable at `error` immediately and suppress every existing site with an
inline `biome-ignore` carrying a real, function-specific reason — accepting the one-time cost of 97
annotations so *new* code is blocked from day one, rather than landing a rule nobody has to obey
yet. Implemented by the `t469-housekeeping` agent in this same session. If you are the next reader
and are tempted to switch this to warn-plus-ratchet because "that many suppressions is a lot of
noise" — that tradeoff was already weighed and explicitly rejected; raise it with the user again
rather than reverting silently.

⚠️ **Reporter trap, confirmed AND extended:** Biome's default text reporter caps output at **20
diagnostics** — use `--reporter=json --max-diagnostics=1000` for counts (`--only` scopes to one
rule). But the trap runs deeper than the missing flag: **the 81-function estimate above, and this
agent's own first re-measurement (83), were both scoped to `src media-src/src` only.**
`biome.json`'s `files.includes` — and therefore `npm run lint:ci`'s actual gate — additionally
covers `media-src/e2e/**`, `test/**`, and `*.mjs`. Scanning the WHOLE covered tree (`biome lint
--only=complexity/noExcessiveCognitiveComplexity --reporter=json --max-diagnostics=1000 .`) found
**107 real offenders**, not 81/83 — 23 more in `test/vscode-e2e/**` (mostly in-page `evaluate()`
probes and pixel/histogram measurement helpers), 1 in `media-src/e2e/theme-flash.spec.ts`, and 1 in
`build.mjs`. Anyone re-deriving this count from scratch: scan the tree the same way `lint:ci` does,
not just `src`/`media-src/src` — a narrower scope will silently miss a quarter of the real total.

```bash
./node_modules/.bin/biome lint --only=complexity/noExcessiveCognitiveComplexity \
  --reporter=json --max-diagnostics=1000 .
```

- [x] **Result: all 107 sites now suppressed. `npm run lint:ci` reports 0
      `complexity/noExcessiveCognitiveComplexity` findings tree-wide (confirmed
      `--reporter=json --max-diagnostics=1000 .` → 0 diagnostics).** Each suppression is a
      `biome-ignore lint/complexity/…` comment naming what the function actually does (not a
      copy-pasted placeholder). Verified every touched file converges to **zero** further fixes
      under `biome check --write`.
- [x] **First pass (97 sites) landed 2026-07-31; the remaining 10 were deferred for live tree
      contention, then finished 2026-08-01 once the owning agents reported done and went idle:**
      `build.mjs` (1), `media-src/src/echarts-retheme.ts` (1), `media-src/src/link-click-fix.ts`
      (2), `media-src/src/message-router.ts` (1), `media-src/src/render-cache-client.ts` (3),
      `media-src/src/vditor-init.ts` (2). Before touching them the second time: re-checked
      `git status` (still modified — expected, these agents' work is uncommitted, not that they're
      still active), re-ran the complexity scan fresh on all 7 files touched by task 466's
      `echarts-retheme.ts`→`diagram-surfaces.ts` consolidation (`diagram-surfaces.ts` itself came
      back clean — the consolidation didn't move any offending function there), and confirmed the
      10 offender locations/line numbers were unchanged from the first measurement before
      suppressing. **`npm run lint:ci` reached GREEN (exit 0) at 2026-08-01, confirmed by two
      separate re-runs** — but the tree kept moving after that point, and this item's own
      `complexity/noExcessiveCognitiveComplexity` scope is what's actually stable, not `lint:ci` as
      a whole: (1) right after finishing the 10, one unrelated format failure briefly appeared in
      another agent's `test/vscode-e2e/task468-repro-probe.spec.ts` (untracked, out of scope), fixed
      independently by that file's owner minutes later; (2) **immediately after that GREEN
      confirmation**, `media-src/src/echarts-retheme.ts` (already suppressed in this item, still
      correctly suppressed) was edited again live — despite earlier report that its owning agent had
      gone idle — adding debug instrumentation, alongside `src/asset-link-actions.ts`,
      `test/backend/asset-link-actions.test.ts`, and a new untracked
      `test/vscode-e2e/zzdebug-echarts-flip.spec.ts`. That live edit reintroduced `lint:ci` failures
      unrelated to complexity (an unused import, two formatting diffs) **and one genuinely new**
      `complexity/noExcessiveCognitiveComplexity` **offender: `src/asset-link-actions.ts:105`
      (`onOpenLink`, CC 16)** — not one of the original 107, not suppressed here, because the file is
      visibly mid-edit by another agent right now (same contention rule this item applied
      throughout). **Net effect: this item's own scope (the 107 originally-measured sites) is at 0
      and verified; `npm run lint:ci` itself may be red again by the time anyone reads this**,
      because of unrelated concurrent work this item doesn't own. Re-run
      `--only=complexity/noExcessiveCognitiveComplexity --reporter=json --max-diagnostics=1000 .`
      to see the current true count before assuming either "0" or "107" is still accurate.
- [x] This independently confirms task 460's non-goal note that `d2-refine.ts` / `d2-render.ts` are
      the real readability problem — now with a number instead of an intuition (`d2-refine.ts` had
      **23** offending functions in one file, `d2-render.ts` **6**, the CC-255 function at
      `d2-render.ts:1328` remains the tree's single worst offender, now suppressed with a note
      flagging it as such rather than silently normalized).

⚠️ **A third trap, found while re-deriving these counts, worth its own line:** `grep`/`file` see
`media-src/src/d2-render.ts` — the file containing that CC-255 worst-offender function — as a
**binary file** (some byte in it trips the heuristic; pre-existing, unrelated to this task, not
investigated further). A plain `grep -c "pattern" media-src/src/d2-render.ts` silently reports
nothing (or "binary file matches" with `-n`) instead of erroring loudly — it will zero out anyone's
manual count on the single worst-offending file in the repo without warning. Use `grep -a` (or a
tool that doesn't binary-sniff, e.g. `file`'s own `-a`/`--mime` won't help but `ripgrep -a` will) when
counting anything in this file by hand.

#### 5b. `knip` — unused exports / files / dependencies — **done**

- [x] Added `knip@6.29.0` as a root devDependency (broader + actively maintained vs `ts-prune`).
- [x] **Configured for this repo's layout** in `knip.jsonc` (JSONC so the config can carry real
      explanatory comments, not a schema-rejected `$comment` field) — two explicit `workspaces`
      (`.` for `src/`, `media-src` for `media-src/src`), the 4 esbuild entry points +
      `media-src/e2e/*-harness.ts` declared as entries, `test/vscode-e2e` (a third, separate npm
      project) excluded via `ignoreWorkspaces` (it was otherwise auto-discovered and scanned with
      default settings — its own Playwright plugin flagged a spurious `vscode` unlisted-dependency
      finding unrelated to either real workspace), and per-workspace `ignoreDependencies` for the
      handful of genuine false positives (`vditor` — read as text by `test/backend`'s patch-anchor
      checks, not imported; `@types/vscode` — types-only, the bare `vscode` module is never an
      installable package; `@playwright/cli` — provides only a CLI binary, never imported;
      `media-src` — a path-segment false positive from an npm script value).
      **NOT investigated: the `window.__vmarkd*` seam-hook false positives** this item anticipated
      (task 465's 20 symbols) — in practice they didn't show up in `knip`'s output at all (it flags
      unused *exports*, not unused *window-property writes*, so the anticipated collision mostly
      doesn't materialize). No allowlisting was needed for that specific class.
- [x] **First-run result, current tree:** 0 unused files, **6 unused devDependencies**
      (`markmap-lib`, `markmap-view`, `three`, `vega`, `vega-embed`, `vega-lite`, all in
      `media-src/package.json`) — **this looks like real dead-dependency debt, not a knip false
      positive**: unlike lute/mermaid/echarts (each has a `media-src/scripts/fetch-*.mjs` that
      vendors + sha-pins the asset), nothing in the repo references these package names — the
      `media-src/vendor/{markmap,threejs,vega}/` bundles appear to have been vendored by hand and
      the devDependency left behind. **Filed as [task 471](471-dead-vendored-devdependencies.md)**,
      not removed here (out of this item's scope) — that task spells out why this needs care before
      deleting (several are diagram engines the project genuinely ships through the vendored bundle,
      not the npm package; knip can't see a manual vendoring step). 0 unlisted dependencies, 0
      unlisted binaries. **60 unused exported
      values + 18 unused exported types + 1 unused exported enum member = 79** — this is knip's
      version of item 4's "85 symbols exported but used only in their own file" count; it isn't the
      identical metric (knip flags exports unused *anywhere*, item 4 wants exports used *only
      in-file* — overlapping but not equal), so treat 79 as corroboration, not a replacement number.
      **Baseline moved to 81 after task 460** (62 values + 18 types + 1 enum member; dead deps still
      6). Two causes, neither a code regression: 460 physically moved ~250 files, and it fixed **7
      stale flat-tree paths in `knip.jsonc`** (`src/extension.ts`, `src/main.ts`, `src/elk-entry.ts`,
      `src/d2-entry.ts`, `src/mermaid-elk-entry.ts`, `src/stubs/vditor-toolbar-stubs.ts`,
      `src/types.ts`) that had silently matched nothing since the move — so knip had been reporting
      green over a **smaller graph than it appeared to check**. The +2 is therefore at least partly
      surface that was always dead and merely invisible. Exact per-symbol attribution is deferred to
      **task 471**, which owns this backlog; whoever picks it up should diff against 81, not 79.
      Note also the new `knip.jsonc` configuration hint "`src/app/extension.ts` — remove redundant
      entry pattern": now that `package.json` `main` is correct again, knip derives that entry by
      itself. Left in place deliberately — an explicit entry is a second, independent statement of
      the extension's entry point, and the redundancy is the cheap half of that pair.
- [x] Added `npm run knip` script. Exit code is currently 1 (the 6 dead deps + 79 export-surface
      findings above are real, un-actioned findings) — expected; not wired into CI (see item 6).
- [x] **Cross-check for whoever does item 4** (not run here — out of scope, item 4 is blocked
      behind task 460): knip's config has an `ignoreExportsUsedInFile` switch. Tried it as an
      experiment (not left enabled): with it `true`, knip stops counting a same-file reference as
      "used," so it reports only exports unused *even within their own file* — that count dropped
      from 60→31 values and 18→3 types. The **difference** (29 values, 15 types = 44) is exports
      that DO have an in-file reference, i.e. knip's approximation of item 4's "used only in own
      file" set. It does **not** match item 4's hand-counted 85 (20 values + 65 types) — smaller and
      differently split, likely because the manual audit and knip's file-scoping don't draw the
      "own file" boundary identically. Treat this as a cross-check to sanity-test the hand-counted
      list against, not a drop-in replacement for it.

#### 5c. `jscpd` — duplication — **done**

- [x] Added `jscpd@5.0.14` as a root devDependency.
- [x] Configured in `.jscpd.json`: scans `src`, `media-src/src`, `media-src/e2e`, `test`
      (TypeScript only); excludes `media-src/node_modules` (vendored), `media/`, `out/`, `tmp/`,
      `.worktrees/`, `**/node_modules/**`.
- [x] **Baseline, measured 2026-07-31/08-01:** 625 files analyzed, 109,508 lines, 581,377 tokens,
      **743 clones**, **9.59% duplicated lines (10,500)**, **11.40% duplicated tokens (66,305)**.
      Not investigated further (out of this item's scope — it's a baseline for future tracking, not
      a dedup pass). **Filed as [task 473](473-duplication-baseline.md)** so the number is tracked
      and ratchetable rather than just sitting in this file — that task also explicitly says NOT to
      go mass-deduplicate off it (some of the 743 clones are near-identical test boilerplate or
      intentionally parallel per-engine renderer code, not real duplication; needs triage first).
- [x] Added `npm run jscpd` script (`jscpd --config .jscpd.json`).

#### 5d. `dependency-cruiser` — module structure — **done**

- [x] Added `dependency-cruiser@18.1.0` as a root devDependency.
- [x] Configured in `.dependency-cruiser.cjs`: two rules only — `no-circular` and
      `not-to-unresolvable` (copied inline from `dependency-cruiser/configs/recommended`, since that
      preset's subpath isn't exposed through the installed version's package `exports` map and a
      bare `extends` throws). Deliberately **not** the full `recommended` preset — `no-orphans`
      would just double-report what knip (5b) already owns ("is this file used"). `vendor/` is
      excluded via `doNotFollow` (checked-in third-party bundles whose internal `require`/`import`
      graph plain Node-style resolution can't always follow, e.g. a vendored `.mjs` chunk requiring
      a bare `elkjs/...` specifier that only resolves inside esbuild's bundler — these showed up as
      false-positive `not-to-unresolvable` hits before the exclude was added).
- [x] Run separately per compilation unit (`depcruise:host` / `depcruise:webview` scripts, chained
      by `depcruise`) — same split as knip/tsc, since `src/` and `media-src/src/` have separate
      tsconfigs and the tool's `--ts-config` path resolution needs the right working directory per
      tree (`depcruise:webview` runs from inside `media-src/`).
- [x] **Baseline:** host (`src/`) — **0 violations** (50 modules, 101 dependencies). Webview
      (`media-src/src/`) — **1 real circular dependency**: `caret.ts → gap-paragraph.ts →
      caret.ts` (153 modules, 316 dependencies cruised). Not investigated/fixed (out of this item's
      scope) — flagged as a genuine finding, not a tool false positive, and **filed as
      [task 472](472-caret-gap-paragraph-circular-dep.md)** (worth breaking deliberately, and before
      task 460's physical decomposition carries the same shape into more files).
- [x] **Overlap with [task 460](460-module-decomposition-physical-move.md) phase 4** (the boundary
      meta-test) noted in `.dependency-cruiser.cjs`'s own header comment: task 460 should extend this
      config's `forbidden` rules with the real layering rules once the physical decomposition lands,
      rather than writing a separate hand-rolled `test/backend/module-boundaries.test.ts` — same
      guarantee, one config, not two things to keep in sync.

#### 5e. `type-coverage` — type strictness — **out of scope for this pass**

- [ ] **Not done.** The team lead's instruction for this task explicitly scoped item 5 to **5a-5d**
      ("the remaining tools — cross-file unused exports, duplication, dependency structure"); 5e
      (type-coverage / type-strictness) was not included. Left unchecked deliberately — not an
      oversight. The `media-src/tsconfig.json` `"strict": false` finding this item was meant to
      expose is still real and still undocumented by tooling; it needs its own pass.

### 6. Run all of it at the end of every implementation — **done (5a-5d + test:coverage; 5e omitted)**

- [x] Added `npm run quality` → `node scripts/quality.mjs`, a small orchestrator (same
      plain-Node-script pattern as `scripts/check-bundle-size.mjs` etc.) running, **in order but
      NOT `&&`-chained**: `lint:ci` (Biome, incl. complexity) → `knip` → `jscpd` → `depcruise` (host
      then webview) → `test:coverage` → `check:coverage-modules` (the 0%-module ratchet — a
      *separate* npm script from `test:coverage` itself, same as `ci.yml`'s two steps; it reads the
      `coverage-summary.json` the run before it just wrote). **A plain `&&` chain was tried first
      and rejected**: with `lint:ci` red today for reasons unrelated to any single stage (5a's 10
      deferred sites), a `&&` chain would run ONLY `lint:ci` and report nothing else — exactly the
      failure mode this tool exists to avoid ("run everything, see everything wrong," not "stop at
      the first red thing"). The script runs every stage regardless of earlier failures, prints a
      PASS/FAIL summary, and exits non-zero iff anything failed — same gate semantics as `&&`,
      without the blind spot. **Does not include `type-coverage`** — 5e was out of scope for this
      pass (see above); the script's own header comment and the AGENTS.md doc say so explicitly.
- [x] **Documented in `AGENTS.md`** (new "Quality-metrics toolchain" section, right after the
      testing section): the quality suite runs at the end of a task's implementation, alongside the
      existing simplify-pass convention; states what each tool covers and that `npm run quality`
      runs every stage regardless of earlier failures (not fail-fast).
- [ ] **Not wired into CI** — correct per this item's own condition ("only once each tool runs
      clean, or deliberately baselined"). Three independent reasons it's currently red, all
      pre-existing or already filed as their own task, none introduced by this task: `knip` (6 dead
      devDependencies + a 79-item export surface, task 471 + un-actioned item-4 corroboration, 5b);
      `depcruise` (1 real circular dependency in the webview, task 472, 5d); `check:coverage-modules`
      (the pre-existing `open-preview.ts` 0%-coverage gap flagged in item 3, still unresolved).
      complexity itself is fully resolved (5a, all 107 originally-measured sites suppressed,
      confirmed by two separate re-runs) — `lint:ci` as a whole may still flip red from unrelated,
      actively-changing files this item doesn't own (see 5a's closing note: one new complexity
      offender already appeared this way after this item's own work was verified complete). `jscpd`
      currently passes outright (a 9.59%/11.40% duplication baseline
      with no target isn't a failure condition — see task 473). **Verified the full, non-`&&` chain
      runs to completion** — see Verification below for the exact per-stage result.
- [x] **Amended ADR-0005's "Philosophy"** to record the exception: knip/jscpd/dependency-cruiser are
      accepted local-devDependency additions to the "keep the toolchain plain" rule, with the reason
      (Biome can't see cross-file exports, duplication, or dependency structure) and a note that
      `type-coverage` was scoped but deliberately not added (5e).

## Verification

- [x] `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (host) and `npm run typecheck` (webview,
      `tsc -p media-src/tsconfig.typecheck.json`) — both clean. (Item 4's export-surface reduction
      is still blocked behind task 460 per the Order section above, so this doesn't yet cover
      dropped-`export` regressions — it's clean because item 4 hasn't landed, not because it was
      verified.)
- [x] `npm test` — 168 files / 2394 tests, all passing. `node build.mjs` — builds clean (host `tsc`
      + webview esbuild bundle, including the `build.mjs` comment-only edit from 5a's deferred-site
      cleanup). `npm run lint:ci` reached **GREEN (exit 0)** 2026-08-01, confirmed by two separate
      re-runs, right after the 10 previously deferred complexity sites were finished (a tree-wide
      `--reporter=json` complexity scan returned **0** diagnostics at that point). **It did not stay
      green** — see 5a's closing note for the full account: one unrelated agent's file
      (`task468-repro-probe.spec.ts`) briefly caused a format failure and was fixed independently by
      its owner; separately, `echarts-retheme.ts` (already correctly suppressed here) and 3 other
      files were edited again live by what turned out to still be an active agent, introducing one
      new, unsuppressed complexity offender (`src/asset-link-actions.ts:105`) that is **not** part of
      this item's 107 and **not** fixed here — that file was visibly mid-edit at the time, so the
      same contention rule this item followed throughout applies. This item's own scope (complexity
      in the 107 originally-measured sites) is done and stable; `npm run lint:ci` as a whole is a
      moving target this item does not control.
- [ ] `npm run test:coverage` green with the pruned baseline — **not green, as expected and not
      this item's fault**: `npm run test:coverage` itself passes (all 2394 tests, thresholds met),
      but the separate `check:coverage-modules` ratchet fails on the pre-existing
      `media-src/src/open-preview.ts` 0%-coverage gap recorded in item 3. Item 3's prune was
      explicitly deferred earlier in this file (tree not clean at measurement time) — this item
      (5/6) didn't touch item 3 and doesn't fix this; it's flagged again here because `npm run
      quality`'s chain surfaces it.
- [x] `npm run quality` runs end-to-end — **actually run and confirmed**, not just assumed: all six
      stages executed (a plain `&&` chain was tried first, found to stop at the first red stage and
      hide the rest, and replaced with `scripts/quality.mjs` — see item 6), across three separate
      full runs on 2026-08-01 as the tree moved under it (see 5a's closing note). Its stage results
      moved between runs — `lint:ci` and `test:coverage` in particular flipped as unrelated agents'
      concurrent edits landed and settled — but every FAIL seen, at every point, traced to an
      already-known, already-filed finding: `knip` (task 471), `depcruise` (task 472),
      `check:coverage-modules` (item 3's pre-existing `open-preview.ts` gap), or (transiently)
      complexity/format issues in files this item doesn't own (5a). `jscpd` passed in every run.
      **What's stable and belongs to this item**, independent of the moving parts around it:
      complexity **107 originally-measured sites, 107 suppressed, 0 remaining**; knip 6 dead deps
      (task 471) + 79 export-surface findings; jscpd 9.59% duplicated lines / 11.40% tokens (task
      473); dependency-cruiser 0 host violations / 1 real webview circular dependency (task 472);
      type-coverage — not measured (5e out of scope). Whoever reads this next: re-run
      `npm run quality` yourself rather than trusting any single PASS/FAIL snapshot above — the tree
      has several other agents active on it and the exact stage results are not this item's to keep
      current after it closes.
- [x] `AGENTS.md` documents the end-of-implementation quality run (item 6).
- [x] Counts for item 5 (and the corrected, tree-wide item-5a count) written back into this file
      above. Items 3 and 4 are **not** this item's scope — their own checklist entries above already
      record their status (item 3: 3 of 4 sub-items done, prune deferred; item 4: not started,
      blocked behind task 460).


---

## Addendum, 2026-08-01 (from task 487) — the diagram devDependencies, and what knip config would/would not help

Re-checked while running `npm run quality` for [487](../487-structural-caret-position-for-undo-restore.md).
`knip` still exits 1; its devDependency list is now **5**: `d3`, `three`, `vega`, `vega-embed`,
`vega-lite`.

**These are NOT dynamic imports that knip fails to see, and no knip configuration will make them go
away legitimately.** The mechanism is the one item 5b already established and
[471](471-dead-vendored-devdependencies.md) was filed for: every one of these ships as a
hand-vendored bundle under `media-src/vendor/` (`threejs/`, `vega/`, `markmap/`, plus 15 more), so
nothing in the source references the *package* name. knip is reporting the truth — the
devDependency is leftover after the vendoring, and the honest fix is to remove it, not to
`ignoreDependencies` it.

Two things that DID change since 471 closed and are worth a look:

- **`d3` is new to the list** — it was not among 471's six. `media-src/scripts/fetch-markmap.mjs` and
  `fetch-mermaid-layout-elk.mjs` both mention d3, so it is plausibly a transitive need of a fetch
  script rather than of the shipped bundle. Worth confirming before removal — if a fetch script
  genuinely needs it at build time, it belongs in the manifest and knip needs an entry pattern
  covering `media-src/scripts/`, which IS a legitimate config fix.
- **`markmap-lib` / `markmap-view` are gone from the list**, so part of 471 evidently landed. The
  remaining four (`three`, `vega`, `vega-embed`, `vega-lite`) did not.

Verification rule if anyone picks this up: **do not validate a removal by "the build still passes"** —
it will, because the vendored bundle is what actually ships. Validate by rendering a diagram of that
engine (the `test:vscode:visual` diagram suite covers exactly this) so a runtime-only break is caught
here rather than by a user.

Also still open from the same run: `knip.jsonc` carries four configuration hints
(`test/vscode-e2e` + `.worktrees/**` in `ignoreWorkspaces`, `vscode` in `ignoreDependencies`,
`src/app/extension.ts` as a redundant entry pattern) — stale-config cleanup in the same family as
item 5b's flat-tree paths, and unlike the dependencies above this one is pure config with no runtime
risk.
