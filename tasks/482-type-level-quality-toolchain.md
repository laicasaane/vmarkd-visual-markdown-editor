# Task 482 — type-level quality: turn on what we already own, then adopt what we don't

**Status:** 🔶 Phase 1 ✅ DONE 2026-08-06, phases 2–6 still open (2/3/6 largely superseded by
[503](503-media-src-strict-mode.md), see below) · **Impact:** 🟢 high on defect class, 🟡 medium on
effort — phase 1 found two real (if currently-unreachable) swallowed-rejection bugs; phase 3 is the
only genuinely large one left and is deliberately isolated so the cheap wins do not wait for it ·
**Origin:** a review of the 2026 TypeScript quality-tool landscape against this repo's actual
gaps. **Related:** [469](done/469-housekeeping-sweep.md) (the `quality` toolchain; item 5e parked
type-strictness *exactly here* and said it needs its own plan — this is that plan),
[477](done/477-writeback-changed-underneath-notification.md) (phase 1 surfaces a swallowed rejection in
one of its two suspect writers), [481](done/481-dependency-audit-triage.md) (audit tooling, separate).

> ⚠️ **Phase 2/3's tables below are superseded by [503](503-media-src-strict-mode.md) (2026-08-06),
> filed independently from the same 469 item 5e origin.** This file assumed each `strict` sub-flag
> would be added directly to `media-src/tsconfig.json` — 503 measured that this fails: Vditor's own
> TypeScript source is compiled as part of the same program (ADR-0004) and fails every sub-flag on
> its own, so a direct add can never reach zero errors. 503 instead built an ADDITIVE, path-filtered
> channel (`npm run typecheck:strict`, `scripts/typecheck-strict.mjs`) that gates
> `useUnknownInCatchVariables` + `noImplicitAny` + `strictFunctionTypes` + `strictNullChecks` — all
> of Phase 2's flags except `strictBindCallApply`/`alwaysStrict`/`strictPropertyInitialization`/
> `noImplicitThis`/`noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns` — over `media-src/src/**`,
> with every real error it surfaced fixed for real (71 total across the two tasks). If Phase 2/3 is
> ever picked up here, extend the SAME additive channel rather than re-attempting a direct
> `tsconfig.json` edit — do not re-derive this the hard way.

## Premise

The finding that drives this task: **this repo's quality gap is not tool count.** Biome + knip +
jscpd + dependency-cruiser + the coverage ratchet is a complete, well-chosen set for a project this
size. The gap is that **almost nothing here checks types**, and every type-aware capability that
would close it is either already installed and switched off, or one version bump away.

Two facts from the ecosystem make now the moment:

