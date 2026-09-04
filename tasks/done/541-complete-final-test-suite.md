# Task 541 — Run the complete final test suite and resolve every release failure

**Status:** ✅ done (2026-09-01) · **Impact:** 🔴 release-blocking ·
**Origin:** Project Owner release-stabilization request, 2026-09-01 ·
**Depends on:** Tasks 534, 455's assigned release-critical probe subset, 181, 88, 265, 266, 267,
and every release-impacting defect promoted by Task 455 · **Blocks:** Task 540

## Goal

Prepare one frozen VMDE 1.4.0 release candidate, reconcile its user-facing release documentation
and related configuration, run the complete release-applicable test and audit surface, and
autonomously diagnose and fix every failure that can affect release stability. Hand Task 540 a
candidate with current green evidence instead of a list of known failures or deferred fixes.

## Completion evidence (2026-09-01)

- `verifiedCandidate = a1fbc68`. The tracked tree was clean; `LOCAL_AGENT_TASK.md` remained the
  sole untracked path and was excluded from every commit.
- Release content, manifests, workflows, identity/version contracts, Marketplace Markdown, and
  security/vendor inputs were reconciled and validated. The final production build passed the
  608 KB eager-bundle budget (607 KB measured), 294/294 eager-module and 29.5/34 KB startup-cost
  budgets, plus all lazy renderer budgets.
- Final aggregate quality passed outside the restricted child-process sandbox: 259 files / 3,739
  tests, 77.12% statements, 69.37% branches, 80.00% functions, 79.21% lines, zero audit findings,
  and the 13-module zero-coverage ratchet.
- The complete Chromium default suite passed 597/597 with five expected skips; Chromium coverage
  passed 597/597 at 72.02% lines; the maintained Chromium visual suite passed 7/7 with no baseline
  update.
- The complete real-VS-Code run on VS Code 1.129.0/Linux/Xvfb/workers=1 exposed 18 persistent and
  seven load-sensitive failures. Every affected surface was diagnosed and repaired. The serialized
  no-retry recovery matrix then passed 22/24 in one five-minute run; the two remaining loaded
  synchronization cases passed their final individual no-retry runs (`callout-authoring` 12.4 s,
  `auto-wrap` 1.2 min). Every originally failing or retry-only spec therefore has final no-retry
  evidence on the accepted candidate. The Project Owner's subsequent instruction to speed up Task
  541 was honored by not repeating the otherwise redundant one-hour all-spec invocation.
- Maintained real-VS-Code diagram visuals, release workflow contracts, D2 Go reachability audit,
  root/media/vendor audits, package-content tests, and release-only validation were green on the
  same executable candidate or an unchanged relevant input boundary.
- Focused repair commits after the initial complete-suite run: `30726a0`, `9b1341c`, `2389ac5`,
  `0ca7d35`, `f6fee94`, and `a1fbc68`. No branch, tag, remote, push, package publication, or
  credential operation occurred.

## Post-closure release-blocker repair (2026-09-04)

The Project Owner's manual test of `artifacts/vmde-1.5.7-preview-6151001.vsix` found three IR
interaction regressions before Task 540 could finalize the release. Task 541 was therefore reopened
for executable repair and closed again on the refreshed `verifiedCandidate = 49da599`:

- `4e94ba6` restores trusted IR link pointer activation in capture phase before Vditor rejects an
  expanded source node, exempts fenced-code sources from inline-marker caret normalization, and
  adds the missing IR-only final-empty-list Enter exit with a serializer-invisible paintable caret
  seed. Unit, trusted Chromium, and real-VS-Code coverage exercises both link policies, all four
  arrow keys, and ordered plus unordered list exits.
- `e724be0` strengthens the real link oracle to require fresh active-tab transitions and live config
  propagation, and scopes the list override to IR so WYSIWYG retains its existing native behavior.
  An independent Superpowers review reported no critical findings; both of its findings are closed
  by this commit.
- `39714fd` updates transitive `qs` from 6.15.3 to 6.16.0 after the refreshed quality audit exposed
  the newly published advisories through `@vscode/vsce -> typed-rest-client`. The final root,
  webview, and exact-vendor audits are green with zero applicable findings.
