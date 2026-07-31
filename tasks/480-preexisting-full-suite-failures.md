# Task 480 — The full real-VS-Code suite has ~11 PRE-EXISTING failures

**Status:** 🔴 OPEN — measured and attributed 2026-07-31 · **Impact:** 🔴 high on process, unknown on
users — the nightly/tag gate is red, so it cannot signal anything, and nobody currently knows which
of these represent real user-facing breakage · **Origin:** the first full-suite run in a long while

## The finding, and how it was attributed

The full suite (`npm run test:vscode`, 247 tests) came back with 11 failures. The obvious suspicion
was the day's work — ~250-file module decomposition (460), CSS source-patch conversions (464), 85
unexports (469), a keyboard dispatcher (457/459), writeback serialization (477).

**It is none of those.** Measured by building a `git worktree` at `443576b` — the last commit of
2026-07-30, before any of that landed — and running the same specs there:

| spec | HEAD | baseline `443576b` (verified build) |
|---|---|---|
| `bottom-gap` | ✘ 3/3 | **✘ 3/3** |
| `flip-skip` | ✘ 3/3 | **✘ 3/3** |
| `abc-flip-cache-hit` | ✘ 3/3 | **✘ 3/3** |
| `diagram-cache-mermaid` | ✘ 3/3 | **✘ 3/3** |
| `plantuml` | ✘ 3/3 | **✘ 3/3** |
| `plantuml-cache` | ✘ 3/3 | **✘ 3/3** |
| `plantuml-phase-timing` | ✘ 3/3 | **✘ 3/3** (its other test passes on both) |
| `parity` | ✘ 3/3 | **✘ 3/3** |
| `wysiwyg-parity:197` (callouts same height) | ✘ | **✘** — and `:163` / `:181` PASS on both |

The seven verified rows were measured **twice independently** — two separate baseline runs, agreeing
exactly on the three `plantuml*` specs. Not one lucky run.

Identical. These are **pre-existing**, not regressions.

**Provenance of these numbers, because the first attempt was unsound.** The initial baseline run
used a symlinked `media-src/node_modules`, which made the baseline build FAIL silently — its result
was reported before that was noticed, and had to be retracted. The four rows marked *verified build*
above were re-measured on a baseline that built with exit 0 and produced its own
`media/dist/main.js` (426 KB, distinct from HEAD's 443 KB, confirming it really is the older code).
`parity` has only the first, unsound measurement so far and must be re-run. See the reproduction
box below for the trap.

## The failing set (baseline run, 2026-07-31 against `443576b`)

- `bottom-gap.spec.ts:28` — the document ends with a gap in BOTH IR and Preview
- `d2-feature-parity.spec.ts:18` — D2 feature parity renders in the real webview
- `flip-skip.spec.ts:24` — mermaid + echarts SKIP re-render on a mode-independent flip (task 164)
- `font-parity.spec.ts:103` — vscode-dark-2026 **and** vscode-light-2026 prose typography vs VS Code's preview
- `mode-switch-parity.spec.ts:104 / :170 (×2) / :303` — anchor pairing, scroll anchoring, cumulative creep
- `parity.spec.ts:56` — IR (collapsed) renders at the same size/spacing as Preview
- `wysiwyg-parity.spec.ts:163 / :181 / :197` — byte-identical diagrams across panes, render reuse, callout height

On HEAD the same run additionally showed `plantuml.spec.ts`, `plantuml-cache.spec.ts`,
`plantuml-phase-timing.spec.ts`, `diagram-cache-mermaid.spec.ts` and `abc-flip-cache-hit.spec.ts`
failing; those were **not** re-run against the baseline yet, so their attribution is still open —
do that before assuming they are also pre-existing.

## What this means, stated plainly

The nightly/tag gate is red and has been for some unknown length of time. A permanently-red gate
is worse than no gate: it cannot signal a new regression, and it trains everyone to ignore it. The
day's work happened to be verified by targeted spec runs instead, which is why nothing was noticed
sooner.

Note the shape of the set: it is almost entirely **geometry parity** (IR vs WYSIWYG vs Preview
spacing/anchoring/height) and **render-reuse/cache** assertions. That clustering suggests a small
number of shared causes rather than 11 independent bugs, and it is the first thing to test.

## Geometry-parity cluster — findings (2026-07-31, agent diagnosing `bottom-gap`/`parity`/`wysiwyg-parity`)

### `bottom-gap.spec.ts:28` — STALE ASSERTION, confirmed, not a bug

Measured in the real webview (`all-renderers.md`, default `theme.content: 'auto'`):

```
irGap = 14   (expected > 18)
lastDataType = "html-block"   (the raw `<div style="padding:8px…">` demo block at the
                                very end of the fixture)
lastMarginBottom = "14px"     (computed on the IR node)
```

`14px` is exactly `1em` at the webview's real font-size (**14px**, VS Code's own editor
font — confirmed via `main.css:332` "still computes 14px"). The 14px comes from Vditor's own
`_ir.less`: `&[data-type="html-block"] { margin-bottom: 1em; }` (`media-src/node_modules/vditor/src/assets/less/_ir.less:32`) —
untouched by us, and `.vditor-preview .vditor-reset > :last-child { margin-bottom: 1em !important; }`
(`main.css:431`, added by 3a1d479) forces the SAME `1em` on the Preview side. So IR and Preview
almost certainly still **agree** with each other (both `1em` of the same 14px root) — the
`Math.abs(irGap-pvGap)<=6` parity check is not where this fails; only the absolute `>18` floor is.

