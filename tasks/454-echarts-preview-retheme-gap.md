# Task 454 — echarts does not redraw in the sv-mode `.vditor-preview` surface after a theme flip

**Status:** 🟡 **OPEN — confirmed red, root cause NOT confirmed. Both originally-proposed
explanations ruled out by measurement (2026-07-30); a third, more specific hypothesis identified
but NOT investigated.** Filed as a byproduct of verifying task 412's `.vditor-preview` fix in the
real webview: 4 of 5 engines (mermaid, plantuml, wavedrom, D2) proved correct there; echarts alone
does not redraw. Quarantined via `test.fixme` rather than fixed, per team-lead's explicit
instruction not to chase the root cause further. See "Discriminating experiment (2026-07-30)"
below for the actual measured values and why both original candidates don't hold up.
· **Impact:** 🟡 medium (a real, user-visible staleness bug — the gate demonstrably fires and
computes a correct spec, so whatever's wrong is downstream of that, not a skip) · **Origin:**
discovered while re-verifying task 412's `.vditor-preview` fix, 2026-07-30.

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
task's test cannot surface it. Out of 454's scope — see task 461.

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
- [ ] Determine the ACTUAL cause. Not started. Leading candidate, not yet investigated: whether
      `reRenderEcharts`'s own re-derivation of the live node — a SECOND `renderedDiagramTargets`
      call scoped to `blockScopeOf(target)` rather than the full render root — correctly re-locates
      the `.language-echarts` element when that block lives inside `.vditor-preview` specifically.
      See the hypothesis paragraph above for the exact mechanism suspected.
- [ ] Fix it, once the actual cause above is confirmed by measurement (not inferred).
- [ ] Un-`fixme` the quarantined test once whichever fix lands, and confirm it goes green under the
      same conditions that currently make it fail (prove red-then-green: revert, watch it fail,
      restore, watch it pass).

## Out of scope (for now)

- Re-running the fixed `test.fixme` leg to confirm a fix — blocked on the above being resolved
  first.
- Any change to `rethemeDiagrams`'s echarts branch, `resolveEchartsTheme`, `readVscodePalette`, or
  `reRenderEcharts` — none made; the actual cause is not yet known well enough to change anything
  safely. The diagnostic instrumentation used to gather the measurement above was added to
  `retheme-preview-surface.spec.ts` temporarily and fully reverted after data collection — it was
  never committed and does not exist in the current tree.

## Verification

- [x] Real-VS-Code e2e: `test/vscode-e2e/retheme-preview-surface.spec.ts` — the four working langs
      assert normally and are green; the echarts leg is a separate `test.fixme`-marked test (skipped,
      not silently passing) with the diagnosis above recorded in its own header comment.
- [ ] Root-cause confirmation and fix — not done, see Scope above.
