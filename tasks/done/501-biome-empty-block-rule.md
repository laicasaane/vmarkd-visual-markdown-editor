# Task 501 — enable `noEmptyBlockStatements`; evaluate and reject `useSimplifiedLogicExpression`

**Status:** DONE · **Impact:** 🟢 lint-config only — no runtime change; 85 no-op stubs/guards across
`media-src/e2e/`, `media-src/src/**` (production + colocated tests), and `test/**` gained an
explicit reason comment (2 more sites in `media-src/src/diagrams/plantuml/plantuml-render.ts` were
handled by the concurrent task-502 agent, out of this task's scope) · **Origin:** user question "do
we have anything like `eslint-plugin-sonarjs`?", 2026-08-06.

## Background: what we already have

The answer to the origin question is "mostly yes, via Biome":

- **`complexity/noExcessiveCognitiveComplexity` IS SonarSource's cognitive-complexity metric**,
  ported into Biome. It is **off by default in Biome** and we turn it on explicitly in
  `biome.jsonc` at `error` / max 15 — a deliberate decision, not an inherited default. Don't
  "clean it up" out of the config.
- `recommended: true` already enables the Biome analogues of sonarjs's bug-detection subset:
  `noSelfCompare`, `noDuplicateElseIf`, `noUselessCatch`, `noConstantCondition`,
  `noUselessTernary`, `noExtraBooleanCast`, `noDoubleEquals`, `noUselessSwitchCase`,
  `noUselessLoneBlockStatements`, `noUnusedVariables` (all verified with
  `./node_modules/.bin/biome explain <rule>` — note `npx biome explain` does NOT work, npx tries
  to install a package called `explain` and prints an empty "Summary" for every name, which looks
  like a valid answer and is not).
- Code duplication (sonarjs's `no-identical-functions` / `no-duplicate-string`) is covered
  separately by `jscpd` in `npm run quality`.

**Adding `eslint-plugin-sonarjs` was rejected**: it requires ESLint, i.e. a second linter beside
Biome with its own TS parser, config and CI pass. This repo deliberately runs one linter (ADR-0005
philosophy; Biome is one of the few sanctioned exceptions to "keep the toolchain plain"). Seven
rules with no Biome analogue (`no-all-duplicated-branches`, `no-element-overwrite`,
`no-ignored-return`, `no-identical-conditions`, `no-gratuitous-expressions`,
`no-one-iteration-loop`, `no-collection-size-mischeck`) is a real but small gap — not worth a
second toolchain.

## Config file trap: `biome.json` vs `biome.jsonc`

The config now lives in **`biome.jsonc`** (note the `c`), not `biome.json`. Biome parses
`biome.json` as **strict JSON**: the first `//` comment silently invalidates the whole file, and
Biome then falls back to its **built-in defaults** instead of erroring — no `files.includes`, no
`vcs` ignore-file, default formatter. On this repo that meant it crawled the 6 GB
`test/vscode-e2e/.vscode-test` tree and appeared to hang/panic on VS Code's own minified bundles,
which looked like a Biome bug and cost real debugging time before the cause (a swallowed parse
error, not a hang) was found. If both `biome.json` and `biome.jsonc` exist, `biome.json` **wins**
— so never recreate `biome.json`; a header comment in `biome.jsonc` itself documents this trap for
the next person who reaches for `//`.

Separately, a stale `tmp/baseline` git worktree (~1.2 GB) had its own nested `biome.json` that hit
the same trap and independently broke lint runs from that path. Removed with the user's approval;
not something to recreate.

## Diagnostic-cap lesson

Biome's default diagnostic display caps a report at **20** — bare `biome lint --only=<rule>`
undercounts silently past that. The original hit-count table below (produced during evaluation, on
a pre-existing checkout state) reported "20 hits" for `noEmptyBlockStatements`, which was actually
Biome's display cap, not the true count. **The real count, found via
`biome ci --max-diagnostics=500`, was 87** — evaluation and hit-count claims for any Biome rule
must always pass an explicit `--max-diagnostics` (or otherwise confirm the report wasn't
truncated) before being written down as a fact.

## Three off-by-default Biome rules were evaluated. One is being enabled.

Measured hit counts on the tree (`biome ci --max-diagnostics=500 --only=<rule>` where noted):

| rule | hits | verdict |
|---|---|---|
| `suspicious/noEmptyBlockStatements` | **87** (not the originally reported 20 — see the diagnostic-cap lesson above) | **ENABLE** |
| `complexity/useSimplifiedLogicExpression` | 15 | **REJECT** — see below |
| `complexity/noVoid` | 19 | **REJECT** — see below |

### ENABLE — `suspicious/noEmptyBlockStatements`

- [x] Enabled in `biome.jsonc` under `suspicious`.
- [x] **87 hits total, NOT confined to `media-src/e2e/`.** Roughly 36 were e2e harness/spec no-op
      stubs (legitimate callback handlers Vditor/Playwright require but the test doesn't need);
      the remaining ~51 (85 after excluding the 2 below) span `media-src/src/**` production code
      (guard-clause "no editor root yet → no-op disposer" patterns, best-effort `catch {}` cleanup,
      default stubs before wiring), colocated `*.test.ts` files, `test/backend/*.test.ts`, and
      `test/vscode-e2e/*.spec.ts` (mostly deliberate `.catch(() => {})` after a soft `waitFor`, so a
      timeout doesn't abort a diagnostic sweep before its own assertions report the real state).
      So the headline "87 hits" is not 87 defects — this rule fixed nothing currently broken; what
      it buys is that a *future* accidental empty block cannot land silently.
- [x] Made each one explicit rather than suppressing the rule: Biome treats a block containing a
      comment as non-empty, so `() => {}` becomes `() => { /* reason */ }` — **the comment must be
      INSIDE the braces**, a comment on the line above does not satisfy the rule (confirmed by
      testing against `biome check` directly — an easy mistake to make and re-check for). Used a
      specific one-liner wherever the reason was worth stating (e.g. "swallow: the harness tears
      down mid-flight"); generic `/* noop */`-style only where the reason genuinely is "intentionally
      nothing" (e.g. mock-API stand-ins in tests, `install*`-once guards).
      2 sites in `media-src/src/diagrams/plantuml/plantuml-render.ts` (lines ~1228, ~1389) were
      left to the concurrently-running task-502 agent, which owned that file for an unrelated
      duplication pass — out of this task's scope.

### REJECT — `complexity/useSimplifiedLogicExpression`

Every one of the 15 hits is a De Morgan rewrite of a **guard clause**, and the "simplified" form is
harder to read, not easier. The rule's own suggested fix at `media-src/src/bridge/edit-sync.ts:144`:

```ts
// today — a flat list of exit conditions
if (!editor || !node || !editor.contains(node)) return undefined
// what the rule wants — a nested negation plus a leftover disjunct
if (!(editor && node) || !editor.contains(node)) return undefined
```

It is worse still in `build.mjs`'s patch-anchor guards, where the conditions have 3-4 members
(`patchClipboardCollapsed`, `patchCutDeleteSync`, `patchMermaidErrorRender`, `patchMarkmapStatic`,
`patchLuteHook`). "Fewer operators" is not the same as "simpler" for an early-return guard.

- [x] Not enabled. Recorded the rejection **in `biome.jsonc` itself**, with the before/after
      example above — the point is that the next person who runs `biome explain` and sees an
      off-by-default complexity rule does not re-litigate it from scratch. A note only in this
      task file is not enough; task files are not what someone edits the linter config next to.

### REJECT — `complexity/noVoid`

All 19 hits are the deliberate fire-and-forget idiom: `void this.resolveNoopCheck(baseline)`,
`void vscode.commands.executeCommand(...)`, `void updateEditorContexts()`,
`void p.then(() => inFlight.delete(id))`. The `void` is there precisely to *mark* a deliberately
un-awaited promise — the opposite of the mistake the rule exists to catch. Enabling it would force
either `.catch(() => {})` at every site (a real change to error-handling semantics in host paths)
or 19 suppressions.

- [x] Not enabled. Recorded in `biome.jsonc` alongside the above, naming the idiom so it reads as
      a convention rather than an oversight.

## Verification

- [x] `npm run lint:ci` — the only remaining `noEmptyBlockStatements` diagnostics point at
      `media-src/src/diagrams/plantuml/plantuml-render.ts` (task-502's file, out of scope here);
      resolves to exit 0 once that concurrent task lands (or already does, if it finished first).
- [x] Deliberately probed the new rule: added a bare `() => {}` in `media-src/e2e/link-harness.ts`,
      confirmed `lint:ci` FAILED on it (`Unexpected empty block`, exit 1), then reverted. A rule
      never observed to fire is not verified (same lesson as task 498's `@knipignore` probe and
      task 500's DEAD probe).
- [x] `xvfb-run -a npm --prefix media-src run test:e2e` — the harness edits are all comment-only
      additions inside already-empty blocks; ran clean.
- [x] `npm test` — unaffected (comment-only changes); ran clean at the expected ~2754-test count.
- [x] `npm run quality` — run by the team lead after task 502's changes landed, on the joint tree:
      **PASS** lint:ci · **FAIL** knip (the 5 accepted devDependency false positives, task 498's
      documented end state) · **PASS** jscpd (727 clones) · **PASS** depcruise · **PASS**
      test:coverage · **PASS** check:coverage-modules (ratchet OK, 17 at 0% vs baseline 19).
      Before this run the team lead also closed the ownership gap this task and 502 left between
      them: the 2 `plantuml-render.ts` empty-`catch` sites (~1228, ~1389) that this task skipped
      as "502's file" and 502 skipped as "501's rule" — each got a swallow-reason comment
      (best-effort palette probing; serial renderQueue must not wedge on one block's failure).
      With those, `lint:ci` is 0-diagnostic across all 711 files with the new rule active.

## Out of scope

- The seven sonarjs rules with no Biome analogue — noted above, not pursued.
- Anything about `noExcessiveCognitiveComplexity`'s threshold (task 469 owns that).
- Code duplication — [task 502](502-production-duplication.md).
- The 2 `noEmptyBlockStatements` sites inside `plantuml-render.ts` — task 502's concurrent agent
  owned that file for the duration of this task.