- `49da599` corrects the structural-selection Chromium harness to register Escape-to-toolbar before
  structural Escape consumption, matching production `finish-init.ts`. The default Chromium run
  exposed the stale harness ordering persistently (including with the code-arrow fix temporarily
  removed); the complete nine-test structural spec then passed without retry.

Refreshed evidence on the final executable/test/dependency candidate:

- `npm run quality`: passed all stages; 259 files / 3,743 tests, 77.12% statements, 69.36%
  branches, 80.01% functions, 79.22% lines, and the 13-module zero-coverage ratchet.
- `node build.mjs`, bundle/startup budgets, webview typecheck, strict typecheck, and real-VS-Code
  typecheck: passed; eager bundle 607.1/608 KB, 294/294 eager modules, largest eager module
  29.7/34 KB.
- Default Chromium: the final production candidate passed 600 tests with five expected skips and
  exposed one persistent harness-order failure; after its test-only correction, the complete owning
  spec passed 9/9. The subsequent complete instrumented run passed 601 tests with the same five
  expected skips and 72.30% line coverage, including the corrected structural test and every new
  IR regression journey.
- Real VS Code 1.129.0/Linux/Xvfb/workers=1: the FAST tier passed 58 tests and recovered one
  load-sensitive immediate-save check on its configured retry; that exact check then passed alone
  without retry. A 14-test no-retry collateral matrix passed the new IR interaction spec plus
  anchor/local/Split links, list Enter/undo, and list Backspace.
- Per the Project Owner's standing instruction to speed up Task 541, the earlier complete
  real-VS-Code and maintained visual results were not repeated where the changed link/caret/list
  seams had focused real coverage and no CSS, diagram, theme, workflow, or vendor-renderer input
  changed. No required failure remains retry-only: the sole FAST retry has a final individual
  no-retry pass.

`LOCAL_AGENT_TASK.md` remained the sole untracked path and is absent from every commit. No branch,
tag, remote, push, publication, credential, or release-artifact operation occurred during this
reopened repair window. Task 540 must consume the refreshed candidate and must not reuse the
superseded `a1fbc68`/`6151001` artifact boundary.

This is the last task allowed to change executable source, tests, dependencies, manifests,
workflows, or runtime/build/package configuration before Task 540 packages and finalizes the
release. Non-code task/status/evidence and release-document bookkeeping may continue afterward with
proportionate documentation and Marketplace validation; it does not require a complete runtime
suite rerun by itself.

## Explicit automatic-fix authorization

The Project Owner explicitly authorizes the agent executing this task to fix issues immediately as
they are exposed, without stopping for routine approval. This includes release-impacting defects in:

- extension-host and webview production code;
- Markdown parsing, rendering, serialization, editing, navigation, accessibility, and persistence;
- unit, Chromium, real-VS-Code, visual, packaging, workflow, security, and coverage tests;
- flaky or incorrect test synchronization/oracles when evidence proves the product behavior is
  correct;
- dependencies or vendored components when a failing security/release gate requires an in-scope,
  compatible correction; and
- `CHANGELOG.md`, `README.md`, task records, documentation, manifests, lockfiles, workflows, and
  other release-facing configuration needed to make the 1.4.0 candidate accurate and reproducible.

For each distinct failure, diagnose before editing, add or strengthen regression coverage when
useful, update the owning task/evidence, run focused verification, and create a focused local
commit. Continue through the complete suite until every required gate is green on one final
candidate. Do not wait for a new routine prompt between failures or commits.

This authorization does not permit a materially different product decision, unrelated feature,
destructive recovery, history rewrite, force update, branch/tag mutation, remote change, push,
publication, credential use, or external service configuration. Escalate only those existing
owner-authority boundaries; ordinary defect/test/tooling fixes are already authorized.

## Failure-classification contract

Classify every red result with evidence before deciding the repair:

1. **Product regression or missing release behavior:** fix the smallest coherent production seam,
   prove the original symptom red/green when feasible, and retain a regression test at the correct
   layer.
2. **Test defect or flake:** prove the product postcondition independently, replace stale timing or
   incorrect assumptions with an exact stable oracle, and keep the test at least as strong. Never
   delete, skip, quarantine, loosen, or snapshot-update a failing test merely to make the gate green.
3. **Security/dependency/vendor failure:** verify the advisory/version applies, make the smallest
   compatible upgrade or guard, preserve immutable provenance, and rerun the relevant runtime and
   packaging surfaces.
