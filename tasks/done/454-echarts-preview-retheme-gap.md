# Task 454 — echarts does not redraw in the sv-mode `.vditor-preview` surface after a theme flip

**Status:** 🟢 **FIXED and verified red→green, 2026-07-31.** Root cause confirmed by code reading
(see "ROOT CAUSE" below): `reRenderEcharts` recovered each chart's JSON source via a sibling
editable `<code class="language-echarts">` OUTSIDE the preview pane — a lookup that never finds
anything in `.vditor-preview` (no 1:1 editable-block pairing there, unlike IR/WYSIWYG), and echarts
was the only engine with no `data-code` fallback (its adapter reads `el.innerText`, which
`echarts.init` then destroys). Fixed by stamping `data-code` on the chart container as
chartRender.ts first renders it (esbuild patch `patchEchartsDataCode`,
`media-src/esbuild-shared.mjs`) and having `reRenderEcharts`/`reconstructCharts` read that
attribute directly off each live node (`media-src/src/echarts-retheme.ts`) instead of the pane-wide
sibling search — see "The fix, and the trap in it" below for the exact shape and the
first-match-in-pane hazard it avoids. `retheme-preview-surface.spec.ts`'s echarts leg is un-fixme'd
and asserts normally alongside the other four engines, with a `data-code` non-empty assertion
pinning the mechanism, not just the outcome. Real-VS-Code red→green proof (revert read-side,
rebuild, watch it fail 3/3; restore, rebuild, watch it pass 2/2): see "Verification" below.
**A second, riding-along user-visible fix:** `reconstructCharts` (the window/pane-resize twin,
same file) had its OWN, separate bug — its pane scan never included `.vditor-preview` at all, so an
echarts chart in sv/full Preview was never resized on a window or pane resize (dead for that
surface, not merely wrong-sourced). Fixed in the same pass by routing it through the same
`renderedDiagramTargets` helper `reRenderEcharts` uses.
· **Impact:** 🟡 medium (a real, user-visible staleness bug) · **Origin:** discovered while
re-verifying task 412's `.vditor-preview` fix, 2026-07-30. **Fixed:** 2026-07-31.

## How this was found

`test/vscode-e2e/retheme-preview-surface.spec.ts` proves task 412's `.vditor-preview` fix in a real
webview: open `all-renderers.md`, switch to `sv` (split) mode — where the editable pane AND
`.vditor-preview` are both live simultaneously — tag each of mermaid/echarts/plantuml/wavedrom/D2's
currently-rendered child, flip the theme light→dark, scroll each diagram into view, and confirm its
tagged child was REPLACED (a redraw), not just left in place.

The first version of this spec asserted all five langs in one shared `expect.poll` sequence
(stop-at-first-failure). It timed out at 60s on 3 consecutive retries with near-identical (~1.2m)
total wall-clock — a signal, in hindsight, that this was "never satisfied" rather than "slow", but
the failure always pointed at the SAME source line (the shared poll call site inside the loop)
regardless of which lang's redraw actually never landed, so the generic timeout alone told nobody
WHICH lang was the culprit — a genuine measurement blind spot, not a red herring to dismiss.

Restructuring the check into an independent per-lang `try`/`catch` (each lang polled and recorded on
its own, none of them able to hide behind another's failure) with a shortened poll for fast triage
(`retries=0`, 8s per lang) produced a real per-lang result:

```
mermaid:  redrawn
echarts:  TIMED OUT
plantuml: redrawn
wavedrom: redrawn
d2:       redrawn
```

4 of 5 engines redraw correctly in `.vditor-preview` (sv mode) after the flip — genuine, positive
proof that task 412's `diagramRenderRoot`/`renderedDiagramTargets` fix reaches that surface for
those engines. **echarts alone does not.**

### Ruled out

This is **not** the "gate never fires in this harness" trap that the earlier three stale
pre-412 unit tests fell into (they mounted no DOM at all, so the gate correctly never had anything
to fire on, and the resulting red looked like a regression when it wasn't — see task 412's own
history). Four other engines fire through the exact same gate mechanism, in the exact same harness,
on the exact same flip. The harness and the shared gate are not the obstacle here; whatever is wrong
is specific to the echarts path.

## What is (and isn't) known about the root cause

A diagnostic dump taken at the same point in the flow (right after the scroll pass, before any
per-lang poll) showed `data-vmarkd-retheme-defer` **absent (`null`)** on the echarts candidate —
meaning it was never even gated/enumerated as a candidate at all, not "gated and still waiting
offscreen" (an actually-deferred candidate carries that attribute until it fires — see
`diagram-retheme.ts`'s `gateAndRender`).

That is consistent with `rethemeDiagrams`'s echarts branch (`media-src/src/diagram-retheme.ts`,
roughly lines 472–503) skipping the **whole** redraw — candidate collection included, not just the
render — when `window.__vmarkdLastEchartsSig` is unchanged from the previous flip:

```ts
const sig = JSON.stringify(spec)
if (win.__vmarkdLastEchartsSig !== sig) {
  // ...candidate collection + gateAndRender...
  win.__vmarkdLastEchartsSig = sig
}
```

This is task 164 §2's own intentional skip-if-identical optimization (avoid a dispose+reinit pass
when the resolved theme spec would produce byte-identical output) — the same *shape* of gate mermaid
has (`__vmarkdLastMermaidSig`), which DID correctly change across this exact same flip in this exact
same test run (confirmed: mermaid redrew).

**Two explanations were proposed, and BOTH are now ruled out by direct measurement (2026-07-30).**

The original two candidates:

1. ~~The resolved echarts theme spec genuinely doesn't change between this test's light→dark
   flip~~ — i.e. `resolveEchartsTheme(...)` produces the same `JSON.stringify(spec)` for both
   themes.
2. ~~`readVscodePalette(window)` reads STALE CSS custom properties~~ at the moment `rethemeDiagrams`
   runs in headless VS Code — a harness/timing artifact rather than a shipped-code bug.

### Discriminating experiment (2026-07-30)

Per team-lead's prescribed experiment: temporarily instrumented `retheme-preview-surface.spec.ts`
(reverted after data collection, never committed) to log, on both sides of the light→dark flip: the
raw CSS custom properties `readVscodePalette` itself reads (`--vscode-editor-background`,
`--vscode-charts-foreground`/`--vscode-editor-foreground`,
`--vscode-charts-blue`/`--vscode-textLink-foreground`/`--vscode-focusBorder`), plus
`window.__vmarkdLastEchartsSig` (the stored signature `rethemeDiagrams`'s echarts branch compares
against to decide whether to skip). Captured once right before the flip, once IMMEDIATELY after the
flip signal (no settle wait), and once 1.5s later.

Actual values:

```
BEFORE flip:               {"bg":"#ffffff","fg":"#3b3b3b","accent":"#0063d3"}
AFTER flip (immediate):    {"sig":"{\"name\":\"vmarkd\",\"theme\":{...backgroundColor:\"#1f1f1f\"...}}",
                             "bg":"#1f1f1f","fg":"#cccccc","accent":"#59a4f9"}
AFTER flip (settled +1.5s): identical to "immediate" — same sig, same bg/fg/accent
```

(`sig` has no key in the BEFORE line because `JSON.stringify` drops `undefined`-valued keys —
`__vmarkdLastEchartsSig` was genuinely unset at that point, this being the test's first-ever flip.)

**Verdict on the original two explanations:**

- **Explanation (b), stale CSS vars, is RULED OUT.** The palette read IMMEDIATELY after the flip
  signal — with no settle wait at all — already shows the correct NEW (dark) values. There is no
  measurable propagation delay in this harness; "settled +1.5s" produced byte-identical output to
  "immediate". `readVscodePalette` was never stale.
- **Explanation (a), the spec genuinely doesn't change, does not apply to what was actually
  measured, for a subtly different reason than originally framed.** Because
  `__vmarkdLastEchartsSig` was `undefined` before this (first-ever) flip, `win.__vmarkdLastEchartsSig
  !== sig` is unconditionally true on ANY first flip regardless of what the computed spec is — the
  skip-gate structurally cannot be the reason echarts fails to redraw on a document's FIRST theme
  flip. The gate DID let this flip through: a freshly-computed, correctly dark-themed spec was
  computed and stored. This directly contradicts the earlier `data-vmarkd-retheme-defer: null`
  reading from the pre-restructure diagnostic run, which I had read as "never even gated" — that
  reading was premature. `retthemeDefer: null` is equally consistent with "gated, found visible at
  flip time, and `gateAndRender`'s `fire()` called immediately" (which explicitly removes the
  attribute as part of firing, same as "never gated" would look) — I did not distinguish between
  those two cases before concluding "never enumerated as a candidate." That conclusion should be
  treated as retracted, not confirmed.

