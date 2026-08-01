# Task 483 — `test/vscode-e2e` has no shared-helper module: 187 of 190 specs inline the same four helpers

**Status:** 🟡 IN PROGRESS — step 1 (tsconfig + CI type-check gate) done 2026-08-01; the helper
extraction itself (steps 2-4) not started · **Impact:** 🟢 no behaviour change intended
(pure test-code extraction), 🔴 but the *validation* is expensive — see "Why this needs its own pass" ·
**Origin:** [473](473-duplication-baseline.md)'s clone triage, 2026-08-01 ·
**Related:** [480](480-preexisting-full-suite-failures.md) (the known-red specs that make attribution
hard), [449](449-e2e-probe-tier.md) (the tier structure these specs live in).

## Step 1 — done 2026-08-01: `test/vscode-e2e/tsconfig.json` + a real type-check gate

Added `test/vscode-e2e/tsconfig.json` (mirrors `media-src/tsconfig.typecheck.json`'s shape: `strict:
false`, `noEmit`, DOM libs — **`DOM.Iterable` is required alongside `DOM`**, or every
`for...of`/spread over a `NodeListOf`/`HTMLCollection` fails with TS2488; caught this empirically,
not from memory), a `typecheck:vscode-e2e` npm script, and a CI step in `pr-webview-smoke.yml`
(after the harness `npm install`, before the expensive VS Code/Playwright download — cheap, so it
runs first). Not added to `nightly.yml`: the smoke-gate gate already covers every PR touching this
tree, so a nightly duplicate would just re-check an already-checked commit.

Running it cold against the untouched tree (before any fix) surfaced **18 real type errors across
10 files** — proof of the "no static verification net whatsoever" claim above, not a hypothetical:

- **9 files** (`caret-tab-return`, `clipboard-collapsed`, `clipboard-elements`, `link-button-url`,
  `list-backspace`, `list-editing-probe`, `list-typing-probe`, `local-link-open-probe`,
  `paste-url-link`) had the identical latent pattern: a 2-tuple passed into `.evaluate()` was cast
  `as unknown as string` at the call site (defeating Playwright's arg-type inference) and then cast
  back `as [string, string]` inside the callback. Runtime was correct (it really is passing a
  2-tuple) but the types lied in both directions. Fixed by changing the call-site cast to
  `as [string, string]` directly — the inner cast then type-checks for real instead of by
  coincidence. Zero runtime change (same array literal); spot-verified `caret-tab-return.spec.ts` +
  `link-button-url.spec.ts` in the real suite, 7/7 green.
- `d2-sketch.spec.ts` accessed `window.vditor.vditor.ir.element` with no cast at all (TS2339) —
  every other spec doing the same either casts via the established
  `window as unknown as { vditor?: {...} }` pattern or does it inside a raw template-string
  `page.evaluate(rawString)` that tsc never parses as code. Applied the same cast pattern. Spot-
  verified in the real suite, 3/3 green.
- `retheme-preview-surface.spec.ts` hand-wrote a narrower `evaluateInVSCode` parameter type
  (`(fn: (...args: never[]) => unknown, args?: unknown) => Promise<unknown>`) than the ~150 other
  specs use (`(fn: unknown, args?: unknown) => Promise<unknown>`), which doesn't structurally accept
  the fixture's real overloaded type (TS2345). Brought it in line with the dominant convention.
  Spot-verified in the real suite: 3 passed, 1 flaky (self-healed on retry #2 via the existing
  `retries: 2`) — the flake is d2's redraw poll occasionally exceeding its 60s window, unrelated to
  this type-only edit (the edit never touches that code path).

All fixes are provably behaviour-preserving by construction — every one is a type annotation or a
cast, none changes a runtime value — which is also why a full-suite re-run wasn't required to land
this step; the targeted real-VS-Code spot-checks above were the appropriate bar.

`npm run typecheck:vscode-e2e` is clean (0 errors) on the current tree.

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

- [x] Add `test/vscode-e2e/tsconfig.json` and wire a type-check for that tree (own commit).
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