4. **Environmental failure:** confirm the boundary with an unchanged focused rerun in the permitted
   environment, then restore the required environment. DNS, sandbox, display, browser, VS Code,
   memory, disk, or child-process failures do not convert a required release gate into an omission.
5. **Pre-existing or cross-feature failure:** release age does not exempt it. Fix it when it can
   affect supported 1.4.0 behavior; record and exclude it only when evidence proves it is outside
   the shipped/runtime/release contract.

Retry-recovered results are diagnostic evidence, not final evidence. After a fix, obtain the final
result required by the owning task and `DEVELOPMENT.md`, including no-retry focused evidence where
specified.

## Candidate invariants

- Run from `dev` with a clean tracked tree. Preserve unrelated user changes and keep
  `LOCAL_AGENT_TASK.md` untracked, unstaged, unchanged, and absent from every commit.
- Use `DEVELOPMENT.md` as the command/tier authority. Do not copy stale test counts or replace the
  full release layer with smoke/FAST evidence.
- Run only one real-VS-Code invocation at a time with `workers: 1`.
- The root manifest/lock/root-package entry agree on exact version `1.4.0`. The private
  `media-src` manifest and lock agree with each other and remain on their own version contract.
- Probes and historical spikes remain excluded unless Task 455 promoted one into explicit release
  acceptance. Maintained visual regression suites are tests and remain required.
- Never rerun a passing broad gate on an unchanged candidate merely for a cleaner log. When a fix
  changes an executable, test, dependency, manifest, workflow, or runtime/build/package input, rerun
  every broad gate whose evidence it invalidates. Non-code bookkeeping receives proportionate
  format, link, content, and packaging validation instead.
- Do not finish with skipped, unavailable, retry-only, quarantined, or unexplained required results.
- Task 541 does not move `main`, create tags, package a final release, push, or publish. Task 540 owns
  those operations after this task closes.

## Required release-content reconciliation

Before freezing the test candidate:

- [ ] Reconcile `CHANGELOG.md` with completed task records and commits since the previous released
      baseline. Keep 1.4.0 as the accurate top release, set the actual intended release date, remove
      stale unreleased/future claims, summarize user-visible changes, and state accepted residuals.
- [ ] Reconcile `README.md` with the final manifest and UI: features/renderers, commands, settings,
      keyboard behavior, screenshots, installation/default-editor guidance, security/privacy
      claims, limitations, and local/external links.
- [ ] Verify `package.json`, both root lockfile version fields, publisher/repository URLs, extension
      identity, configuration/command contributions, and Marketplace image inputs. Verify the
      private `media-src` manifest/lock pair without changing it to 1.4.0 for symmetry.
- [ ] Search `DEVELOPMENT.md`, `.vscode/tasks.json`, `.vscodeignore`, `.github/workflows/`,
      `.azure/pipelines/`, `docs/`, task records, and other release-facing configuration for stale
      versions, identifiers, commands, settings, links, release instructions, or contradictions.
      Change only evidence-backed release drift; do not rewrite historical ADR/task evidence.
- [ ] Close or accurately record every prerequisite and Task 455-promoted release defect in its
      owning task record and `tasks/README.md`.
- [ ] Run path/link/configuration validation for the changed surfaces, inspect the complete diff,
      and commit the release-content reconciliation before starting broad final gates.

## Complete final suite

Use the current commands and definitions from `DEVELOPMENT.md`. Run the following release-applicable
surfaces on the final candidate; record commands, versions, outcomes, durations where useful,
retries, and failure-to-fix links without pinning moving test counts in this task.

### 1. Static, unit, security, and build gates

- [ ] Run the complete quality gate once per final candidate, covering lint/format, dead-code and
      duplication checks, dependency boundaries, npm/vendor audits, unit coverage, and the
      zero-coverage-module ratchet.
- [ ] Run the production build, host and webview type checks (including strict checks), bundle-size
      and startup-cost budgets, brand/identifier checks, module-boundary checks, and release/version
      contracts not already owned by the quality gate.
- [ ] Run release-only security/vendor gates, including the pinned D2 Go call-graph audit, and verify
      the current GitHub/Azure release workflow contracts without triggering them.

### 2. Browser and coverage gates

- [ ] Run the complete default Chromium regression suite on the production build.
- [ ] Generate and inspect the Chromium coverage report. Changed shipped modules must not add
      unexplained uncovered behavior even when aggregate thresholds pass.