**Net result: this experiment proves the signature-skip-gate hypothesis (my original best guess) is
wrong, or at least not the explanation for THIS reproduction (a first flip on a freshly-opened
document).** It does not identify what IS wrong. The gate fires, the spec Computed is correct and
theme-appropriate, `reRenderEcharts` should be getting called on a genuine candidate — yet the
tagged child in `.vditor-preview` was still not observed to be replaced in the earlier per-lang
measurement. The most plausible remaining place to look, NOT yet investigated: `reRenderEcharts`
itself re-derives its live node via a SECOND, narrower `renderedDiagramTargets(editorEl, 'echarts')`
call using `blockScopeOf(target)` as `editorEl` (diagram-retheme.ts's `f.echarts` branch scopes each
candidate to its own block before calling `reRenderEcharts`) — if that re-derivation fails to
re-locate the correct live `.language-echarts` node specifically within a `.vditor-preview`-scoped
block (unlike mermaid/plantuml/wavedrom/D2's own re-render paths, which apparently DO locate
correctly there), the dispose+reinit could be silently operating on the wrong element, or on
nothing (the `source == null || !source.trim()` guard in `reRenderEcharts` `continue`s silently).
This is a hypothesis, not a measurement — explicitly NOT investigated further per team-lead's
instruction to stop, record, and report rather than improvise a fix for an unnamed cause.

## ROOT CAUSE — identified by code reading, 2026-07-30 (team-lead)

The leading candidate above (a failing `renderedDiagramTargets` re-derivation) is **wrong**: task 412
already fixed that step, and its own comment in `echarts-retheme.ts` says so. The un-fixed step is
the very next one — the **source lookup**.

`reRenderEcharts` resolves each chart's JSON by searching for a sibling editable
`<code class="language-echarts">` in the same block but OUTSIDE the preview pane:

```ts
const source = block
  ? Array.from(block.querySelectorAll('.language-echarts')).find((m) => !pane?.contains(m))?.textContent
  : undefined
if (source == null || !source.trim()) continue   // ← silent skip
```

That is byte-for-byte the lookup `native-offscreen.ts`'s `nativeSourceForPane` **already documents as
broken on this exact surface**:

> Task 412 follow-up — the full/split Preview surface (`.vditor-preview`) doesn't pair 1:1 with an
> IR/WYSIWYG editable block the way `.vditor-ir__preview`/`.vditor-wysiwyg__preview` do, so the
> sibling-editable-copy lookup below usually finds nothing there.

`nativeSourceForPane` got a `data-code`-first fallback for it. `reRenderEcharts` — a separate copy of
the same idiom — did not. In `sv` mode the left pane is a `<textarea>`, so there is no
`.language-echarts` outside the preview pane anywhere in the document: `source` is `undefined`,
`continue` fires, nothing redraws, nothing throws. Exactly the observed symptom.

**Why echarts alone, out of five engines** — the adapters (`vditor/src/ts/markdown/adapterRender.ts`):

| lang | `getCode` | survives its own render? |
|---|---|---|
| mindmap | `el.getAttribute("data-code")` | yes — Lute emits it |
| mermaid/plantuml/wavedrom/D2 | `el.textContent` + our `data-code` stamp | yes — patched renderers stamp it |
| **echarts** | **`el.innerText`, never stamped** | **no — `echarts.init` destroys the text** |

`chartRender.ts` reads `innerText` and hands the element straight to `echarts.init`, which replaces
its contents. The source is gone after the first paint and was never written anywhere else. So
echarts is the one engine with *no* recoverable source inside `.vditor-preview`.

