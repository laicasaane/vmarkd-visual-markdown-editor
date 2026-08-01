# Task 418 — `patchEchartsThemeInit`'s `.setOption(option)` rewrite is silent (no anchor guard)

**Status:** 🟢 FULLY DONE (2026-07-28) — code, unit tests, build verification all green;
real-VS-Code e2e resolved by reasoning jointly with team-lead, not run (see Verification) ·
**Impact:** 🟡 low-med (a silent no-op ships a behaviour regression with zero build/test signal;
bounded to one cosmetic behaviour) · **Origin:** task 147 item 5 full-registry read (2026-07-28),
verified independently

> **Progress (2026-07-28):** `patchEchartsThemeInit` now takes a `path` param; the animation
> anchor (`ECHARTS_ANIMATION_ANCHOR = '.setOption(option)'`, guarded by a new
> `CHART_RENDER_FILE_RE = /[/\\]chartRender\.ts$/`) is asserted and thrown on ONLY when the file
> being transformed is `chartRender.ts` — `mindmapRender.ts` is now explicitly skipped rather than
> incidentally missed. The registry entry call site (`markdown/(chartRender|mindmapRender)` /
> `devtools/index`) now passes `path` through: `patchEchartsThemeInit(out, path)`. TDD followed:
> wrote the failing tests first (ran them, confirmed the ONE expected failure — "throws… when
> chartRender.ts-shaped source lacks the animation anchor" — and nothing else, since the current
> code's silence covers every other case already), then implemented, then green.
>
> Added to `test/backend/vditor-source-patches.test.ts` (`describe('patchEchartsThemeInit …
> task 418')`): a real-source assertion that the vendored `chartRender.ts` still contains
> `.setOption(option)` (mirrors item 1's smiles fix) and its mirror-image fact for
> `mindmapRender.ts` (real vendored source, not synthetic); a throw test for a reformatted
> chartRender.ts-shaped source; a non-throw test for real mindmapRender.ts source; and a
> both-files throw test for the shared init anchor. `test/backend/vditor-source-patches.test.ts`
> and `test/backend/patch-mutation.test.ts` (which drives every registry entry's `transform`
> against the real vendored tree with real paths, unchanged) are both green; full `npm test`
> 1857/1857 green; `npm run lint:ci` clean (one biome auto-format pass applied to both edited
> files — line-wrap only, no logic change).
>
> **Blocked, not skipped:** `node build.mjs` is currently RED for an unrelated reason (a
> concurrent mid-refactor of `src/extension.ts`, task 405) — per the assigning instruction, the
> build/e2e checkboxes below are deliberately left unchecked until the tree compiles again. I did
> NOT attempt to work around the broken build, and did NOT run the real-VS-Code e2e suite (would
> be meaningless against a red build).
>
> **Follow-up (2026-07-28, same day):** review caught a residual hole of the SAME class one level
> up: `CHART_RENDER_FILE_RE.test(path || '')` — if `path` were ever falsy (e.g. a future edit to
> the registry entry dropped it from its `patchEchartsThemeInit(out, path)` call), the guard would
> silently decide "not chartRender" and skip the animation-disable with no throw, and neither this
> task's own unit tests (all pass `path` explicitly) nor `patch-mutation.test.ts` (only asserts
> "mutates at least one file" — the init-anchor half still mutates regardless) would catch it.
> Closed two ways, TDD again (wrote both failing tests first, confirmed only the intended one
> failed — `path`-required test failed as expected on the old code; the registry-wire test
> already passed since the registry itself never dropped `path`, which is exactly the point: it's
> defense-in-depth for a regression that hasn't happened, not evidence against needing it):
> 1. `patchEchartsThemeInit` now throws a named `fixEcharts` error immediately if `path` is falsy
>    (no code, no path, empty string, `null`, `undefined` all covered) — the single real caller
>    (the registry entry) always supplies `path`, so this is a no-op in practice. The
>    now-redundant `|| ''` fallback was removed (`CHART_RENDER_FILE_RE.test(path)`).
> 2. A new **registry-level** test (`test/backend/vditor-source-patches.test.ts`, since
>    `test/backend/patch-mutation.test.ts` is outside this task's file allowlist) looks up the
>    actual `VDITOR_TS_PATCHES` entry that matches the real vendored `chartRender.ts` path and runs
>    its own `entry.transform(code, path)` — proving the wire from the registry array, not just a
>    hand-called unit — plus the mirror-image test that the entry leaves `mindmapRender.ts` alone.
> Verified: `test/backend/vditor-source-patches.test.ts` + `test/backend/patch-mutation.test.ts`
> 187/187; full `npm test` 1861/1861 (one earlier run showed 2 unrelated failures from a
> concurrent agent's in-flight file edit — did not reproduce on rerun, not caused by this change);
> `npm run lint:ci` — the two files I'm allowed to touch are clean (confirmed with a scoped
> `biome check` on just those files); the one remaining whole-tree `lint:ci` error/warning is
> entirely in `media-src/src/custom-diagrams.ts`, outside this task's allowlist and not touched.

## Problem

`media-src/esbuild-shared.mjs`, `patchEchartsThemeInit` (registry entry for
`markdown/chartRender.ts` + `markdown/mindmapRender.ts` + `devtools/index.ts`) performs **two**
rewrites, but guards only the first:

```js
export function patchEchartsThemeInit(code) {
  if (!ECHARTS_INIT_ANCHOR.test(code)) {
    throw new Error('fixEcharts: … anchor not found … (version drift?)')   // guarded ✅
  }
  return code
    .replace(ECHARTS_INIT_ANCHOR, …)                                        // the guarded one
    .replace('.setOption(option)',                                          // UNGUARDED ⚠️
             '.setOption(Object.assign({}, option, { animation: false }))')
}
```

The second `.replace` disables the ECharts chart entry animation. Its own comment says
*"No-op if the anchor is absent"* — and that silence is **deliberate**: it is precisely how
`mindmapRender.ts` is excluded from the animation-disable, since mindmap calls
`.setOption({…})` with an object literal rather than the `option` identifier. So the silence is
load-bearing for the mindmap exclusion, not an oversight.

The gap is that the SAME silence covers the case this task cares about: if a future Vditor bump
reformats `chartRender.ts` so its call no longer reads literally `.setOption(option)` (e.g.
`.setOption(option, true)`, a rename, or a line-wrap), the animation-disable **silently stops
applying**. The chart entry animation returns, and there is **no build throw and no test failure** —
exactly the failure mode [task 147](147-patch-engine-hardening.md) item 1 existed to close for the
SMILES `?v=` patch.

Per the full-registry read, this is one of only two non-throwing sub-patches left in the registry
(the other, `patchPreviewComments`' import-splice, at least fails as an unlabelled `ReferenceError`
rather than passing silently). See [`docs/vditor-patch-checklist.md`](../docs/vditor-patch-checklist.md).

**Not a live bug** — the anchor matches the currently-pinned Vditor. This is drift-proofing.

## Scope

- [x] Make the chartRender half fail-loud without breaking the mindmap exclusion. The naive fix
      (throw when `.setOption(option)` is absent) would break the build on `mindmapRender.ts`,
      whose absence of that literal is the intended exclusion — so the guard must be **per-file**,
      not per-call. The registry entry already receives `path` and already branches on it
      (`/[/\\](chartRender|mindmapRender)\.ts$/`), so the natural shape is: assert the animation
      anchor **only when the file is `chartRender.ts`**, and leave mindmap alone explicitly.
      **Done:** `CHART_RENDER_FILE_RE` gates the throw+rewrite; `mindmapRender.ts` and any other
      path skip that branch entirely (no attempt, no throw).
- [x] Prefer making the exclusion EXPLICIT rather than incidental: today "mindmap keeps its
      animation" is encoded as "the string happens not to match there." A named per-file branch
      states the intent and stops a future reader from mistaking the no-op for a bug (or, worse,
      "fixing" it into a mindmap regression — note `patchMindmapThemeColors`' own comment explains
      why the mindmap animation must NOT be disabled: ECharts `tree` gates the entry animation and
      the click-collapse re-render on the same flag). **Done:** the branch + its comment now say
      explicitly why mindmap is excluded, rather than leaving it to an incidental non-match.
- [x] Add a real-source assertion in `test/backend/vditor-source-patches.test.ts` for the animation
      anchor against the actual vendored `chartRender.ts`, mirroring what item 1 did for smiles —
      the drift test is the second net behind the build throw. **Done:** plus the mirror-image
      assertion that the real vendored `mindmapRender.ts` genuinely lacks that literal.

## Out of scope

- `patchPreviewComments`' unguarded import-splice (the other, lower-severity gap the same read
  found) — it does fail, just without the registry's named label. Record-only unless it bites.
- Re-anchoring any of the whitespace-sensitive multiline anchors catalogued in the checklist doc —
  different fragility axis, no action currently justified.

## Verification

- [x] Unit: `patchEchartsThemeInit` throws a named "version drift?" error when given
      `chartRender.ts`-shaped source WITHOUT the animation anchor, and does NOT throw for
      `mindmapRender.ts`-shaped source (the exclusion still holds). Green:
      `test/backend/vditor-source-patches.test.ts` + `test/backend/patch-mutation.test.ts`
      (184 + full suite), full `npm test` 1857/1857, `npm run lint:ci` clean.
- [x] `test/backend/vditor-source-patches.test.ts` asserts the animation anchor against real
      vendored source (both directions: chartRender.ts has it, mindmapRender.ts doesn't).
- [x] `node build.mjs` **is green** (2026-07-28) — task 405's `src/extension.ts` refactor landed;
      confirmed independently: `node build.mjs` exit 0 (twice, on request) and
      `npx tsc -p tsconfig.json --noEmit` (host) exit 0. Since this patch is a build-time source
      transform, a green build IS the proof the new throw doesn't fire against the live vendored
      `chartRender.ts`/`mindmapRender.ts` — the concrete thing this checkbox was gating on.
- [x] **Real-VS-Code e2e — RESOLVED BY REASONING (2026-07-28), deliberately not run.** Decision made
      jointly (I recommended, team-lead confirmed) and recorded here so the choice and its grounds
      are visible later, not inferred: this change is a pure build-time string transform whose
      OUTPUT is already byte-asserted against real vendored source by the unit tests (both
      directions — chartRender.ts gets `.setOption(Object.assign({}, option, {animation:false}))`,
      mindmapRender.ts's `.setOption({…})` is untouched), the registry-level test proves the wire
      actually applies it (not just the bare unit call), and the build passing proves the transform
      reaches the live pinned Vditor source without throwing. The e2e the task text asks for (chart
      animation suppressed / mindmap still collapses on click) would check *behaviour* that follows
      deductively from output already asserted — the `Object.assign({...option, animation:false})`
      mechanism was ALREADY shipping before this task (418 only added a guard around an existing,
      working rewrite; no runtime logic changed). Given e2e slots are the scarcest resource this
      session and a genuinely unmeasured question (148 item 3's `e.origin` value) is queued behind
      it, spending one here would be a deductive re-confirmation, not new evidence — the wrong
      trade. If a real behavioural risk is later found here, take the slot after the origin probe.

## See also

- `media-src/esbuild-shared.mjs` (`patchEchartsThemeInit`, `patchMindmapThemeColors` and its
  animation note), `test/backend/vditor-source-patches.test.ts`.
- [Task 147](147-patch-engine-hardening.md) (parent — item 1 closed the identical hole for SMILES;
  item 5's registry read surfaced this one), [`docs/vditor-patch-checklist.md`](../docs/vditor-patch-checklist.md).
