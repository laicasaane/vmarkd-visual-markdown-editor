# Task 403 — The coverage-module ratchet is RED (6 modules at 0%, 3 of them brand new)

**Status:** ✅ DONE (2026-07-27) · **Impact:** 🔴 high (the PR gate fails today) · **Origin:** Codex architecture review (2026-07-27), finding "test blind spots" — the concrete breakage was found by running the gate, not by the review

> Both groups resolved 2026-07-27. Group 1 folded into [task 399](399-split-main-ts-god-module.md)
> (`editor-session-state.test.ts`, `vditor-init.test.ts`, `message-router.test.ts`). Group 2 chose
> option (b) — real tests, not `EXCLUDED` — for all three: `d2-entry.test.ts` and
> `mermaid-elk-entry.test.ts` pin the bridge-object identity (a shim CAN break silently: a renamed
> export or dropped key is a runtime failure, not a compile error, since the consumer reads it as
> `any`); `elk-bundled-shim.test.ts` covers the real branching logic the task flagged as worth
> reading first (delegate-if-booted / boot-then-delegate / reject-if-unbootable). Also pruned SIX
> stale `BASELINE_ZERO` entries the ratchet itself flagged as already-covered (`editor-caret.ts`,
> `flowchart-retheme.ts`, `html-comment.ts`, `load-script.ts`, `outline.ts`, `plantuml-retheme.ts`
> — four already had their own dedicated `.test.ts` files predating this task and were simply never
> pruned; two were incidental real-import coverage). Final: `npm run test:coverage && npm run
> check:coverage-modules` → `Coverage ratchet OK — 30 source module(s) at 0% (baseline 30)` — zero
> drift between the live 0% set and the baseline.

## Problem

`scripts/check-coverage-modules.mjs` is a **CI gate** (`.github/workflows/ci.yml`, step
"Coverage module ratchet", right after `npm run test:coverage`). Task 190 introduced it
with the contract: *a new `media-src/src` or `src` module must ship with at least one
unit test — never silently at 0%*, and its baseline of 36 grandfathered modules must be
**pruned, never extended**.

Verified 2026-07-27 by actually running `npm run test:coverage && npm run
check:coverage-modules`:

```
Coverage ratchet FAILED — these source modules are at 0% coverage and are NOT in the baseline:
  media-src/src/d2-entry.ts
  media-src/src/editor-session-state.ts
  media-src/src/elk-bundled-shim.ts
  media-src/src/mermaid-elk-entry.ts
  media-src/src/message-router.ts
  media-src/src/vditor-init.ts
```

Two distinct groups:

1. **Three modules introduced by [task 399](399-split-main-ts-god-module.md)** (still
   untracked in the working tree): `vditor-init.ts` (446 lines), `message-router.ts`
   (366), `editor-session-state.ts` (47). Task 399's verification block lists unit /
   real-VS-Code fast tier / lint / typecheck / build as green — but **not** the coverage
   ratchet, so it reads DONE while its own output fails a PR gate. The split moved ~800
   lines of logic *out of* the coverage-excluded `main.ts` and into modules the ratchet
   does police — a good thing, but it means the extraction is only finished once those
   modules carry a test.
2. **Three pre-existing committed modules** that already fail: `d2-entry.ts` (added by
   `b0358d8`, task 165 D2 code-split), `elk-bundled-shim.ts` + `mermaid-elk-entry.ts`
   (added by `7d2689a`, task 112). These are lazy-bundle **entry points** — arguably the
   same category as the `EXCLUDED` set (`main.ts`, `preload.ts`, `types.ts`) rather than
   testable modules, but nobody made that call explicitly and the gate has been red for
   them since they landed.

## Scope

