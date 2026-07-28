# Task 176 — Coalesce the #app observer fleet behind one shared dispatcher (two-phase)

**Status:** TODO (medium, DE-PRIORITIZED — **the "instrument first" gate is now satisfied, answer is
"not yet worth the L rewrite"**, re-confirmed 2026-07-27). Land tasks 173/174's remaining scoping first
if ever revisited.
**Source:** vMark edit-responsiveness analysis (2026-06-28, workflow `wf_2c64003e-264`).

> **📊 Gate re-confirmed 2026-07-27** (re-ran the existing diagnostic,
> `test/vscode-e2e/perf-observer-fleet.spec.ts`, on the same heavy fixture, real VS Code headless): the
> **observer-selector subset is 12–14% of per-keystroke blocking** (prose 133.5ms/1068ms total = 12%;
> code-block 145.6ms/1056ms = 14%) — same order of magnitude as task 173's 2026-06-30 measurement (it
> reported ~9%, using a slightly different denominator), NOT the dominant cost either time. One
> important correction to this task's own problem statement: **`SPIN: 0 calls` now** — tasks 175/180
> (landed after this task was written) already suppress the per-keystroke `SpinVditorIRDOM` spin this
> task assumed "likely still dominates", so that specific justification is stale. The remaining
> ~86–88% of blocking is **not attributed** by this instrument (it only wraps `querySelectorAll` +
> the spin, by explicit design — see the spec's own header comment) — most plausibly browser
> layout/style-recalc/paint on a heavy fixture (3656 of 4837 DOM nodes are inside SVG diagrams), not
> evidence of an undiscovered bug. **Conclusion unchanged from 173's:** the observer fleet is a
> real but minority contributor; this task's own explicit prerequisite ("instrument first — confirm
> the observer fleet is worth an L refactor before committing") is now answered twice, independently,
> with the same verdict — stays de-prioritized as a big structural rewrite. If the unattributed ~86%
> is ever worth chasing, that is a **different, new** investigation (this instrument doesn't localize
> it), not a reason to escalate this task.
**Value / Risk:** 🟨 medium (removes N-fold dispatch redundancy; one ordering authority) / 🟡 medium-high (large refactor across the observer registry; must preserve the sync-vs-rAF split + disposers).
**Engines:** none (observer infrastructure).

> **📊 Count correction 2026-07-27** (Codex + Fable parallel perf audits, independent re-reads of
> current `finish-init.ts`): the fleet is **13 observers**, not "~10" — `tight-lists`
> (`list-tight.ts:92`), `diagram-zoom` (`diagram-zoom.ts:211`), `html-comment` ×2
> (`html-comment.ts:172,190` — doc + preview), `code-source` (`code-source.ts:51`),
> `wysiwyg-highlight` (`wysiwyg-code-highlight.ts:300`), `trailing`/`gap-paragraph`
> (`gap-paragraph.ts:255`), `smiles`, `custom-diagrams` (`custom-diagrams.ts:1128`), `abc`
> (`abc-fit.ts:57`), `callouts` ×2 (doc + preview), `mindmap`. Does not change the de-prioritization
> verdict above (still gated on the same "instrument first" measurement, still 12–14% not dominant) —
> recorded here so a future re-prioritization starts from the accurate count.

## Problem

`finish-init.ts:80-160` installs **~10 independent `MutationObserver`s** on `#app` via separate
`observers.set()` calls, each re-walking the document:
- **3 synchronous, before-paint** (no-flash): `code-source.ts:71`, `callouts.ts:394`,
  `html-comment.ts:96` (each ignores records, full `querySelectorAll`);
- **7 rAF-coalesced**, each with its own `MutationObserver` + rAF + full `querySelectorAll`:
  `smiles-render.ts:112`, `custom-diagrams.ts:873`, `diagram-zoom.ts:211`, `abc-fit.ts:55`,
  `echarts-retheme.ts:101`, `gap-paragraph.ts:214`, `wysiwyg-code-highlight.ts:289`.

So every keystroke fans out to ~10 observer callbacks, each doing its own full-document tree walk.

## Plan

One shared `MutationObserver` that batches records and runs **two phases**:
- **(a) a SYNC before-paint phase** for the no-flash trio (subtree-scoped per task 173);
- **(b) a single rAF phase** running the heavy fleet once with a shared scheduling budget.

This removes the N-fold dispatch redundancy, gives one ordering authority, and is the natural home for
task 174's ignore-decoration filter.

## Constraints
- **Preserve the sync-vs-rAF split:** the 3 no-flash decorators MUST stay synchronous before paint or
  the raw `[!TYPE]` marker / un-coloured source flash returns (`code-source.ts:14-16`,
  `callouts.ts:383-388`).
- **Ordering dependency:** `code-source` `.hljs` tagging must precede `wysiwyg-code-highlight`.
- Preserve each observer's **disposer semantics** in the `observers.set()` registry (task 152
  Disposables).
- Coalescing **cannot literally share one `querySelectorAll`** (observers query disjoint selectors) —
  the per-observer tree walks remain; only the `MutationObserver` **dispatch** + rAF **scheduling**
  consolidate.
- Pure main-thread DOM scheduling — does **not** touch `SpinVditorIRDOM`, so no Worker/GopherJS/CSP/
  round-trip/caret/cross-block-structure risk.

## Verification
- **Instrument FIRST:** `performance.now()` around the sync trio vs the spin vs the rAF group on a
  diagram-heavy doc — confirm the observer fleet is worth an L refactor before committing (the spin
  likely still dominates).
- **Real-VS-Code e2e (MANDATORY):** the full no-flash suite (callout / comment / code-source) green;
  ordering dep (code-source before highlight) preserved; every renderer observer still fires.
- `tsc` + `biome` + vitest + Playwright, headless. Verify coverage.

## See also
- **Sequencing:** land task 173 (scope sync observers) + task 174 (ignore decoration mutations) FIRST
  — they capture the cheap high-leverage wins; this full dispatcher rewrite is the structural
  consolidation on top. De-rated to medium: it leaves the dominant Lute spin untouched and the 7 rAF
  observers are already off the input→paint critical path.
- `finish-init.ts` (the registry), all observer files listed above; task 152 (Disposables), memory
  `callouts-observe-app-mount`.