**Why `>18` no longer holds, with dated evidence:**
- `bottom-gap.spec.ts` was authored in commit `3a1d479` (2026-06-13 12:04), with the CSS comment
  explicitly assuming `1em ≈ 16px` ("`github 16px = the measured IR gap`").
- Commit `61ea4be` (2026-06-13 21:46, **same day, ~10h later**) retargeted the `auto`/`vscode-*-2026`
  content themes to match VS Code's OWN markdown-preview metrics pixel-for-pixel — which uses VS
  Code's real editor font-size (14px), not a generic 16px root. That is a deliberate, documented
  fidelity change (see `vscode-2026-default-themes` memory / that commit's message), not a bug.
- Separately, the fixture's tail changed too: at authorship time the last block was a plain
  blockquote (see `git show ea4386a^:test/vscode-e2e/fixtures/all-renderers.md | tail`); commit
  `ea4386a` (2026-06-16, "show HTML comments as muted text") appended the HTML-comment demo +
  raw-HTML-block section, making a bare `html-block` (1em margin only, no blockquote box/padding)
  the new last block. Neither change touched `bottom-gap.spec.ts`'s `18` threshold.

Net: two independent, deliberate, dated changes (theme metric retarget + fixture content) each
shrank what this spec measures, and the threshold was never recalibrated after either.

**Confirmed:** re-measured `pvGap` cleanly (`isLastChild: true`, the Preview `:last-child` `1em`
rule IS applying) → `pvGap = 14`, `fontSize: 14px`. `irGap === pvGap === 14` exactly — IR and
Preview fully agree; only the absolute `>18` floor is wrong, not the parity check
(`Math.abs(irGap-pvGap)<=6`, which passes at Δ0). **Verdict: STALE ASSERTION, confirmed, not a
bug.**

**FIXED (spec-only).** `test/vscode-e2e/bottom-gap.spec.ts`: lowered the floor `18`→`10` on both
`irGap`/`pvGap` (still well above the ~10px "glued" bug this spec exists to catch — the comment now
spells out the `1em @ 14px = 14` arithmetic so the next font-metric drift is traceable instead of
mysterious), and replaced the `≤6px` fuzzy-parity check with an exact `expect(pvGap).toBe(irGap)` —
both panes derive the gap from the literal same `1em` rule, so on one document they must match
exactly, not just both clear a floor. `main.css` untouched. Verified:
`✓ bottom-gap.spec.ts:28 (10.2s)`. Diagnostic spec used (`test/vscode-e2e/zz-diag-bottomgap.spec.ts`)
was temporary and has been deleted — the measured numbers above are the surviving record.

### THE SHARED CAUSE for `parity`/`wysiwyg-parity:197` (and structurally related to `bottom-gap`):
### ADR-0003 + task 110 deliberately decoupled Edit-surface (IR/WYSIWYG) rhythm from Preview rhythm

`docs/adr/0003-css-theming-architecture.md` (2026-06-13, **ancestor of the `443576b` baseline**):
"Decision taken alongside this ADR: **we drop Edit↔Preview spacing parity** — IR/WYSIWYG may have
roomier block spacing than the preview/render." Task 110 (commit `99b889c`, 2026-07-30 23:41,
**also an ancestor of the baseline**) implemented the Preview half of that: it gave `.vditor-preview
.vditor-reset` its own `line-height: 1.571` (22px @ 14px font, matching VS Code's real
`markdown.css`) instead of inheriting Vditor's `1.5` (21px) that IR/WYSIWYG still use
(`_reset.less:19`, untouched). That single, deliberate, dated change explains most of what's left in
this cluster:

