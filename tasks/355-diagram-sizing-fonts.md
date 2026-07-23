# Task 355 — Fix diagram + font sizing/rendering (looks bad)

**Status:** 📋 TODO (open — user feedback 2026-07-05). Perceptual / visual — steer by the user's eye.

## Problem
The user evaluated the rendered diagrams in the real editor and reports that **the sizing and fonts look
bad across the board** ("za duże / porozciągane" and, after a partial fix, still "źle wszystko wygląda").
The diagram/font sizing is not right yet and needs a proper, holistic pass — not another one-off tweak.

## What's already been tried (task 354 fallout — partial, NOT sufficient)
- `main.css` had `min-width: 300px` on every `.language-plantuml > svg`. For the stdlib icon libraries
  (k8s/aws/azure/… — bitmap `<image>` sprites) that UPSCALED small diagrams (e.g. 87px → 300px), stretching
  and blurring the sprites and inflating the fonts. Scoped the boost to pure-vector diagrams only
  (`svg:not(:has(image))`) so sprite diagrams render at natural size (committed with 354).
- Result: sprite diagrams are crisp at natural size, BUT the user still finds the overall sizing/fonts
  wrong — so the fix is incomplete. Open questions the pass must settle **by eye, with the user**:
  - Is the 300px boost for pure-vector plantuml (sequence/class) the right target, too big, or too small?
  - Are the natural-size sprite diagrams now too SMALL (cloudinsight 87px, kubernetes 104px)?
  - Fonts: are labels too large/small relative to the diagram + the surrounding prose?
  - Is this plantuml-only, or do other renderers (mermaid/graphviz/flowchart/…) have the same "wrong size"
    feel? (mermaid/graphviz are deliberately intrinsic-size per an earlier "za duże" call — revisit.)

## How to do it (don't guess — measure + show)
- Use the **`vmarkd-visual-debugging`** skill: screenshot the real-VS-Code render, measure intrinsic vs
  rendered dims, iterate. After EACH change: rebuild → **package + install the VSIX + BUMP THE VERSION**
  (a same-version reinstall lets the editor keep a stale webview — see below) → ask the user to reload and
  judge. Show partial results and pause for the user's eye (they steer sizing).
- Candidate levers: the `min-width` boost value + scope; a `max-width`/`max-height` cap; a per-family
  scale; font-size relative to the diagram; whether to inject a PlantUML `scale`/`skinparam dpi` for the
  icon libs. Decide WITH the user, don't unilaterally pick.

## Process gotcha that wasted time here (record so it isn't repeated)
- **Local VSIX iteration MUST bump the extension version.** Installing the same version (1.2.0 → 1.2.0)
  over a running editor let VS Code keep a stale extension host / restored webview, so rebuilt changes did
  not show and looked like render bugs. `main.js` is content-hash cache-busted, but the extension host
  itself needs a genuine version change to refresh reliably. Bumped to 1.2.1 to force it.

## Step 1 (baseline measurement) — harness BUILT, baseline INCOMPLETE (2026-07-23)

Scope decided with the user: **all renderer families**, not plantuml-only.

Built (both kept, they are the tool for the whole pass):
- `test/vscode-e2e/fixtures/diagram-sizing-audit.md` — one representative block per family (13),
  with BOTH PlantUML cases side by side (pure-vector + `!include <k8s/…>` sprite) and a prose
  paragraph as the font reference.
- `test/vscode-e2e/diagram-sizing-audit.spec.ts` — per diagram: intrinsic (`viewBox`) vs rendered
  dims, scale factor, % of column, label `<text>` font sizes vs prose font size, sprite presence.
  Writes `tmp/355-sizing/{baseline.json,baseline.txt,trace.log}` + a page screenshot. Asserts only
  that a render happened — it must not fail on a value the user is still judging.
  `VMARKD_AUDIT_FIXTURE` swaps the corpus; `VMARKD_AUDIT_SHOTS` re-enables per-family shots.

**Gap found in the existing net:** `test/vscode-e2e/fixtures/all-renderers.md` — the corpus behind
`diagram-width.spec.ts` — contains only ONE PlantUML block, a pure-vector sequence. There is no
sprite/icon-library diagram in it at all, so the sizing regression net has NEVER covered the
`<image>`-sprite case that task 354 split off and that triggered this task.

### BASELINE (measured 2026-07-23, real VS Code, column 545px, prose font 14px)

| family | intrinsic | rendered | scale | % of column | label font | ON-SCREEN font |
|---|---|---|---|---|---|---|
| **plantuml vector** | 109x150 | 300x413 | **2.75x** | 55% | 13/14 | **~36-38px** |
| plantuml sprite | 316x232 | 316x232 | 1.0x | 58% | 12/16 | 12-16px |
| **smiles** | 148x148 | 305x305 | **2.06x** | 56% | 14.7 | **~30px** |
| mermaid | 424x85 | 424x85 | 1.0x | 78% | — | — |
| **graphviz** | 333x44 | 444x59 | **1.33x** | 81% | 14 | ~19px |
| d2 | 116x379 | = | 1.0x | 21% | 14.7 | 14.7 |
| nomnoml | 178x240 | = | 1.0x | 33% | 14.7 | 14.7 |
| flowchart | 179x412 | = | 1.0x | 33% | 14 | 14 |
| vega-lite | 244x160 | = | 1.0x | 45% | 14.7 | 14.7 |
| wavedrom | 400x60 | = | 1.0x | 73% | 14.7 | 14.7 |
| abc | 403x108 | = | 1.0x | 74% | 14.7 | 14.7 |
| echarts / markmap / mindmap | — | 545x* | 1.0x | 100% | — | — |

