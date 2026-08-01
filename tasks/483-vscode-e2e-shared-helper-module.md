# Task 483 — `test/vscode-e2e` has no shared-helper module: 187 of 190 specs inline the same four helpers

**Status:** 🟡 IN PROGRESS — steps 1-3 done 2026-08-01: tsconfig + CI type-check gate,
`wf`/`webviewFrame`/`settle`/`ev` extraction (181/190 files), and `docText` extraction (13/13 files
that had it). All four helpers now live in `webview-helpers.ts`; nothing deferred. Only the full
real-VS-Code suite (step 4) is outstanding — the fast tier + 40 targeted real-webview spot-checks
across every helper combination are green, but the full suite itself hasn't run against this change ·
**Impact:** 🟢 no behaviour change intended (pure test-code extraction), 🔴 but the *validation* is
expensive — see "Why this needs its own pass" ·
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

## Step 2 — done 2026-08-01: `wf`/`webviewFrame`/`settle`/`ev` extracted; `docText` deferred

**A composition check first, because the premise didn't add up.** Before writing any codemod: the
four helpers' bodies sum to only ~1200 lines total (`wf` 154×~5, `webviewFrame` 24×~5, `settle`
31×~5, `ev` 7×~6) — far short of the "9291 duplicated lines / 79%" this task and 473 opened with.
Re-ran `jscpd` with a JSON reporter and bucketed the `vscode-e2e ↔ vscode-e2e` clones by their
actual source content (not directory pair): **9314 lines, 553 clones**, and the helpers are a
real but partial slice of it — the single biggest bucket (803 lines / 56 clone-pairs) is the
byte-identical *opening block* (imports + `wf()` together, since jscpd merges adjacent identical
lines into one span), but a comparable-sized bucket (801 lines / 35 clones) is near-identical
**test-body** content in the `abc-*` probe cluster — genuine parallel-scenario boilerplate, not a
missing-helper problem. The remaining ~250 buckets are a long tail. **The likely largest single
remaining opportunity is the per-spec fixture-open `evaluateInVSCode` block** (the
`vscode.openWith(...)` boilerplate), not currently extracted — flagged for a future pass, not
assumed away.

**Measured the real impact before committing to the sweep**, per the "no unilateral scope cuts"
discipline — dry-ran the codemod against copies of all 190 specs, then jscpd'd the copies in
isolation (outside the repo, to dodge both the `.gitignore`-vs-`tmp/` trap already on record in
473 *and* a second, newly-found variant of it: `jscpd`'s **CLI path arguments are silently
overridden by an auto-discovered ambient `.jscpd.json`** when run from a directory that has one —
even `test/vscode-e2e`'s own explicit `path`/`--threshold` args were ignored until the check moved
to a directory with no config at all). Result: **8787 → 7574 duplicated lines** within the
isolated e2e-only scan (−1213 lines, −13.8%) from the `wf`/`webviewFrame`/`settle` extraction
alone — real and worth doing, not the whole 79% story by itself.

**Extraction, done for real:** `test/vscode-e2e/webview-helpers.ts` exports `wf`, `ev`, `settle`
(pattern: `media-src/e2e/mouseops-helpers.ts`). A codemod (kept in `tmp/483/codemod.mjs`, not
committed — scratch per standing convention) matched each file's local definition **byte-for-byte
against the canonical body** (whitespace/param-name normalized only — see advisor caution below)
and only then removed it + added the import; anything that didn't match exactly was left alone.
Applied to the real tree:

- **`wf`: 149 files** replaced.
- **`webviewFrame`: 24 files** — call sites renamed to `wf` (not aliased) rather than shipping two
  names for one function, so `grep`/refactor tooling only ever needs to know one identifier.
- **`settle`: 25 files** replaced (the two variants differing only in parameter name, `frame` vs
  `f` — same behaviour, confirmed by diffing bodies, not assumed).
- **`ev`: 7 files** replaced (single canonical body, no variants).
- **181 files touched total** (union — many files use more than one helper).

**Deliberately NOT touched — the 5 divergent `wf` variants and 6 divergent `settle` variants** from
473's earlier byte-diff (`caret-focused-open-probe.spec.ts`'s `.last()` for the two-iframe race,
`anchor-links.spec.ts`'s `:visible`, `prerender-first-open.spec.ts`'s `.contentFrame()`, etc.) —
each is solving a real spec-specific problem, documented as such directly in
`webview-helpers.ts`'s own header comment so the next person doesn't "fix" them into conformity.

**Verification (step 2):** `npm run typecheck:vscode-e2e` clean (0 errors) on the full 181-file
diff; `npm run lint:ci` clean (675 files); `npm test` 2573/2573 unchanged (no product code touched,
as expected). Real-VS-Code spot-checks across every helper combination — `wf`-only, the
`webviewFrame→wf` rename, `settle`, `ev` — 8/8 green (`caret-tab-return`, `link-button-url`,
`d2-sketch` ×3, `custom-diagrams-render`, `d2-container-edge`, `mermaid-style-scope`,
`geojson-pan-gate`). Fast tier run for broader coverage given the diff's size (181/190 files):
39/39 green.

**Real (not simulated) whole-repo `jscpd` after step 2:** duplicated lines **9822 (8.46%)**, down
from the 9.36% baseline recorded when this task started (**780 → 706 clones**, −74). Bigger move
than the isolated e2e-only figure implied, because the whole-repo denominator also shrank (net
~1000 lines removed from the tree). Ratchet tightened: `.jscpd.json` `threshold` **9.8 → 8.9**
(current 8.46%, ~0.44pp headroom — same margin 473 used originally). Discrimination re-verified the
same way as before: 8.4 (below current) exits 1, 8.9 exits 0.