- **`wysiwyg-parity.spec.ts:197` (callouts same height) — STALE ASSERTION.** Measured: IR = WYSIWYG
  = 58px on all 6 callouts, Preview = 60px on all 6, uniformly (not one outlier — every callout, same
  +2px). 2px = 2 text lines (title + one body line) × 1px/line (22-21=1px per line at 14px font) —
  exactly what task 110's intentional `1.571` vs `1.5` split predicts, applied to ordinary blockquote
  text (callouts get no code-style carve-out — see next item). The spec's `toEqual` (exact match)
  pins the OLD "edit == preview" contract ADR-0003 explicitly retired; `:163` (byte-identical diagram
  markup) and `:181` (WYSIWYG reuses the render) are a different concern (markup identity, not
  spacing) and PASS on both trees, consistent with this explanation.

  **FIXED (spec-only).** Kept the IR↔WYSIWYG comparison **exact** (unchanged — it's the original
  task-366 4px-title-margin regression guard, and both surfaces are "edit surface," never touched by
  ADR-0003, and still measure 58≡58). Replaced the WYSIWYG↔Preview exact-match with a bounded-delta
  check derived from the documented mechanism itself (`(1.571-1.5)*14 ≈ 1px` per text line, capped at
  4 lines for this fixture's callouts, +1px rounding ⇒ tolerance ⌈4px⌉+1), so a callout that grows
  taller than that (e.g. the pre-366 bug reappearing, or a stray extra line) still fails red.
  `main.css` untouched. Verified: `✓ wysiwyg-parity.spec.ts:197 (59.9s)`.

- **`parity.spec.ts:56` (code-block "taller" guard) — REAL BUG, not stale.** Measured (`taller[]`
  from the actual failure): `{i:5 js, ir:95, pv:80}` (Δ15, 5 lines), `{i:6 python, ir:113, pv:94}`
  (Δ19, 6 lines), `{i:96 d2, ir:101, pv:92}` (Δ9). Diagnostic dump
  (`test/vscode-e2e/zz-diag-codeblock.spec.ts`, temporary, since deleted) of the same js/python
  blocks' computed `line-height`: IR `pre`/`code` = `21px`/`17.85px` (the resolved value of the
  inherited `1.5`, at the code font's 85%-sized 11.9px); Preview `pre`/`code` = the literal string
  `"normal"` (≈14.05px, per-font — NOT `1.5`). The arithmetic closes exactly: 4 js lines × (17.85-14.05)
  ≈ 15.2 ≈ measured Δ15; 5 python lines × 3.8 ≈ 19 ≈ measured Δ19. The rule setting `normal`,
  `main.css:1654` (`.vditor-preview .vditor-reset :is(pre, pre code, code) { line-height: normal; }`,
  same task-110 commit `99b889c`), has an explicit comment stating the INTENT: *"Code keeps Vditor's
  own line-height"* — i.e. code was meant to be the one exception carved OUT of the 1.571
  preview-rhythm change, staying parity with IR. `normal` ≠ `1.5`, so the rule doesn't do what its own
  comment says — a real implementation slip in task 110, not scope creep in the test.

  **FIXED (product CSS).** `main.css:1654`: `normal` → `1.5` (the exact value `.vditor-reset` itself
  uses, so it recomputes correctly per-descendant's own font-size — confirmed a bare `delete the rule`
  alternative would be WRONG: without it, code would inherit the *Preview-only* `1.571` from the rule
  above (line 1630), landing a new, smaller mismatch that still passes the spec's 8px guard while
  being wrong). Also **narrowed the selector** `:is(pre, pre code, code)` → `:is(pre, pre code)`,
  dropping bare `code` (inline `` `code` `` spans in running prose): those must keep the paragraph's
  own `1.571` line-height so an inline code span doesn't open a mismatched line box mid-sentence; only
  the isolated code-block panel needs to match IR's box model. This predates 2026-07-31 (`99b889c` is
  an ancestor of the `443576b` baseline), so it's legitimately in-scope for "pre-existing," but it was
  a genuine, fixable CSS bug — not ADR-0003 drift, since ADR-0003/task 110 never intended code to
  diverge. Verified: `✓ parity.spec.ts:56 (25.1s)`, previously-throw-blocked `mathGap`/`callouts`/
  `inlineMarkers` assertions now execute and pass too (whole test green, not just the first assert).
  **Checked for fallout** (advisor flag: shrinking every Preview code block moves Preview *document
  height*, which is exactly what `mode-switch-parity.spec.ts` measures) — re-ran it in full:
  `✓ :104 pairing`, `✓ :171 (×2, drift=0px both at 50%/75%)`, `✓ :306 no cumulative creep` — all 4
  green, no regression. (These were already independently established as false-failures of the first,
  broken-build baseline run — see "Two corrections" below — so this is a clean confirmation, not a
  surprise fix.)