1. **TypeScript 7.0 went GA on 2026-07-08** — the Go-native compiler, 8–12× faster type-checking
   (VS Code's own codebase: 125.7 s → 10.6 s). We are on 5.9.3; `latest` is 7.0.2.
2. TS 7.0 ships **no stable programmatic API**, so `typescript-eslint`, `ts-jest`, `ts-morph` and
   the Vue/Svelte/Astro template checkers cannot run on it (API targeted for 7.1, months out).
   **That blocker does not apply to us**: we lint with Biome, which uses its own type synthesizer
   and never loads the TS compiler, and vitest transpiles via esbuild. We are unusually free to
   adopt early — a direct dividend of the earlier "Biome instead of ESLint" decision.

## Measured baseline — 2026-07-31

All figures produced on this tree with the installed toolchain (Biome 2.4.16, TypeScript 5.9.3).

### tsconfig strictness — webview only

`src/` (host) is **already `strict: true`** in the root `tsconfig.json`. Only
`media-src/tsconfig.json` sets `strict: false`. Measured with
`tsc -p media-src/tsconfig.typecheck.json --<flag>`, each flag **independently**:

| flag | errors | note |
|---|---:|---|
| *(current baseline)* | **0** | clean today |
| `--strict` (all of it) | **1841** | the headline number |
| `strictNullChecks` | **1694** | **92 % of the total — this one flag *is* the project** |
| `strictFunctionTypes` | 83 | |
| `noImplicitAny` | **19** | a day's work |
| `useUnknownInCatchVariables` | 3 | |
| `noImplicitThis` | 2 | |
| `strictPropertyInitialization` | 1 | |
| `strictBindCallApply` | 0 | free |
| `alwaysStrict` | 0 | free |

Non-strict flags also explicitly disabled in `media-src/tsconfig.json`:

| flag | errors |
|---|---:|
| `noImplicitReturns` | 31 |
| `noUnusedParameters` | 12 |
| `noUnusedLocals` | 8 |

> ⚠️ The sub-flag counts are measured **one flag at a time and do not sum** to 1841 — errors
> cascade and overlap. Treat them as *relative sizing*, not as a partition. The decisive ratio is
> the only one that matters here: **everything except `strictNullChecks` is ~108 errors; that one
> flag is 1694.**

### Biome type-aware rules — installed, switched off

`biome.json` sets `recommended: true`, which does **not** enable the `types` domain. The rules are
present in 2.4.16 (under `nursery`, marked "recommended for this domain"). Measured with
`biome lint --only=…`:

| rule | findings |
|---|---:|
| `noFloatingPromises` | **25** |
| `noMisusedPromises` | 2 |
| `useAwaitThenable` | 0 |
| `useArraySortCompare` | 0 |

Cost of running them: **669 files in ~540 ms.** This is close to free.

The 25 floating promises split **11 production webview / 14 test+harness**:

- diagram engines — `vega.ts` ×2, `geojson-topojson.ts` ×2, `wavedrom.ts`, `stl.ts`,
  `nomnoml.ts`, `graphviz-render.ts`, `plantuml/plantuml-render.ts`
- [`media-src/src/boot/finish-init.ts:166`](../media-src/src/boot/finish-init.ts#L166) —
  `ensureHljsLoaded(cdn).then(…)` with no rejection handler
- [`media-src/src/bridge/pending-edit.ts:34`](../media-src/src/bridge/pending-edit.ts#L34) —
  `opts.onIdle()` fired from a `setTimeout`, unawaited, rejection silently swallowed

**On that last one and task 477 — state the limit of the claim.** 477 hypothesises a race between
our two writers through the shared `applyToDocument`. `pending-edit.ts` is the **webview-side**
edit debounce and is one of those writers; `NOOP_CHECK_IDLE_MS` from 477's own prediction lives in
the **host-side** [`src/writeback/writeback-controller.ts:48`](../src/writeback/writeback-controller.ts#L48).
Different timers. This is **not** a claimed cause — it is a swallowed rejection sitting in a
suspect path, worth eliminating before anyone guesses at something harder.

### `noConsole` — ungated today

AGENTS.md's convention is "debug output goes to the vMarkd Output channel, not `console.log`", but
`suspicious/noConsole` is **not part of Biome's `recommended` set**, so nothing enforces it.

`biome lint --only=lint/suspicious/noConsole` → **263 warnings**, but the distribution is what
matters: **127 files in `test/vscode-e2e`**, 7 in `media-src/e2e`, 3 in build scripts.

Scoped to production trees only, the count is **exactly 2 diagnostics**, both in one file:

```
media-src/src/util/webview-log.ts:16:5
media-src/src/util/webview-log.ts:34:7
```

That file **is the webview logger** — the legitimate `console` caller the convention exists to
route everything else through. So production code already honours the rule **completely**, and the
host `src/` tree produces zero diagnostics. Enabling the rule globally would bury that perfect
signal under e2e noise; it must be scoped by override to `src/**` + `media-src/src/**`, with an
exemption for `webview-log.ts` itself.

### Versions

| | installed | latest |
|---|---|---|
| `@biomejs/biome` | 2.4.16 | **2.5.6** |
| `typescript` | 5.9.3 | **7.0.2** |

## Scope — five phases, cheapest first, each independently shippable

Ordered so every phase pays for itself before the expensive one starts. **Do not batch these into
one commit.**

### Phase 1 — Biome: switch on what is already installed *(hours)* — ✅ DONE 2026-08-06

- [x] Enable the **`types` domain**. Fixed all 25 floating promises + 2 misused promises,
      individually, no blanket autofix.
      > ⚠️ **`linter.domains: { "types": "all" }` is a NO-OP at runtime**, on both 2.4.16 and 2.5.7
      > — confirmed present and correctly tagged in `configuration_schema.json`/`biome explain`,
      > but reverting a fixed file and running plain `biome check`/`biome lint` (no `--only`) found
      > nothing with `domains` set; enabling the same rules directly under `rules.nursery` in
      > `biome.jsonc` DID catch them. Schema-ahead-of-implementation. Used the direct rule keys —
      > see `biome.jsonc`'s own comment for the reproduction. **Do not re-attempt `domains` without
      > re-verifying on a newer Biome first.**
      - 9 production sites (diagram engines + graphviz/plantuml) — all `loadScript(...).then(...)`
        chains, `void`-marked with a comment noting `loadScript` never rejects by construction
        (its own `onerror` handler resolves, see `load-script.ts`) — pure type-hygiene, no
        behavioural change.
      - 2 harness/boot sites (`ensureHljsLoaded(cdn)` in `finish-init.ts` and
        `wysiwyg-highlight-harness.ts`) — same treatment; `ensureHljsLoaded` also already catches
        internally (`wysiwyg-code-highlight.ts`), confirmed never rejects.
      - 13 test/backend sites — all the same `resolveCustomTextEditor(...)` bare-statement shape
        across 9 files (`resolveProvider`/`openWiki`/`activateAndResolve` helpers). `void`-marked:
        `resolveCustomTextEditor` is `async` but completes synchronously for every conflict-free
        document these tests construct, so the returned Promise resolves with no observable async
        tail — awaiting would require converting every helper (and its many call sites) to async,
        a much larger and riskier change for zero behavioural gain.
      - 2 `noMisusedPromises` sites (`boot-elk.ts`, `d2-wasm.ts`) — **false positives**, not fixes:
        `if (bootPromise) return bootPromise` is a null-check on the boot-memoization cache
        (`Promise<X> | null`), not a missed `await`. Documented with a `biome-ignore` comment
        (the ignore directive must be the LINE IMMEDIATELY above the flagged code — a multi-line
        explanation block above it makes the ignore itself register as "unused", learned the hard
        way here).
- [x] Fixed `finish-init.ts:166` and `pending-edit.ts:34` individually:
      - `finish-init.ts` — `ensureHljsLoaded` already catches internally; `void` + comment, no
        behavioural gap.
      - `pending-edit.ts:34` (`opts.onIdle()`) — this module is deliberately decoupled from any
        Vditor/VS Code reference (see its own header) so it can't report a rejection itself;
        `void`-marked with a comment pointing at the real fix, which lives in the concrete
        `onIdle` implementation instead.
      - **The real fix**: `edit-sync.ts`'s `onIdle` (the only real implementation passed to
        `createPendingEdit`) wraps its body in `try { ... } catch (err) { reportError(err,
        'edit-sync: onIdle') }`. Before this, a `postEdit()` throw (e.g. a Lute serialize failure)
        would become a truly unhandled rejection — the busy cursor still cleared (the `finally`
        already handled that), but the exception vanished with zero trace anywhere, silently
        killing that idle cycle's host sync. Now it's logged to the vMarkd Output channel via the
        existing `reportError` (not previously imported in this file). **Currently unreachable in
        normal operation** (no known path makes `postEdit()` throw today) — same class of
        "already-unreachable behavioural fix" as Step 2's `link-click-fix.ts` in task 503, called
        out explicitly per that precedent rather than folded into "type fixes".
- [x] Enabled `suspicious/noConsole`, scoped by `overrides` to `src/**` + `media-src/src/**`,
      `media-src/src/util/webview-log.ts` exempted via a second, narrower override. Confirmed via
      plain `biome check` (not `--only`, which force-enables past any config and gave a false
      "still 2" reading during verification): a probe `console.log` in `src/app/commands.ts` was
      caught; `webview-log.ts` itself stayed clean; e2e/build-script trees untouched.
- [x] Bumped `@biomejs/biome` 2.4.16 → **2.5.7** (2.5.6 was already superseded on npm by the time
      this ran). `npm install @biomejs/biome@2.5.7` rewrites ALL of `package.json` through npm's
      own JSON serializer, converting every existing `\uXXXX` escape (e.g. `—`, `Sławomir`)
      to its literal UTF-8 character — a 63-line diff for a 1-line version bump.
      Reverted `package.json`, applied the version bump as a single-line edit instead, and let
      `npm install` (no args) sync `package-lock.json` without touching `package.json` again.
      2.5.7 fallout, triaged before considering the bump done: 6 files with formatter-only diffs
      (`biome format --write`, no logic change) and **one new real `noFloatingPromises` finding**
      — a third `resolveCustomTextEditor` helper in `extension.test.ts` (`activateAndResolve`) that
      2.4.16 didn't catch through the `mock.calls.customEditor!.provider as MarkdownEditorProvider`
      cast; fixed the same way as the other 13. Also surfaced one informational (non-failing)
      deprecation notice — `rules.recommended` → `preset` — left as-is, noted here rather than
      migrated (out of this phase's scope, no behavioural effect, `biome migrate` not run).

**Verification (Phase 1) — all exit codes read directly:**

- [x] `npm run lint:ci` — exit 0 (1 informational deprecation notice, no errors).
- [x] `npm run typecheck` / `npm run typecheck:strict` — both exit 0, unaffected.
- [x] `node build.mjs` — exit 0.
- [x] `npm test` — exit 0, **196 files / 2772 tests** (matches the pre-482 baseline exactly,
      `uptime` load 2.16 — not a task-476 risk window).
- [x] `xvfb-run -a npm --prefix media-src run test:e2e` — exit 0, 456 passed / 5 skipped (1.9 min),
      matches the existing baseline.
- [x] Targeted real-VS-Code specs for the one behavioural fix (`edit-sync.ts`'s `onIdle` catch) and
      the pending-edit/message-router surface touched by the `void` fixes: `save-fidelity.spec.ts`
      and `doc-sync.spec.ts` — **3/3 passed**.
- [x] `xvfb-run -a npm run test:vscode:fast` — exit 0, **40/40 passed**, 1 flaky
      (`paste-real.spec.ts`, an unrelated clipboard/undo spec with a pre-existing flaky history —
      see memory `vscode-e2e-focus-tests-are-flaky` — passed on retry).
- [x] `npm run quality` — **PASS on all six stages** (lint:ci, knip, jscpd, depcruise, test:coverage,
      check:coverage-modules).

### Phase 2 — the cheap tsconfig flags *(hours)*

Apply to `media-src/tsconfig.json`, one flag per commit, each with its errors fixed:

- [ ] `strictBindCallApply`, `alwaysStrict` — **0 errors**, pure ratchet, take them first.
- [ ] `strictPropertyInitialization` (1), `noImplicitThis` (2), `useUnknownInCatchVariables` (3).
- [ ] `noUnusedLocals` (8), `noUnusedParameters` (12).
- [ ] `noImplicitAny` (19) — the highest-value item in this phase; it is what most people *mean*
      by "strict".
- [ ] `noImplicitReturns` (31).
- [ ] `strictFunctionTypes` (83) — largest here; split across commits if it helps review.

After this phase `media-src` has every strictness flag except `strictNullChecks`.

### Phase 3 — `strictNullChecks` *(the large one — 1694 errors)*

- [ ] **Decide the strategy before writing any fix.** At 1694 errors a flag day is not on the
      table. Evaluate at least: (a) per-file opt-in via a plugin such as `ts-strict-plugin`;
      (b) a generated `@ts-expect-error` baseline that new code cannot add to; (c) directory-by-
      directory using the 22-module decomposition from [460](done/460-module-decomposition-physical-move.md),
      leaf modules first. Write the comparison down here — the decision is the deliverable of this
      checkbox, not the fix.
- [ ] Whatever is chosen, it must include a **ratchet**: the count may only go down. An
      un-ratcheted migration regresses while you work on it.
- [ ] Execute incrementally. This phase is expected to span multiple sessions and **must not
      block phases 4–5**.

> 📌 **Sizing call for the user.** Phase 3 alone is plausibly larger than phases 1, 2, 4 and 5
> combined. It is kept in this file because the request was to cover *all* recommendations and
> narrowing scope unilaterally is not mine to do — but splitting it into its own task once the
> strategy in the first checkbox is chosen is the reasonable move. **Flagging, not deciding.**

### Phase 4 — TypeScript 7.0 *(medium)* — ✅ DONE 2026-08-06/07, merged to `main`

- [x] Trialed `typescript@7.0.2` on branch `trial/typescript-7.0.2` (off `main` at `6c35a21`, task
      482 Phase 1's commit). **Two real breaks, both fixed with a small, permanent config change —
      not a compatibility shim:**
      1. **Host (`tsconfig.json`) lost implicit `@types/node` inclusion.** With no `types` array,
         5.9.3 auto-includes every package under `node_modules/@types`; 7.0.2 does not — `Buffer`,
         `setTimeout`/`clearTimeout`, `NodeJS.Timeout`, `process`, `node:fs` etc. all went
         "Cannot find name/module" (68 diagnostics, every one this shape). Fix: added
         `"types": ["node"]` to `compilerOptions`. This is arguably correcting a latent gap
         (`types` should have been explicit already) rather than a workaround.
      2. **`media-src/tsconfig.typecheck.json` gained a new diagnostic, TS2882**, on 3 CSS/LESS
         side-effect imports (`vditor/src/index.ts`'s `./assets/less/index.less`, `main.ts`'s
         `../main.css` and `../vscode-chrome.css`) — 7.0 now requires an ambient module declaration
         for a side-effect-only import of an unrecognized extension; 5.9.3 silently allowed it.
         `media-src/src/util/types.ts` had `declare module '*.scss'` but no `*.css`/`*.less`
         siblings — added both, 2 lines, matching the existing pattern exactly.
      - No other diagnostics anywhere — `typecheck:strict`'s 71-error tail from Step 3/Phase 1
        stayed at 0 on the first try, same filtered Vditor count (1741 vs 1745 — TS7 groups a
        handful of Vditor's own diagnostics slightly differently, irrelevant since both are
        filtered either way).
- [x] **Measured wall-clock, not assumed:**
      | check | 5.9.3 | 7.0.2 | ratio |
      |---|---:|---:|---:|
      | `npm run typecheck` (webview) | 4.87s | 0.62s | **~7.8×** |
      | `npm run typecheck:strict` (webview, +3 flags) | 6.86s | 0.77s | **~9×** |
      | host `tsc -p tsconfig.json --noEmit` (7.0.2 only; no clean 5.9.3-alone baseline taken — it's normally folded into `node build.mjs`, not run standalone before this trial) | — | 0.27s | — |
      Both webview ratios land inside or above the vendor's claimed 8–12× despite this repo's small
      size (669 files) — not just a large-monorepo effect.
- [x] Confirmed the ecosystem blocker does not bite us, **verified not assumed**: `npm ls
      typescript --all` (root) shows exactly one node in the tree, `typescript@5.9.3` (now 7.0.2 on
      this branch) — no `ts-jest`, no `ts-morph`, no framework template checker anywhere in any of
      the three workspaces. `media-src`'s own `npm ls typescript` is empty (it uses the root binary
      via path in both `typecheck` scripts). vitest transpiles via esbuild (confirmed by
      `npm test` passing unchanged — vitest never touches `tsc`). Biome needs no TS API by
      construction. Nothing in this repo can be blocked by TS 7's missing programmatic API.
- [x] Full verification on the branch, all exit codes read directly: `npm run lint:ci` exit 0 (same
      1 pre-existing deprecation info, unrelated) · `node build.mjs` exit 0 · `npm test` 196/196
      files, 2772/2772 tests (`uptime` load 1.96, not a task-476 window) · `npm run quality` PASS
      all 6 stages · `xvfb-run -a npm --prefix media-src run test:e2e` 456 passed / 5 skipped,
      matches baseline · `xvfb-run -a npm run test:vscode:smoke` 10/10 · `xvfb-run -a npm run
      test:vscode:fast` **41/41 passed, 0 flaky** (8.2 min) — the full routine tier, since a
      compiler swap changes the actual emitted host JS (`tsc -p ./` is what `build.mjs` uses to
      produce `out/*.js`, not just a type-check), so this needed more than the targeted-spec
      confidence a pure type-only change would get.
- [x] **Merged to `main` 2026-08-07** (user approved after reviewing the measured results —
      "Merge do main teraz"). Fast-forwarded from `trial/typescript-7.0.2` at `5e4c973`
      (`main` was at `6c35a21`, no divergence, no merge commit needed); trial branch deleted after.
      Re-ran `npm run typecheck` and `npm run typecheck:strict` directly on `main` post-merge as a
      final sanity check — both still exit 0, same 1741-filtered-Vditor-diagnostic count. `main` is
      now on `typescript@7.0.2`.
- [x] Re-sequencing note for Phase 3, now live: a ~9× faster checker changes the economics of the
      1694-error `strictNullChecks` migration materially — Phase 3's strategy decision (per-file
      opt-in vs baseline vs directory-by-directory) should be made knowing TS 7.0.2 is what will
      run the loop, not 5.9.3.

### Phase 5 — tools we do not have yet *(evaluate; adopt only what earns it)*

- [ ] **`type-coverage`** — parked in [469](done/469-housekeeping-sweep.md) item 5e as a non-goal
      pending exactly this task. Establish a baseline number now, before phase 3, so the
      `strictNullChecks` migration has a metric that moves. Adopt as a **local ratchet**, not a
      CI gate, until it is green.
- [x] **Semgrep — DECLINED 2026-08-07 (user).** The rules themselves (injected DOM missing
      `data-render`, `.firstChild` shortcuts in IR/WYSIWYG DOM code, `ResizeObserver`/
      `MutationObserver` in `echarts-fit.ts`) were never the objection — the install path was:
      the `semgrep` npm package is dead, so running it means Docker or Python/pipx in a repo that
      is deliberately plain Node + npm (ADR-0005's Philosophy). User rejected specifically on that
      Docker/pipx dependency, not on the rules' value. Not adopted; not revisited unless the
      install-path constraint changes (e.g. a maintained npm-native semgrep build appears).
- [x] **`npm audit` — DECIDED 2026-08-07, different resolution than originally proposed.** The
      original bullet proposed `--omit=dev` as a release-time-only check, to avoid dev-only CVEs
      (unfixable without waiting on an upstream chain) becoming CI noise. The user instead chose to
      just **raise `--audit-level` from `moderate` to `low`** on the existing full-tree
      (dev+prod) audit, in both CI and `npm run quality` — stricter, not narrower. This works
      today because root's 3 dev-only findings from [481](done/481-dependency-audit-triage.md)
      (postcss/vite/undici, via vitest/jsdom) are already fixed (root now audits clean at `low`);
      the one live `low` finding this surfaced — `esbuild 0.27.3–0.28.0` in media-src
      (`GHSA-g7r4-m6w7-qqqr`, Windows-only dev-server arbitrary file read) — was fixed for real via
      plain `npm audit fix` (in-range, no `--force`), not silenced.
      - Added `audit:host`/`audit:webview`/`audit` to `package.json` (same `depcruise`-style
        root+webview composition) and wired `audit` into `scripts/quality.mjs`'s `STAGES` — the
        quality suite now has 7 stages, all green.
      - Consolidated CI's two separate `--audit-level=moderate` steps into one
        `npm run audit` step at `low`.
      - **`test/vscode-e2e` — FIXED FOR REAL 2026-08-07, not left as the accepted risk above.**
        Its one finding ([481](done/481-dependency-audit-triage.md)'s playwright SSL-verification
        bypass, `GHSA-7mvr-c777-76hp`) needed `audit fix --force` — bumping `@playwright/test` past
        the version that dropped `_toImpl`. That alone breaks `vscode-test-playwright@0.0.1-beta2`
        (confirmed: `TypeError: playwright._toImpl is not a function`, 10/10 smoke failing, tried
        both `1.62.1` and `1.55.1`, the minimum patched version — same break either way). Traced the
        root cause (a PRIVATE Playwright internal `vscode-test-playwright` reaches into to scrape
        the injected VSCodeTestServer's address), found an unpublished single-contributor fork
        that fixed it the same way we'd have designed it (file-based address discovery instead of
        internals), and **ported that fix as our own anchor-patch** rather than depend on the fork
        (no npm publish, no releases/tags, one contributor) — `scripts/patch-vscode-test-playwright.mjs`,
        wired as `test/vscode-e2e`'s `postinstall`, same anchor-assert-and-throw-on-drift philosophy
        as ADR-0004's Vditor patches, just applied to a plain `node_modules` package instead of an
        esbuild bundle. `@playwright/test` bumped to `1.62.1`. Verified: real-VS-Code smoke (10/10)
        and fast tier (41/41, 0 flaky) both pass on the patched dist;
        `npm run audit:vscode-e2e` → 0 vulnerabilities. Added `audit:vscode-e2e` to `package.json`
        (deliberately NOT part of the root `audit` composite or `quality.mjs` — that workspace isn't
        installed in the main CI job) and wired it as its own step in `pr-webview-smoke.yml` and
        `nightly.yml`, right after their existing "Install (vscode-e2e harness)" step, where it
        actually is installed. Full detail and the exact patch mechanics in
        [481](done/481-dependency-audit-triage.md) CORRECTION 3.

### Phase 6 — clear the existing red stages, then wire CI *(only after the above are green)*

> ⚠️ **Largely overtaken by 498-503 (2026-08-06), done outside this task file — re-verified here,
> not re-done.** All four sub-items below were closed as part of the knip/dupes/quality-toolchain
> pass that also produced 503 (see tasks 498, 500-502). Re-checked directly on `main` today rather
> than trusted from memory:

- [x] **`knip`** — clear, `npm run knip` exit 0 (task 498 took 81→0; task 482 Phase 1's own bump
      didn't reopen it). **Wired into CI** (`.github/workflows/ci.yml`'s "Unused code (knip)" step,
      added between 498 and 503 — not by this task, but confirmed present).
- [x] **`jscpd`** — `.jscpd.json` has a real threshold (task 502 measured and disposed of the
      29 in-scope production↔production clone pairs; 698 test↔test pairs deliberately excluded as
      boilerplate). `npm run jscpd` clean under that threshold. **Not wired into CI** — see below,
      this is a deliberate exception, not an oversight.
- [x] **`dependency-cruiser`** — still clean, `npm run depcruise` exit 0, 0 cycles. **Not wired
      into CI**, same exception as jscpd.
- [x] **the 0%-module coverage ratchet** — not clear (still 17 modules at 0%, task 190's ratchet),
      but the ratchet ITSELF is green (`check:coverage-modules` passes because 17 doesn't exceed
      the recorded baseline of 17) and **is wired into CI** (`.github/workflows/ci.yml`'s "Coverage
      module ratchet" step). Zeroing those 17 modules is separate, real work this task never
      claimed to do (469 item 3) — not silently dropped, just out of this task's scope.
- [x] `npm run quality` as ONE CI step (rather than the individual steps above, each already
      wired separately) is **decided against, in writing, per ADR-0005's "Philosophy" section**:
      knip/jscpd/dependency-cruiser are the accepted plain-toolchain exception specifically as
      *local* `npm run quality` tools; knip earned a dedicated CI step on its own merits (a clean,
      fast, zero-flake gate) but jscpd/dependency-cruiser were not given the same treatment — no
      one has proposed CI wiring for those two, so there is nothing to decide yet, not a red stage
      being ignored. Leave as-is unless a new decision reopens ADR-0005 explicitly.

## Out of scope — decided, not overlooked

- **Oxlint / OXC.** A lateral move, not an upgrade. It is faster than Biome and its type-aware
  path via `tsgolint`/tsgo is technically the better long-term bet, but it has no formatter, fewer
  editor integrations and a still-evolving plugin system. At our scale — 669 files linted in
  ~540 ms — the speed argument buys us **nothing**, and we would trade away the formatter we
  actually use. Revisit only if lint time ever becomes a real bottleneck.
- **SonarQube / Codacy / DeepSource / Snyk Code.** Hosted org-scale platforms with dashboards and
  seats. `npm run quality` already covers this locally and for free.
- **`bun audit`.** Used once as a cross-check and rejected as a permanent tool: it reports the
  same advisories as npm (counted per-advisory, hence larger totals) but has **no `--omit=dev`
  equivalent**, and dev-vs-prod is precisely the distinction that makes our findings triageable.
  Reasoning in full in [481](done/481-dependency-audit-triage.md) — do not re-litigate.
- **Enabling `strict` on the host `src/` tree.** Already on.
- **Touching `tasks/README.md`.** Per AGENTS.md, the index moves only on full completion.

## Definition of done

- Phases 1 and 2 applied, each flag/rule in its own commit, `npm test` + `npm run typecheck` +
  `npm run lint:ci` green after each.
- Phase 3's **strategy decision written into this file**, whether or not the migration itself is
  finished here.
- Phase 4 answered with **measured** before/after type-check timings, not the vendor's number.
- Phase 5: each of the three tools either adopted with its config committed, or declined **in
  writing here with the reason**. A silent omission is not a decline.
- Phase 6 explicitly deferred or done — not left ambiguous.
- Every "measured baseline" number above re-confirmed at the end, so the task records both the
  before and the after.
- Nothing committed or pushed without the user's go.