**Three findings:**
1. **THREE families are upscaled; everything else renders 1:1.** plantuml-vector at **2.75x**,
   smiles at **2.06x**, graphviz at **1.33x** — the last despite `main.css` describing graphviz as
   left at intrinsic size, so that comment is now wrong. The scale multiplies the LABELS too:
   PlantUML's 13-14 unit labels land on screen at ~36-38px against 14px prose. That is the measured
   content of "za duże / porozciągane" — it is not a matter of taste, it is 2.5x.
2. **Both upscales come from rules written as a LIMIT but acting as a TARGET.** `min-width:300px`
   lifts plantuml from 109px to 300px; smiles' `max-width:56%` becomes the width (305px) because the
   smiles SVG fills its box, so the cap sets the size instead of bounding it. Neither rule was meant
   to enlarge anything.
3. **Column fill has no common measure at all** — 21% (d2), 33% (nomnoml, flowchart), 45% (vega),
   55-58% (plantuml), 73-76% (wavedrom, abc, mermaid), 100% (echarts, markmap, mindmap). Two
   diagrams of similar content get different sizes purely because a different engine drew them.
   This is the structural problem a coherent model has to replace.

**Blocker (environment, not code): the machine is out of memory.** The runs that "hung" were VS
Code being **OOM-killed** by the kernel mid-test (`oom-kill: task=code` in `dmesg`; 14 Gi of 15 Gi
used, ~400 MB free — many long-lived python/uv, claude and vscode-server processes, no single hog).
Symptom is misleading: the runner keeps waiting on a process the kernel already killed, so the
failure never reaches the reporter and the run just looks frozen. (Every "hang" was also cut by an
external `timeout`, so a separate teardown-stall bug was NOT isolated — assume the same OOM until
proven otherwise.) Hence the spec writes its trace to a FILE (`tmp/355-sizing/trace.log`); piped
stdout is buffered and lost when the runner is killed.
Re-run the audit with memory freed before drawing any sizing conclusion.

Also note `test.setTimeout(300_000)` in the spec: the config's 90s default is sized for
single-diagram smokes and expired before the measurement ran.

### The "editor never mounts" hang was a SPEC bug, not a product bug (resolved)

A run whose diagram set happened to be small appeared to hang: `div.vditor` existed but
`.vditor-ir` "never appeared" and the wait expired. It looked like a render-blocking bug in a
specific renderer (graphviz reproduced it every time, mermaid never did).

**Root cause: the wait locator.** Vditor creates ALL FOUR mode elements up front —
`.vditor-wysiwyg`, `.vditor-sv`, `.vditor-ir`, `.vditor-preview` — and shows one. A
`.vditor-ir, .vditor-wysiwyg` locator with `.first()` resolves in DOM order to `.vditor-wysiwyg`,
which is the HIDDEN one, and `waitFor`'s default state is `visible` — so it waited out the full
timeout on an element that is never shown. It passed sometimes only because it is a RACE: a run
that reaches `waitFor` before Vditor has created the other mode elements matches `.vditor-ir` and
succeeds. Nothing was wrong with graphviz, the fixture, or the editor; the diagnostic dump showed
`.vditor-ir` present in `.vditor-content` all along.

**Fix:** wait for the ACTIVE mode element (`.vditor-ir`), as `diagram-width.spec.ts` already did —
which is exactly why that spec never hit this. **Lesson for any real-VS-Code spec: never wait on a
multi-mode selector with `.first()`; Vditor's inactive modes are present-but-hidden.**

### SEPARATE, REAL infra bug — VS Code 1.130.0 makes the whole suite unreportable (FIXED)

Distinct from both the OOM and the locator bug above, and it affects EVERY spec in
`test/vscode-e2e/`: no run in this whole investigation ever printed a pass/fail line, even when the
test body finished in 26s with 230s of slack. Evidence: 90s after the body completed, the VS Code
process was still alive. `vscode-test-playwright@0.0.1-beta2` tears the editor down with
`await electronApp.close()` in a fixture declared `{ timeout: 0 }` — on VS Code **1.130.0** that
close never returns, so the runner blocks forever and emits no verdict. It presents as "the spec I
am running hangs", which is what sent this investigation down the graphviz path.

Confirmed by A/B: the same spec on 1.130.0 must be killed externally with no result; on **1.129.0**
it reports `1 passed` in 40s. **Fix applied:** `playwright.config.ts` now pins
`vscodeVersion` to `1.129.0` instead of `'stable'` (the nightly still overrides via
`VMARKD_VSCODE_VERSION`). Verified: `diagram-width` + `plantuml-sprite-size` → `2 passed (42.2s)`,
exit 0. Re-test `'stable'` when a newer VS Code or a vscode-test-playwright release lands.

### Regression guard added for the sprite case

`plantuml-sprite-size.spec.ts` + `fixtures/plantuml-sprite-size.md` close the hole found above: a
bitmap-sprite PlantUML diagram must never be scaled above its intrinsic size (measured: sprite
316x232 → 316x232, 1.00x; vector 122x140 → 300x344, 2.46x). Deliberately does NOT assert the boost
value or the vector scale — those are what this task is re-deciding by eye, and pinning them would
cement a number under review.

## Related
Task 354 (added the stdlib icon libs + the `:has(image)` sizing scope), the `diagram-fill-width` memory
(natural-size, shrink-only direction), `diagram-width.spec.ts`. Files: `media-src/src/main.css`
(search `min-width`, `.language-plantuml`), the per-renderer sizing rules around it.