- **`bottom-gap.spec.ts`** doesn't hinge on the 1.571/1.5 split (the last block is a raw `html-block`,
  not text, and Preview's forced `1em` last-child rule is a `margin`, not `line-height`) — its cause
  (above) is independent: a stale `16px`-per-em assumption + fixture drift. But it's the same FAMILY
  of issue in spirit: a spec pinning exact edit/preview geometry equality in an architecture that no
  longer guarantees it as tightly.

## Cache / render-reuse cluster — findings (2026-07-31, agent diagnosing `abc-flip-cache-hit`,
`diagram-cache-mermaid`, `plantuml-cache`, `flip-skip`)

**Two causes, not one — but the three cache specs (not `flip-skip`) DO share a single cause.**
`flip-skip` is unrelated to the disk/host render cache (`DiagramCache` / `render-cache-client.ts`)
entirely — see below, spec-only fix. `abc-flip-cache-hit`, `diagram-cache-mermaid` (its abc case),
and `plantuml-cache` all trace to ONE bug in `nativeSourceForLive` — see below, product fix.

### `abc-flip-cache-hit.spec.ts:25`, `diagram-cache-mermaid.spec.ts:98` (abc), `plantuml-cache.spec.ts:100` — REAL BUG, FIXED (product change)

**Shared cause, confirmed by instrumentation, not assumed.** `nativeSourceForLive`
(`media-src/src/diagram-kit/diagram-surfaces.ts:92`) is the single function both the render cache's
RESERVE/GET path (`reserveAndRequest`) and its PUT path (`reportRenders`) use to compute the hash key
for a native diagram (mermaid/abc/flowchart/plantuml). It has two branches: prefer the `data-code`
attribute if the block already carries one (stamped by the engine after it rendered), else fall back
to the sibling editable marker's `textContent`. The bug: abc's, plantuml's and echarts's *patched*
renderers (`esbuild-shared.mjs`'s `patchAbcRender`, the plantuml equivalent, `patchEchartsDataCode`)
stamp `data-code` with the **trimmed** source (`text.trim()`), but the marker-textContent fallback —
what every read uses BEFORE a block has ever rendered, i.e. every RESERVE and every cold-open GET —
returns the **untrimmed** text (fenced code blocks carry a trailing newline in their editable
marker). So a block's first hash (open, no stamp yet) and its post-render hash (`data-code` now set,
trimmed) are computed from two different strings whenever the source has any leading/trailing
whitespace — which a fenced block's content always does (the trailing `\n` before the closing
fence). Confirmed directly: temporary instrumentation logging RESERVE vs PUT source+hash for the
SAME diagram showed e.g. abc's `source="...GABc|\n"` → hash `67f7ec092cfb9046` at RESERVE, vs
`source="...GABc|"` (no `\n`) → hash `804a4d79774af268` at PUT — genuinely different hashes for the
identical diagram. The host cache's GET therefore always asks for the RESERVE-time (untrimmed) hash,
which the PUT never filed anything under, so it's a **permanent miss on every reopen** — the fresh
render that follows is deterministic (abcjs/PlantUML don't randomize ids/whitespace the way mermaid
does), so it happens to reproduce the same size/id as the cached copy, which is what made the bug easy
to miss by eye (only the explicit `cacheHit` flag catches it). Same pattern reproduced for plantuml
with its own fixture (5/5 blocks, RESERVE hash ≠ PUT hash on every one). mermaid and flowchart never
stamp `data-code` from their OWN render (only a cache-HIT *paint* does, already consistently trimmed
— see `paintCached`), so they only ever hit the marker-textContent branch and never had this
mismatch — which is exactly why mermaid's half of `diagram-cache-mermaid.spec.ts` was passing while
abc's was failing in the SAME test run (a strong internal signal this was lang-specific, not a
whole-mechanism failure).

