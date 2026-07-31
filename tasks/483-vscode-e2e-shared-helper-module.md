# Task 483 — `test/vscode-e2e` has no shared-helper module: 187 of 190 specs inline the same four helpers

**Status:** 📋 OPEN — measured, deliberately not started · **Impact:** 🟢 no behaviour change intended
(pure test-code extraction), 🔴 but the *validation* is expensive — see "Why this needs its own pass" ·
**Origin:** [473](473-duplication-baseline.md)'s clone triage, 2026-08-01 ·
**Related:** [480](480-preexisting-full-suite-failures.md) (the known-red specs that make attribution
hard), [449](449-e2e-probe-tier.md) (the tier structure these specs live in).

## What was measured

`jscpd`'s clone report, bucketed by directory pair, attributes **79 % of the entire repository's
duplication** to `test/vscode-e2e` duplicating itself: **9291 duplicated lines across 552 clones**.
Everything else in the tree combined is the remaining 21 %.

The cause is a single missing file. **187 of the 190 spec files** carry their own inline copy of the
same four helpers:

- `wf(workbox)` — the `iframe.webview` → `iframe[title="vMarkd"], #active-frame` frameLocator chain
- `ev(evaluateInVSCode, fn, arg)` — the single-arg `evaluateInVSCode` wrapper
- `settle(frame, ms)` — the `setTimeout` settle
- `docText(evaluateInVSCode, file)` — read the document text back out

**Zero** spec files import a shared module, because `test/vscode-e2e/` contains no non-spec module at
all besides `playwright.config.ts`.

## Why this is real duplication and not "test boilerplate that's fine"

[473](473-duplication-baseline.md) originally guessed this bucket would turn out to be intentional
per-spec boilerplate. It is not, and the sibling suite is the proof: **`media-src/e2e` factors its
shared code into 34 `*-harness.ts` modules plus `mouseops-helpers.ts`.** Same repository, same kind
of suite, opposite convention. One of the two is wrong, and it is not the one with the helpers.

The cost is not aesthetic. `wf()`'s selector encodes how VS Code nests the webview iframes — when
that nesting changed before, it had to be corrected in every copy, and a spec that kept a stale copy
would fail in a way that looks like a product bug.

## Why this needs its own pass — the constraint that split it out of 473

**`test/vscode-e2e` has no `tsconfig.json`.** Playwright transpiles the specs through esbuild at run
time, so `npm run typecheck` does not cover this tree and no `tsc` ever reads these files.

A 187-file mechanical extraction therefore has **no static verification net whatsoever**. Its only
validator is the full real-VS-Code suite:

- it costs **1–2 h** (one VS Code boot per `test()`, not per file — see AGENTS.md),
- it currently carries **known-red specs** ([480](480-preexisting-full-suite-failures.md), incl.
  `plantuml.spec.ts:22`),

so landing this sweep mixed with any other work makes the next suite run un-attributable. That is the
precise failure mode [473](473-duplication-baseline.md) exists to avoid, which is why it recorded the
finding and refused the sweep.

## Suggested approach

1. **Add the tsconfig first.** A `test/vscode-e2e/tsconfig.json` that type-checks the specs (wired
   into `npm run typecheck`, or its own script) turns this from an unverifiable sweep into a
   mechanical refactor with a real gate. It is worth doing even if the extraction never happens, and
   it should be its own commit so its own fallout is separable.
2. Create `test/vscode-e2e/webview-helpers.ts` exporting the four helpers, following
   `media-src/e2e/mouseops-helpers.ts` as the established pattern.
3. Migrate in **reviewable batches**, not one commit — and confirm the helper copies really are
   identical before replacing each one. Some specs may have drifted deliberately (a longer `settle`,
   a different frame selector for a specific surface); a drifted copy is a finding to preserve, not
   noise to normalise away. **Diff every copy against the canonical one and list the exceptions.**
4. Validate with a **clean full suite** — i.e. after [480](480-preexisting-full-suite-failures.md)'s
   residue is resolved, or at minimum with a known-red list captured immediately before, so any new
   red is attributable.

## Checklist

- [ ] Add `test/vscode-e2e/tsconfig.json` and wire a type-check for that tree (own commit).
- [ ] Inventory all 187 inline copies; diff each against the canonical four helpers and record every
      deliberate divergence before touching anything.
- [ ] Create the shared helper module.
- [ ] Migrate in batches, each batch type-checked.
- [ ] Full real-VS-Code suite green (or red-set unchanged vs a baseline captured just before).
- [ ] Re-run `npm run jscpd` and update [473](473-duplication-baseline.md)'s numbers — this is the
      change that should move the 9.42 % materially, and is the first real test of that ratchet.

## Note

Do **not** treat the percentage as the goal. The reason to do this is that `wf()` encodes a fact
about VS Code's DOM in 187 places; the metric moving is a side effect of fixing that, not the point.