This also explains the two facts the discriminating experiment established: the gate DOES fire and
the computed spec IS correctly dark. Both are true, and irrelevant — the skip happens further down.

### The fix, and the trap in it

1. Stamp `data-code` in `chartRender.ts` via an esbuild patch, in `abcRender`'s existing idempotent
   shape, BEFORE the `data-processed` early return — with its own ADR-0004 drift `throw`.
2. Have `reRenderEcharts` prefer `live.getAttribute('data-code')`, falling back to today's sibling
   search.

**Do NOT implement (2) by calling `nativeSourceForPane(pane, 'echarts')`.** That helper does
`pane.querySelector('.language-echarts')` — FIRST match in the pane. `.vditor-ir__preview` holds one
diagram so that is correct there, but `.vditor-preview` is a SINGLE pane holding EVERY diagram in the
document: every chart would re-render with chart #1's spec. `reRenderEcharts` already iterates
per-`live`; read the attribute off `live` itself.

`reconstructCharts` (the window-resize twin, same file) carries the same lookup and is broken the
same way for split-preview resize — fixed in the same pass.

### Follow-up filed, NOT fixed here

The first-match-in-pane hazard above plausibly affects **mermaid's** `nativeSourceForPane` path too,
in split preview with 2+ mermaid diagrams. `all-renderers.md` has one diagram per lang, so this
task's test cannot surface it. Out of 454's scope — see task 466. Grep-confirmed (implementation
review, not fixed here) the SAME `pane.querySelector('.language-<lang>')` first-match pattern —
untouched by this task — also in `mermaid-retheme.ts:75`, `flowchart-retheme.ts:113`, and
`render-cache-client.ts:287,553`; any of these could silently under-serve a `.vditor-preview` pane
holding 2+ same-language diagrams the same way echarts did before this fix.

## Scope

- [x] Prove the surrounding task 412 fix independently of this gap: mermaid/plantuml/wavedrom/D2
      assert normally in `retheme-preview-surface.spec.ts` and are green.
- [x] Quarantine the echarts leg (`test.fixme`, not `@probe` — this test asserts real behaviour, it
      currently just fails; `@probe` is reserved for specs that assert nothing at all, enforced by
      `probe-tier-convention.test.ts`) with a comment naming this task and the (now superseded)
      two-explanation framing.
- [x] Run the discriminating experiment team-lead specified: log the actual echarts spec/sig and
      the raw `readVscodePalette` CSS-var values on both sides of a flip, plus a re-read a moment
      later. **Result: both original explanations ruled out** — see "Discriminating experiment
      (2026-07-30)" above. The palette is fresh immediately (rules out the stale-CSS explanation),
      and the skip-gate structurally cannot fire on a document's first-ever flip regardless of spec
      content (rules out, or at least fails to explain, the unchanged-signature explanation as
      originally framed).
- [x] Determine the ACTUAL cause. Confirmed by code reading (team-lead, 2026-07-30) — see "ROOT
      CAUSE" above. The `renderedDiagramTargets` re-derivation hypothesis was wrong (task 412
      already fixed that step); the actual bug is the NEXT step, the sibling-editable-`<code>`
      source lookup, which structurally cannot find anything in `.vditor-preview`.