The render-cache-client's OWN `localKey` helper (same-session in-memory reuse, task 365) already
independently discovered and patched around exactly this — its comment says *"a native block in the
full Preview pane is read straight off its textContent, which still carries the fence's trailing
newline. Trimming both ends makes the two agree... The host key is left alone"* — i.e. the trim was
applied locally but the fix was never carried back to the shared `nativeSourceForLive` the host key
also depends on, so the host round-trip kept the mismatch that `localKey` had already fixed for the
same-session path.

**Fix (product change, one line + comment):** `nativeSourceForLive` now trims BOTH branches, so
every caller (RESERVE, GET, PUT, the offscreen-miss re-render, mermaid's own retheme gate) hashes and
reads the same canonical string regardless of whether the block has rendered yet. `diagram-surfaces.ts`
is the only file changed — `render-cache-client.ts`, `viewport-gate.ts`, and every patched renderer
are untouched. Verified: all three specs pass, 2/2 repeats each (`abc-flip-cache-hit` 17–19s,
`diagram-cache-mermaid` 7–8s — mermaid/abc/**flowchart** all `hit=true` now, `plantuml-cache`
9–12s, `hits=5/5`, `warmMs` well under half of `coldMs`). Full `npm test` (2552/2553, the one
pre-existing unrelated failure is a stale filename in `probe-tier-convention.test.ts`, untouched by
this change) and `npm run lint:ci` (668 files, clean) both pass. Debug instrumentation (temporary
`window.__dbg480` logging in `render-cache-client.ts` + two spec files) was removed before the final
verification run.

**Follow-up check (out of this cluster's assigned scope, but cheap to verify given the shared cause
just found):**
- `plantuml-phase-timing.spec.ts:49` — **also fixed by the same product change**, no extra work
  needed. Its `:49` test exercises the identical plantuml cache-hit path this fix corrects (the
  earlier attribution table's own note — *"its other test passes on both"* — already isolated the
  failure to this one). Verified: both tests in the file pass, 2/2 repeats
  (`plantuml-phase-timing.spec.ts:49` ~12–13s, `:183` ~4–5s, `hits=2/2` on the cache-hit pass).
- `plantuml.spec.ts:22` (palette-pairing) — **still fails, unrelated.** Re-ran after the fix (3/3
  red, same `expect(received).toBe(expected)` shape as before) — a different assertion (palette
  pairing with the content theme, not cache hit/miss), not touched by this diagnosis. Left for
  whoever picks it up; out of this cluster's scope.

### `flip-skip.spec.ts:24` — STALE ASSERTION, FIXED (spec-only change)

Root cause (measured via temporary debug instrumentation, since reverted): the spec's fixture
(`all-renderers.md`) opens with the mermaid target at `top:1047px` against a `786px`-tall viewport
(echarts further down still) — both **below the fold**. `viewport-gate.ts`'s `isVisibleish` (task
412, commit `d887361`, which **postdates** `flip-skip.spec.ts`'s introduction at `5be7f3f`)
legitimately defers a re-render for any diagram outside `rootMargin` (200px), independent of the
task-164 signature check this spec exists to isolate. So the CONTROL assertion ("first flip always
re-renders — no stored signature yet") failed: the diagram was never rendered at all (deferred, no
signature ever stored, `data-vmarkd-mermaid-defer="1"` confirmed via instrumentation), not "skipped
because the signature already matched" — a confound task 412 introduced after this spec was written.
`all-renderers.md` has grown substantially since (many renderer sections added above §3/§4
mermaid/echarts) — that's what pushed both targets below the fold at the harness's default window
size.

Verified the diagnosis empirically: scrolling both targets into view (`scrollIntoViewIfNeeded`)
before the first flip makes the spec pass cleanly, 3/3 repeats (`--repeat-each=3`, all green,
19–23s each). Fix applied directly to `test/vscode-e2e/flip-skip.spec.ts` — added two
`scrollIntoViewIfNeeded()` calls plus a comment explaining why (referencing task 412 and this
diagnosis). **Not a product change** — `viewport-gate.ts`/`diagram-retheme.ts` untouched. Debug
instrumentation used to find the root cause (temporary `console.log` of
`window.__vmarkdLastMermaidSig`/`__vmarkdLastEchartsSig`/bounding-rect/defer-attr) was removed before
the stability run.

## Scope

- [x] **Attribution COMPLETE, all 9 (2026-07-31): every one is PRE-EXISTING. Nothing in this set is
      the 2026-07-31 work.** `plantuml`, `plantuml-cache`, `plantuml-phase-timing`,
      `diagram-cache-mermaid`, `abc-flip-cache-hit`, `bottom-gap`, `flip-skip`, `parity`, and
      `wysiwyg-parity:197` all fail identically on the baseline.

      **Two corrections that came out of doing this properly, both worth keeping:**
      1. `font-parity`, `mode-switch-parity` and `d2-feature-parity` appeared in the FIRST baseline
         run's failure list. They **PASS** on a correctly-built baseline — they were artefacts of the
         broken build, never real. They are not part of this task's set.
      2. `wysiwyg-parity` looked like 2 failures on HEAD and 1 on baseline, which briefly looked like
         a regression. It is not: the HEAD count was counting **retries of one test**. Per-test,
         both trees are identical — `:163` and `:181` pass, only `:197` (callout height) fails.
         Compare per TEST, not per spec-file line count.
- [ ] Group the confirmed pre-existing failures by suspected shared cause before fixing any of
      them individually. The parity cluster in particular looks like one or two root causes.
- [ ] For each: decide **bug or stale assertion**. Several of these pin contracts from older tasks
      (164's flip-skip, the 2026 theme font parity); a contract may have legitimately changed and
      the spec never followed. A stale assertion is fixed in the spec, not the product — but that
      call must be made per spec, with evidence, not assumed to make the red go away.
- [ ] Only then fix. Do not batch-fix a red gate; that is how a wrong assertion gets frozen in.

## How to reproduce the attribution — and the trap in it

> ### ⚠️ Do NOT symlink `media-src/node_modules` into the baseline worktree
>
> The first attempt did, to save 178 MB, and **the baseline build silently failed** — the result was
> reported before the failure was noticed. `build.mjs` patches the *vendored Vditor sources inside
> `media-src/node_modules/vditor/src/`* with **relative** imports like
> `../../../../../src/html-comment`. Through a symlink those resolve back into the MAIN repo's
> `media-src/src/` — i.e. the post-460 module layout, not the baseline's flat one — so esbuild fails
> on three unresolvable imports and `media/dist/main.js` is never produced for the worktree.
>
> A second hazard from the same shortcut: that patching **writes into the shared `node_modules`**, so
> building a baseline can leave the main tree's vendored sources pointing at the wrong layout.
> `build.mjs` re-patches on every run so it self-heals, but do not rely on that.
>
> `media/dist/` and `media/vditor/dist/` are gitignored, so a fresh worktree has neither — a failed
> build means the suite runs against nothing, and every result from it is worthless.

```bash
git worktree add tmp/baseline 443576b
ln -sfn "$PWD/node_modules" tmp/baseline/node_modules
ln -sfn "$PWD/test/vscode-e2e/node_modules" tmp/baseline/test/vscode-e2e/node_modules
# media-src/node_modules must be a REAL COPY, not a symlink — see the box above.
mkdir -p tmp/baseline/media-src/node_modules
cp -r media-src/node_modules/. tmp/baseline/media-src/node_modules/
cd tmp/baseline && node build.mjs          # MUST exit 0 — check it, don't assume
ls media/dist/main.js                      # must exist, and differ in size from HEAD's
cd test/vscode-e2e && xvfb-run -a npx playwright test <spec>.spec.ts
```

Run it **alone** — see `scripts/e2e-lock.mjs` and DEVELOPMENT.md for why two concurrent real-VS-Code
runs corrupt each other's cache-hit and timing specs. (The baseline worktree predates that lock, so
it will not stop you; the discipline is yours.)