- [x] **Group 1 — cover the task-399 extractions.** DONE 2026-07-27. Added
      `editor-session-state.test.ts` (state shape/mutability), `message-router.test.ts`
      (routing dispatch + unhandled-command logging, mirroring task 151, plus
      `handleUpdate`'s echo-guard / init-failure-retry / external-update /
      streaming-suppression branches), `vditor-init.test.ts` (`renderCacheThemeKey`,
      `applyVditorTheme` — `initVditor` itself stays e2e-only, deliberately: it
      constructs a REAL `vditor/src/index` instance, and mocking that would test the
      mock, not the editor). None added to `BASELINE_ZERO`.
      **Gotcha hit + fixed:** `vditor-init.ts` imports Vditor's SOURCE entry
      (`'vditor/src/index'`), which drags in Vditor's whole source tree — including a
      `.less` asset vitest's CSS pipeline can't compile (no `less` preprocessor
      installed) and internal `.ts` files that reference `VDITOR_VERSION` (an
      esbuild-`define`-only global, undefined under vitest). Several of
      `vditor-init.ts`'s OTHER collaborators (`./stream-render`, `./toolbar`,
      `./finish-init`, `./link-click`, …) hit the same thing transitively. Fixed by
      `vi.mock`-ing every collaborator not needed by the two functions under test —
      `vi.mock` short-circuits resolution at that specifier, so none of THEIR
      transitive imports load either. Same technique `edit-sync.test.ts` already used
      for its own heavy collaborators, just applied more broadly here.
- [x] **Group 2 — decide the entry-point question explicitly.** DONE 2026-07-27, chose (b)
      for all three (write the tests, not `EXCLUDED`):
      `d2-entry.ts` pins its six-function window bridge by identity against mocked
      `d2-render.ts`/`d2-sketch.ts`/`elk-layout.ts` collaborators (which already have
      their own dedicated tests — this only covers the wiring, not re-testing them).
      `mermaid-elk-entry.ts` pins the vendored-layouts-array bridge the same way.
      `elk-bundled-shim.ts` — read first, per the task's own flag, and DOES have real
      logic (an already-booted-vs-boot-then-delegate-vs-reject branch) — got a full
      behavioural test (`vi.mock`-ing `./boot-elk`, asserting all three branches +
      the `window.__vmarkdCdn` passthrough).
- [x] Re-run `npm run test:coverage && npm run check:coverage-modules` and confirm the
      gate is green before closing — GREEN: `Coverage ratchet OK — 30 source module(s)
      at 0% (baseline 30)`.
- [x] Amend [task 399](399-split-main-ts-god-module.md)'s verification block: added the
      coverage ratchet as a gate + corrected the "all gates green" claim — done 2026-07-27
      alongside group 1.

## Follow-on (broader finding — do NOT scope-creep this task)

Codex's wider point stands and is worth its own pass later: the global coverage floors
(`statements: 56` etc. in `test/vitest.config.ts`) can stay green while individually
important modules sit at 0%; 36 modules are grandfathered; `main.ts` is excluded outright;
and Playwright/e2e coverage is not merged into the report, so modules "covered by e2e"
look identical to untested ones. Candidates named by the review for **deterministic
controller-level unit tests**: `finish-init.ts`, `diagram-retheme.ts`, `stream-render.ts`.
[Task 190](190-user-journey-test-coverage-plan.md) built this infrastructure and is
complete — it does not own ongoing baseline pruning, so a follow-up task should.

## Out of scope

- Raising the global coverage thresholds.
- Merging e2e coverage into the ratchet report (a real improvement, but its own project).
- Any behavioural change to the modules being tested.

## Verification

- [x] `npm run test:coverage && npm run check:coverage-modules` exits 0.
- [x] `BASELINE_ZERO` shrank (36 → 30; nothing added to `EXCLUDED`, so nothing to mirror
      there — group 2 went the "write a test" route, not the "exclude" route).
- [x] `npm test` (1773/1773) and `npm run lint:ci` (497 files, 0 warnings) and
      `npm run typecheck` all green.

## See also

- `scripts/check-coverage-modules.mjs`, `test/vitest.config.ts`, `.github/workflows/ci.yml`.
- Tasks [190](190-user-journey-test-coverage-plan.md) (built the ratchet),
  [399](399-split-main-ts-god-module.md) (introduced group 1),
  [165](165-code-split-d2-pipeline.md) + 112 (introduced group 2),
  [151](../151-typed-failloud-boundary.md) (the unhandled-command dispatch pattern to test).