- [x] Fix it. `patchEchartsDataCode` (new esbuild patch, `media-src/esbuild-shared.mjs`, applied to
      `chartRender.ts` only) stamps `data-code` on the chart container the first time it renders,
      idempotently (prefers an existing stamp over re-reading clobbered `innerText`). RAW text, no
      `encodeURIComponent` (unlike mindmap's Lute-encoded `data-code`) — the contract is asserted on
      both the write side (`vditor-source-patches.test.ts`) and the read side
      (`echarts-retheme.test.ts`). `reRenderEcharts` and `reconstructCharts`
      (`media-src/src/echarts-retheme.ts`) now read `live.getAttribute('data-code')` first, falling
      back to the original sibling search for documents rendered before this stamp shipped.
      Deliberately did NOT reuse `nativeSourceForPane` (it does `pane.querySelector`, first match
      only — wrong for `.vditor-preview`, which holds every chart in the document in one pane).
      `reconstructCharts` also gained `.vditor-preview` coverage in the same pass: its old
      pane-selector list (`.vditor-ir__preview, .vditor-wysiwyg__preview`) never included
      `.vditor-preview` at all, so a chart there was never resized on a window/pane resize either —
      now routed through `renderedDiagramTargets`, same as `reRenderEcharts`. The two functions'
      identical resolution logic (post-review) is ONE shared `resolveEchartsSource(live)` helper
      (imports `blockScopeOf`/`BLOCK_WRAPPER_SEL` from `diagram-dom.ts` for the fallback's ancestor
      walk instead of hand-copying that selector a third time — task 412's `NATIVE_PANE_SEL`
      retirement already showed what happens when it drifts), not two copies.
- [x] Un-`fixme` the quarantined test. `retheme-preview-surface.spec.ts`'s echarts leg is merged
      back into the main per-lang assertion (no more separate `test.fixme`), plus a `data-code`
      non-empty assertion on the preview node that pins the mechanism, not just the outcome.
      Red→green proved in the real webview (see Verification below).

## Out of scope (for now)

- No change to `rethemeDiagrams`'s echarts branch, `resolveEchartsTheme`, or `readVscodePalette` —
  the discriminating experiment already showed both are correct; the bug was entirely in the source
  lookup, downstream of them.
- Task 461 (the `nativeSourceForPane` first-match-in-pane hazard for **mermaid** specifically, in
  split preview with 2+ mermaid diagrams) — a plausible SIBLING risk this task's own fix avoided for
  echarts (by not reusing `nativeSourceForPane`), but `all-renderers.md` has one diagram per lang so
  this task's test cannot surface it for mermaid, and mermaid's own code path wasn't touched here.
- **A narrower residual, found while verifying the fix does not introduce a WORSE regression
  (advisor-flagged concern: could `patchEchartsDataCode`'s "prefer existing `data-code`" make a live
  EDIT pin the chart to stale content forever?).** Measured directly in the real webview (IR mode,
  `diagram-edit.md` fixture, real keystrokes via `page.keyboard.type`, per-attempt DOM dumps): that
  specific worry does NOT hold — Lute discards the WHOLE preview subtree and emits a fresh, unstamped
  `<div class="language-echarts">` on every collapse-after-edit (confirmed: `_echarts_instance_`
  changes, `data-processed` resets, and critically `data-code` is ABSENT on the fresh node, not
  stale-and-wrong) — the same "fresh wrapper per spin" `d2-edit-perf.spec.ts`'s `rebuilds` counter
  already measures for every engine including echarts. A missing attribute cannot pin old content;
  `e.getAttribute("data-code") || getCode(e)` correctly falls through to the live (new) text.
  **What IS a genuine, narrower gap, not measured (three interactions deep — live edit + collapse +
  theme flip, all in `.vditor-preview` specifically — not cheap to build after already spending six
  VS Code boots on the IR version of this measurement):** in `.vditor-preview` (sv mode), a chart
  edited live gets this same fresh unstamped node — and unlike IR/WYSIWYG, `.vditor-preview` has NO
  sibling editable `<code>` to fall back to (the whole reason this task exists). So a chart edited in
  sv mode, without reopening the document, could theoretically stay unredrawable on the NEXT theme
  flip until reopen — strictly NARROWER than the bug this task fixes (that one failed on a
  document's FIRST open; this hypothetical needs a live edit in between and no reopen). Flagged for a
  follow-up task if it turns out to matter in practice, not fixed or further investigated here.

## Verification

- [x] Real-VS-Code e2e: `test/vscode-e2e/retheme-preview-surface.spec.ts` — all five engines
      (mermaid/echarts/plantuml/wavedrom/d2) now assert normally in one test; the echarts leg's
      former separate `test.fixme` is gone. Added an assertion that the preview's `.language-echarts`
      carries a non-empty `data-code` — pins the MECHANISM, not just the redraw outcome.
      Red→green proved 2026-07-31 (`node build.mjs` from repo root, then
      `xvfb-run -a npm --prefix test/vscode-e2e test -- retheme-preview-surface.spec.ts`):
      **RED** (read-side fix in `echarts-retheme.ts` reverted, esbuild stamp patch still applied):
      echarts `TIMED OUT` 3/3 attempts (two separate runs, 6/6 total), while
      mermaid/plantuml/wavedrom stayed `redrawn` every time — d2 flaked twice. **GREEN** (fix
      restored, rebuilt): echarts `redrawn` 2/2 attempts; d2 flaked once more and passed on
      Playwright's automatic retry ("1 flaky", not failed). d2's flakes are independent of this
      change, not merely "probably unrelated": `echarts-retheme.ts` was FULLY reverted (including
      the `reconstructCharts` rewrite) for the RED run, and d2 flaked there too, at the same rate —
      identical flake behaviour with and without the fix applied is exactly what "unrelated" means.
      (The task's own "Discriminating experiment" section above is the reminder of why that
      standard — measure, don't guess a mechanism — matters here.)
- [x] vitest unit: `media-src/src/echarts-retheme.test.ts` (new, **currently UNTRACKED in git status**
      — flagging so a `git add` of only modified files doesn't silently drop it) — covers the
      two-charts-one-pane trap for both `reRenderEcharts` and `reconstructCharts`, the RAW-encoding
      contract (a percent-sign fixture that would throw under `decodeURIComponent`), the IR/WYSIWYG
      sibling-search fallback for BOTH functions, the no-source no-throw case, and `reconstructCharts`
      newly reaching `.vditor-preview` at all.
- [x] esbuild-patch unit: `test/backend/vditor-source-patches.test.ts`, new
      `describe('patchEchartsDataCode …)` block — anchor presence, the stamp + idempotent-read
      shape, the no-`encodeURIComponent` assertion, the version-drift throw, and the registry-entry
      wiring (chartRender.ts gets it, mindmapRender.ts deliberately does not).
- [x] Coverage (`npx vitest run --coverage --coverage.reporter=json`, scoped to
      `echarts-retheme.test.ts`, `coverage-final.json` inspected directly for per-statement hits):
      confirmed exercised — the `data-code` read + `??` fallback in BOTH `reRenderEcharts` and
      `reconstructCharts`, and the `renderedDiagramTargets(...)` iteration in both. Left genuinely
      uncovered (pre-existing defensive branches, not part of this diff's logic, and
      `observeMindmaps`/`reconstructMindmaps` which this task never touched): the `!ec` early-return
      guards, the `if (!option) return` parse guards, and `reconstructCharts`'s dedupe-skip
      (`canvas already fits`) branch.
- [x] `npm test` (2386 tests after the added fallback test), a `biome check` scoped to every file this
      task actually touched (all clean — see the lint:ci note below for why "scoped" instead of the
      full command), `npm run typecheck`, and `tsc -p tsconfig.json --noEmit` (via the LOCAL
      `node_modules/.bin/tsc` — plain `npx tsc` on this machine resolves to an unrelated system TS
      4.8.4 at `/usr/bin/tsc`, which fails on the pre-existing `satisfies` syntax in
      `src/reveal-caret.ts`; not a regression from this change) — all clean.
- [x] **`npm run lint:ci` (the actual whole-tree command) — now CLEAN, 655 files, verified by the
      lead 2026-07-31** after the blocking edit below landed. Resolved exactly as predicted: it was
      another agent's uncommitted work, not this task's, and it cleared when they committed. The
      original note is kept below because the *reasoning* is the reusable part — how to tell "my
      change broke lint" from "I share a working tree with someone mid-edit", without clobbering
      them.

      Original note: NOT clean as of
      2026-07-31 — `test/backend/vditor-source-patches.test.ts:1746` fails formatting, but that line
      (`patchPasteUrlAsLink`'s `mdIdx` assertion) is NOT part of this task's edit: `git diff --stat`
      on that file shows exactly 109 pure insertions (no deletions) — confirmed by stashing just this
      task's block and re-checking the file, which then passes clean. This repo's working tree is
      shared live with other concurrently-active agents (task 12, the link cluster, touches
      `patchPasteUrlAsLink`); the failure is their in-flight, uncommitted edit, not this task's. Every
      file this task touched individually passes `biome check` clean. Left for the lead to resolve
      with whichever agent owns that block — not fixed here to avoid clobbering their in-progress
      work in a tree with no per-agent isolation.