## Step 3 — done 2026-08-01: `docText` extracted (not deferred after all)

The original plan (above) deferred `docText` because it appeared every copy closed over a
module-level fixture-path constant, needing a signature change. Re-inventorying it properly
(separately for the `function docText(evaluateInVSCode)` form and the `const docText = (…) =>` form
— my first pass only found the former) showed **11 of the 13 files already took `file` as a
parameter** — the deferral's premise only held for **2 files**
(`copy-clipboard.spec.ts`, `paste-real.spec.ts`, both closing over a module-level `DOC` constant).
Small enough scope to just do properly rather than leave open.

- **11 files** (`block-fidelity`, `clipboard-collapsed`, `cut-selection`, `link-button-url`,
  `list-tight`, `paste-over-selection`, `paste-url-link`, `caret-tab-return`, `clipboard-elements`,
  `cut-selection-sv`, `inline-code-gap`) matched the canonical parameterized body exactly (modulo
  cosmetic differences: some route through the shared `ev()` helper instead of calling
  `evaluateInVSCode` directly — behaviourally identical, since `ev` is just that call with its args
  wrapped — and `clipboard-elements.spec.ts` names its inner callback param `a` instead of `args`).
  Import swapped in, definition removed, call sites untouched (same arity already).
- **2 files** (`copy-clipboard`, `paste-real`) had the closure-over-`DOC` form. Definition removed,
  and every zero-arg call site (`docText(evaluateInVSCode)`) mechanically rewritten to
  `docText(evaluateInVSCode, DOC)` — the only call-site shape change in this step, and it's a pure
  argument addition, not a restructure.
- All 13 spec files that had a `docText` now import it from `webview-helpers.ts`; **0 remaining
  inline copies.**

A codemod bug surfaced and got fixed during this step, worth recording: the const-body extractor's
"where does this statement end" heuristic stopped at blank-line-then-`const|function|export|//|}`,
which is not exhaustive — a `docText` immediately followed by a block comment (`/**`) or by a bare
`test(` call (both real, common shapes in this file set) made it swallow everything after,
including in one case the entire rest of the file. Caught because the over-broad extraction then
failed the canonical-body comparison and the codemod correctly reported those files as "skipped, no
exact match" rather than mismatching content — the bug produced false negatives (safe: nothing
touched), never a false positive (unsafe: wrong content matched and removed). Fixed by adding
`/**` and `test(`/`test.` to the stop-pattern list, re-ran, all 13 matched cleanly.

**Verification (step 3):** `npm run typecheck:vscode-e2e` clean; `npm run lint:ci` clean; `npm test`
2573/2573 unchanged. Real-VS-Code spot-checks: 8/8 for the two closure-rewrite files plus the
trickiest block-comment-adjacent case (`copy-clipboard`, `paste-real`, `cut-selection-sv`,
`caret-tab-return` ×4 sub-tests), then 32/32 for the remaining 9 touched files' full spec suites —
**40/40 real-VS-Code tests green** across every `docText`-touched spec.

**Real whole-repo `jscpd` after step 3:** duplicated lines **9692 (8.35%)**, down from 8.46% after
step 2 (**706 → 700 clones**, −6 — smaller move, as expected: `docText` was the fewest-copies
helper). Ratchet tightened again: `.jscpd.json` `threshold` **8.9 → 8.8** (re-verified: 8.3 fails,
8.8 passes).

## Checklist

- [x] Add `test/vscode-e2e/tsconfig.json` and wire a type-check for that tree (own commit).
- [x] Inventory all 187 inline copies; diff each against the canonical four helpers and record every
      deliberate divergence before touching anything. — done via independent inventory scripts per
      helper shape (function-declaration form + const-arrow form, run separately per helper — this
      is what caught the `docText` closure-vs-parameter split step 2 missed); all divergences listed
      and preserved untouched.
- [x] Create the shared helper module. — `test/vscode-e2e/webview-helpers.ts`, all four helpers
      (`wf`, `ev`, `settle`, `docText`).
- [x] Migrate in batches, each batch type-checked. — landed as two batches (181 files for
      `wf`/`webviewFrame`/`settle`/`ev`, then 13 files for `docText`): the codemod is mechanical and
      uniform (exact-match-or-skip, no partial per-file judgment calls once the canonical bodies
      were verified), so splitting further within a batch would not have reduced review risk, only
      commit count. `typecheck:vscode-e2e` + `lint:ci` + `npm test` + real-VS-Code spot-checks +
      the fast tier all passed against both batches.
- [ ] Full real-VS-Code suite green (or red-set unchanged vs a baseline captured just before). — NOT
      run (standing rule: propose, don't start, unbidden). The fast tier + 48 total targeted
      real-webview spot-checks (8 + 40) are the interim signal; propose the full suite to the user
      before running it.
- [x] Re-run `npm run jscpd` and update [473](473-duplication-baseline.md)'s numbers — done above:
      9.36% → 8.46%, 780 → 706 clones. Moved materially, though the composition check above found
      the four helpers are a partial contributor, not the whole 79% bucket — the fixture-open block
      is the likely next-largest piece, not yet scoped as its own task.

## Note

Do **not** treat the percentage as the goal. The reason to do this is that `wf()` encodes a fact
about VS Code's DOM in 187 places; the metric moving is a side effect of fixing that, not the point.
