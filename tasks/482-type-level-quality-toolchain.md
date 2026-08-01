# Task 482 — type-level quality: turn on what we already own, then adopt what we don't

**Status:** 📋 OPEN — fully measured 2026-07-31, nothing changed yet · **Impact:** 🟢 high on defect
class, 🟡 medium on effort — phases 1–2 are hours and find real bugs today; phase 3 is the only
genuinely large one and is deliberately isolated so the cheap wins do not wait for it ·
**Origin:** a review of the 2026 TypeScript quality-tool landscape against this repo's actual
gaps. **Related:** [469](469-housekeeping-sweep.md) (the `quality` toolchain; item 5e parked
type-strictness *exactly here* and said it needs its own plan — this is that plan),
[477](477-writeback-changed-underneath-notification.md) (phase 1 surfaces a swallowed rejection in
one of its two suspect writers), [481](481-dependency-audit-triage.md) (audit tooling, separate).

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

### Phase 1 — Biome: switch on what is already installed *(hours)*

- [ ] Enable the **`types` domain** in `biome.json`. Fix the 25 floating promises + 2 misused
      promises. Prioritise the 11 in production webview code; the 14 in tests are real but lower
      stakes. Do **not** blanket-apply the unsafe autofix — `await` in a `setTimeout` callback is
      not always the right answer, and `void` is sometimes the honest one.
- [ ] Fix `finish-init.ts:166` and `pending-edit.ts:34` **individually and deliberately**, with a
      note in each on what the rejection path should now do. These two are the ones with plausible
      user-visible reach.
- [ ] Enable `suspicious/noConsole`, **scoped by override** to `src/**` and `media-src/src/**`
      only, with `media-src/src/util/webview-log.ts` exempted (it is the logger). Confirm the
      scoped count is **2 → 0**, not 263, before committing. Leave e2e specs and build scripts
      free — this rule is a ratchet against future drift, not a cleanup job.
- [ ] Bump `@biomejs/biome` 2.4.16 → 2.5.6 (500 rules, cross-file linting, better type-aware
      accuracy). Re-run `npm run lint:ci` and triage anything new **before** committing the bump,
      so a new-rule wave never lands mixed with our own fixes.

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
      directory using the 22-module decomposition from [460](460-module-decomposition-physical-move.md),
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

### Phase 4 — TypeScript 7.0 *(medium)*

- [ ] Trial `typescript@7.0.2` on a branch. Run `npm run typecheck` (both projects), `npm test`,
      `node build.mjs`, and the fast real-VS-Code tier. Measure the type-check wall clock before
      and after — the claimed 8–12× is the whole point and should be verified here, not assumed.
- [ ] Confirm the ecosystem blocker really does not bite us. Expected clear: Biome needs no TS
      API, vitest transpiles via esbuild, we have no `ts-jest`/`ts-morph`/framework template
      checkers. **Verify rather than assume** — `npm ls typescript` to find every consumer of the
      compiler in all three workspaces.
- [ ] Best sequenced **after** phase 2 and **before or during** phase 3: a 10× faster checker
      makes the `strictNullChecks` grind materially cheaper.
- [ ] If anything blocks, record what and re-check after TS 7.1 ships the programmatic API.

### Phase 5 — tools we do not have yet *(evaluate; adopt only what earns it)*

- [ ] **`type-coverage`** — parked in [469](469-housekeeping-sweep.md) item 5e as a non-goal
      pending exactly this task. Establish a baseline number now, before phase 3, so the
      `strictNullChecks` migration has a metric that moves. Adopt as a **local ratchet**, not a
      CI gate, until it is green.
- [ ] **Semgrep — 2–3 custom repo rules only, local-only.** Not for its 2500-rule registry, but
      for invariants no other tool here can express, each drawn from a *shipped* regression:
      (a) injected DOM missing `data-render` (the "ghost span leaks into saved markdown" bug —
      38 sites set the attribute today, nothing enforces it); (b) `.firstChild` shortcuts in
      IR/WYSIWYG DOM code (the callout marker text-node split — only 4 production sites, so the
      rule would be quiet); (c) `ResizeObserver`/`MutationObserver` in `echarts-fit.ts`.
      **Install path is the deciding constraint**: the `semgrep` npm package is dead (0.0.1, six
      years old), so this means Python/pipx or Docker in a repo that is deliberately plain Node +
      npm. Run it as `docker run --rm -v $PWD:/src semgrep/semgrep …` against a hand-written
      `.semgrep.yml`, **with zero entries added to `package.json`**. Adopt permanently only if it
      catches something real within a month.
- [ ] **`npm audit --omit=dev`** — document it as a release-time check. The findings themselves
      belong to [481](481-dependency-audit-triage.md); what belongs here is only the decision of
      where the check lives.

### Phase 6 — clear the existing red stages, then wire CI *(only after the above are green)*

The tools we **already own** are the actual precondition here, and they are currently the thing
blocking the gate — not the new ones. This is work, not a formality:

- [ ] **`knip`** — 46 findings after [469](469-housekeeping-sweep.md) took it from 81. Clear or
      deliberately baseline the rest. Note the overlap with this task: phase 5's `markmap-lib`
      question in [481](481-dependency-audit-triage.md) is a knip finding, and phase 2's
      `noUnusedLocals`/`noUnusedParameters` will move the numbers too — do knip **after** those,
      not before, or the work is done twice.
- [ ] **`jscpd`** — duplication target is still unset. Set one that reflects the tree as it is,
      then ratchet.
- [ ] **`dependency-cruiser`** — currently clean (0 cycles as of [460](460-module-decomposition-physical-move.md));
      confirm it stayed clean and keep it that way.
- [ ] **the 0 %-module coverage ratchet** — separately red (469 item 3, an untested module).
- [ ] Only once all of the above are green: wire `npm run quality` into CI (469 item 6).
      Everything this task turns on inherits the same rule — **a tool joins the gate only once it
      runs clean.** Wiring a red tool teaches people to ignore the summary, which is the exact
      failure 469 was built to avoid.

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
  Reasoning in full in [481](481-dependency-audit-triage.md) — do not re-litigate.
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
