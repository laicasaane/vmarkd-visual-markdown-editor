# Task 454 — echarts does not redraw in the sv-mode `.vditor-preview` surface after a theme flip

**Status:** 🟡 **OPEN — confirmed red, root cause NOT confirmed.** Filed as a byproduct of verifying
task 412's `.vditor-preview` fix in the real webview: 4 of 5 engines (mermaid, plantuml, wavedrom,
D2) proved correct there; echarts alone does not redraw. Quarantined via `test.fixme` rather than
fixed, per team-lead's explicit instruction not to chase the root cause further in this batch.
· **Impact:** 🟡 medium (a real, user-visible staleness bug IF the root cause is a shipped-code gap
— see the two open explanations below; NOT yet known to be that) · **Origin:** discovered while
re-verifying task 412's `.vditor-preview` fix, 2026-07-30.

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

**Two explanations remain open, neither confirmed:**

1. **The resolved echarts theme spec genuinely doesn't change** between this test's light→dark flip
   — i.e. `resolveEchartsTheme(options?.echartsTheme, options?.contentTheme, f.theme,
   readVscodePalette(window))` produces the same `JSON.stringify(spec)` for both themes under this
   test's specific config (`vmarkd.theme.content: 'auto'`, no explicit `echartsTheme` set,
   `workbench.colorTheme` flipped light↔dark). If so, this is a real gap: `spec` should differ by at
   minimum `backgroundColor` across a light/dark flip (per the comment above the skip-gate — "the
   auto case differs only inside theme.backgroundColor/series"), so either that assumption doesn't
   hold for this pairing, or something else is short-circuiting first.
2. **`readVscodePalette(window)` reads STALE CSS custom properties** at the moment `rethemeDiagrams`
   runs in headless VS Code under `xvfb-run` — a harness/timing artifact rather than a shipped-code
   bug, where the workbench's CSS variables haven't actually updated yet when this specific poll
   fires, so the computed spec is (correctly, given stale inputs) identical to the pre-flip one.

Neither has been checked against the other. Distinguishing them needs, at minimum: logging the
actual `spec`/`sig` values on both sides of a flip in this exact test (not inferred from the
`data-vmarkd-retheme-defer` absence alone), and separately confirming whether `readVscodePalette`'s
CSS reads are live at that instant (e.g. by comparing them against a value read slightly later in
the same webview). Neither the log point nor the confirmation exists yet.

## Scope

- [x] Prove the surrounding task 412 fix independently of this gap: mermaid/plantuml/wavedrom/D2
      assert normally in `retheme-preview-surface.spec.ts` and are green.
- [x] Quarantine the echarts leg (`test.fixme`, not `@probe` — this test asserts real behaviour, it
      currently just fails; `@probe` is reserved for specs that assert nothing at all, enforced by
      `probe-tier-convention.test.ts`) with a comment naming this task and the two open explanations.
- [ ] Determine which of the two explanations above (or a third, not yet considered) is the actual
      cause — **not started**, deliberately deferred per team-lead's explicit instruction not to
      chase the root cause further in the same batch as the 412/434 verification work.
- [ ] Fix it, if explanation 1 (a genuine signature-computation gap) is confirmed — likely a
      `resolveEchartsTheme`/`readVscodePalette` change, scope TBD until the cause is known.
- [ ] If explanation 2 (a harness-timing artifact) is confirmed instead, this may not need a
      shipped-code fix at all — record that finding here and reassess whether the spec itself needs
      an extra settle step, rather than treating it as a product bug.
- [ ] Un-`fixme` the quarantined test once whichever fix (or harness change) lands, and confirm it
      goes green under the same conditions that currently make it fail.

## Out of scope (for now)

- Re-running the fixed `test.fixme` leg to confirm a fix — blocked on the above being resolved
  first.
- Any change to `rethemeDiagrams`'s echarts branch, `resolveEchartsTheme`, or `readVscodePalette` —
  none made; the cause is not yet known well enough to change anything safely.

## Verification

- [x] Real-VS-Code e2e: `test/vscode-e2e/retheme-preview-surface.spec.ts` — the four working langs
      assert normally and are green; the echarts leg is a separate `test.fixme`-marked test (skipped,
      not silently passing) with the diagnosis above recorded in its own header comment.
- [ ] Root-cause confirmation and fix — not done, see Scope above.