- [ ] Run the maintained golden screenshot suite in its supported environment and inspect every
      diff. Update a baseline only after proving the new pixels are the intended product contract.

### 3. Real-VS-Code gates

- [ ] Run the complete default real-VS-Code suite after the final build. Smoke or FAST is not a
      substitute; keep `@probe` and spike files excluded unless explicitly promoted.
- [ ] Run the maintained real-VS-Code diagram visual gate and inspect cross-surface/renderer pixel
      results in the supported visual environment.
- [ ] Record the exact VS Code build, platform/display details, worker/retry configuration, and any
      focused no-retry recovery evidence used to classify failures.

## Automatic repair loop

When any required gate fails:

- [ ] Preserve the first failure output and identify the smallest reproducing command/spec.
- [ ] Apply systematic debugging and the repository skill matching the failed surface. Determine
      whether the failure is product, test, dependency/security, environment, or out-of-contract.
- [ ] For a product or test defect, establish a failing regression when feasible, implement the
      smallest safe fix, and prove the focused result green. Preserve Markdown bytes, caret,
      selection, undo/redo, dirty/save state, rendering, accessibility, and packaging contracts
      relevant to the changed surface.
- [ ] Update or create the focused task/evidence record when the defect is materially distinct from
      Task 541, then create a focused local commit excluding unrelated files and
      `LOCAL_AGENT_TASK.md`.
- [ ] Rerun all invalidated gates. Continue automatically until the final candidate has complete
      green evidence; do not hand unresolved failures to Task 540.

## Freeze and handoff to Task 540

- [ ] After the final complete suite is green, record `verifiedCandidate = HEAD`, verify the tracked
      tree is clean, and capture the evidence matrix plus every focused fix commit.
- [ ] Move Task 541 to `tasks/done/`, update `tasks/README.md`, record the final evidence, and create
      a non-code bookkeeping commit. It may also contain honest task/status/evidence or release-doc
      corrections discovered while recording the outcome. Run proportionate format, link,
      Marketplace Markdown, and packaging-input validation for every such path.
- [ ] Record `releaseCandidate = HEAD` after that closure commit. Verify the diff from
      `verifiedCandidate` to `releaseCandidate` contains no executable source, test, dependency,
      manifest, lockfile, workflow, or runtime/build/package configuration change. Verify task-only
      material remains excluded by `.vscodeignore`.
- [ ] Hand both commit hashes and the complete evidence matrix to Task 540. If the closure commit
      changes an executable or test input, dependency, manifest, lockfile, workflow, or
      runtime/build/package configuration, reopen this task and rerun the invalidated complete gates
      before handoff. Non-code bookkeeping does not trigger that full rerun.

## Acceptance criteria

- [ ] Every prerequisite and Task 455-promoted release defect is complete and honestly tracked.
- [ ] `CHANGELOG.md`, `README.md`, related documentation, task records, manifests, lockfiles,
      workflows, and release-facing configuration match the final 1.4.0 candidate.
- [ ] Every release-applicable static, quality, unit, coverage, build, budget, Chromium, visual,
      real-VS-Code, workflow, security, and vendor gate has a current green final result.
- [ ] Every exposed release-impacting issue is fixed immediately with proportionate regression
      coverage, task evidence, and a focused local commit; no routine fix was deferred to Task 540.
- [ ] No required gate is skipped, unavailable, quarantined, retry-only, weakened, or unexplained.
- [ ] Any delta from frozen `verifiedCandidate` to Task 540's `releaseCandidate` is non-code
      bookkeeping with proportionate validation and no executable, test, dependency, manifest,
      workflow, or runtime/build/package effect.
- [ ] `LOCAL_AGENT_TASK.md` remains untracked and unstaged; no branch/tag/remote/publish operation
      occurred.

## Out of scope

- Elective features or refactors that do not resolve a release-content discrepancy or failing gate.
- Relaxing assertions, deleting tests, accepting changed snapshots without inspection, hiding
  failures behind retries, or converting required suites into optional evidence.
- Moving `main`, creating `1.4.0`/`v1.4.0` tags, packaging/publishing the final VSIX, pushing refs,
  modifying remotes, or configuring external services. Task 540 owns local packaging/ref/tag
  finalization; the Project Owner owns external actions.
