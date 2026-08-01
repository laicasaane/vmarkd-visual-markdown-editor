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

## Step 2 — PlantUML upscale REMOVED (2026-07-29) ✅

User reported the fonts again, this time on a class and an activity diagram ("za duże czcionki"),
which is finding #1 above with concrete cases.

Measured first (offline probe against the SAME bundled TeaVM engine, `tmp/puml-font/probe.mjs` —
throwaway): the engine's own SVG is `106x221` for the class diagram (labels 14/13px) and `147x248`
for the activity one (labels 12/11px). The proportions of the on-screen render match that SVG
exactly, so this was never a font-metric mismatch — the whole drawing was being scaled: `min-width:
300px` + `height: auto` = **×2.83** (class) and **×2.04** (activity), i.e. ~40px glyphs against 14px
prose.

- [x] Decision (with the user): **remove the boost outright** — PlantUML's native 11-14px text
      already matches the page's body text, so natural size IS the readable size, same as
      mermaid/graphviz. (Options offered: remove / lower to 200px / cap the upscale at 1.5x in JS.)
- [x] `main.css`: dropped the `.language-plantuml > svg:not(:has(image)) { min-width: 300px }` live
      rule **and** its `.vmarkd-stale-overlay[data-lang="plantuml"]` mirror (the overlay needed the
      bridge only to reproduce the boost; the generic `max-width:100%; height:auto` matches natural
      size on its own). Both comments now say why it must not come back.
- [x] Guards updated + run in real VS Code: `plantuml-overlay-size.spec.ts` now asserts scale ≈ 1.0
      against the `viewBox` (was: "the boost engaged, ≥299px") plus the unchanged overlay==live
      invariant → measured `104px -> 104px`; `plantuml-sprite-size.spec.ts` gained the same
      no-upscale assertion for the pure-VECTOR diagram (was deliberately unasserted while the number
      was under review) → `122px -> 122px` (was 300px, 2.46x).
- [x] `diagram-visual.spec.ts` plantuml goldens regenerated for all 5 themes; `github-dark` eyeballed
      (sequence diagram now 545px-column-relative natural size, labels ≈ prose).
      ⚠ `--update-snapshots` runs the WHOLE spec, so it also rewrote 12 goldens
      (wavedrom ×4, smiles ×4, vega ×2, vega-lite ×2) that a `.language-plantuml`-scoped CSS change
      cannot affect — those were reverted with `git checkout`. It also overwrote the 4 snapshots that
      were already dirty in the working tree before this session (smiles/vega/vega-lite/topojson
      material-dark) with fresh renders; topojson's landed byte-identical to HEAD, so that one
      uncommitted version is gone. **Regenerate goldens per-engine or revert the collateral — the
      spec header's "never reflexively" applies to the blast radius too.**
- [x] `npm test` (1946), `test:vscode:fast` (39) green.

## Step 3 — bigger drawing, SAME text size (2026-07-29) ⛔ REVERTED by step 4, keep for the finding

Follow-up call from the user on step 2's result: *"rozmiar natywny, powiększ o 50% ale czcionka musi
zostać wielkość jak jest"*. PlantUML's geometry is text-driven, so this is not a scale — it is a
decoupling of the two.

**Mechanism (one pair, both halves in `plantuml-render.ts`):** the engine LAYS OUT at
`root { FontSize 9 }` (injected with the palette `<style>`), and `scalePumlSvg` then multiplies the
finished SVG's `width`/`height` by `PUML_SVG_SCALE = 1.5` (viewBox untouched). Net on screen: labels
9 × 1.5 = 13.5px, i.e. the engine's old 14/13/12/11 — while padding, node/rank separation, stroke
widths and arrowheads all grow 50%. Measured: class 106x221 → 83x204 → **124x306**; activity
147x248 → 130x240 → **195x360**; live spec reading `naturalW 84 → liveW 126, maxFontPx 13.5 vs 14px
prose`.

**Rejected alternative, recorded so it isn't retried:** scale the SVG and shrink `font-size` on the
rendered `<text>` instead. It gives an exact +50% canvas, but the engine has already PLACED every
label for its original width — shrinking glyphs afterwards leaves centred labels hanging ~8-16px
left of their box, and re-centring them ragged-indents the left-aligned rows (class attributes).
Letting the engine lay out is what keeps alignment exact. Cost accepted with the user: the font
HIERARCHY collapses to one size (14/13/12/11 → all 9).

**Honest limit, stated to the user before implementing:** boxes do NOT grow 50% — their width is
mostly text, which is unchanged. Class 106 → 124px (+17%), activity 147 → 195px (+33%). The full 50%
lands in the gaps and padding. A literal +50% box at unchanged text size would be pure padding.

- [x] Pairing is enforced by `ownTheme`: a self-themed / stdlib (C4, AWS, k8s) diagram gets neither
      the reduced font nor the scale, so its labels can't inflate. `scalePumlSvg` is idempotent and
      no-ops without a viewBox.
- [x] Guards: 4 unit tests on `scalePumlSvg` + one asserting the `FontSize 9` declaration (they fail
      independently, which is the point — either half alone is the bug). `plantuml-overlay-size.spec`
      now asserts the thing the user actually judges — **on-screen label px ≤ prose + 2** (13.5 vs 14)
      — instead of a scale number, skipping the class TYPE ICON (a single monospace letter PlantUML
      sizes outside the root font). `plantuml-sprite-size.spec` asserts the counter-case in the same
      run: vector 1.5x, sprite 1.0x.
- [x] plantuml goldens regenerated (5 themes), non-plantuml collateral reverted, `github-dark`
      eyeballed. `npm test` 1951 ✓.
- [x] ⚠ **Cache note:** the render-cache key (`hashOf`) folds in `lang/version/themeKey/engineFragment/
      source` — plantuml has NO engine fragment and the layout font is not part of `themeKey`, so a
      sizing change like this is invisible to the key. Old entries only stop matching because the
      extension `version` is in it. Any future sizing tweak MUST ship with a version bump (packaged
      as 1.2.12 here) or documents will paint the previous size from cache.

## Step 4 — SETTLED: uniform 14, no scale (2026-07-29) ✅

Step 3 shipped as 9/1.5, was re-tuned to 7/1.7 on the user's call ("font za duży a miał zostać
mniejszy"), and BOTH came back with the labels **overflowing their shapes** in the user's editor —
text drawn ~2.1x wider than the box the engine laid out for it.

**It does not reproduce here.** Measured in the real webview on VS Code 1.129 **and** 1.130 (the
user's version), via a throwaway probe spec: `computed font-size` == the attribute (7px), and the
engine's own geometry fits it exactly (box 51.13 units, text 31.1 + 2x10 padding). The engine SVG is
internally consistent; something in that environment draws it differently.

**Reading of the evidence** — the overflow tracks how far BELOW ~14 the injected font is, across all
four of the user's screenshots: 14 fits, 12/11 grazes the hexagon, 9 clips, 7 spills badly. That is
the signature of a **~14px minimum font size** on that machine: a smaller `font-size` is drawn at ~14
anyway, while the layout was computed for the small one. Not confirmed at the source (no setting was
located), so it stays a reading — but it is the only one consistent with all four.

Consequence: the "lay out small, scale up" lever is unusable there, and PlantUML offers no
substitute — `skinparam padding` is rejected outright ("Please use CSS style instead") and the modern
style's `Padding`/`Margin` plus `nodesep`/`ranksep` move the layout by a few percent (measured, not
assumed). "Geometry +50% at unchanged text size" is therefore **not achievable** for that
environment; the user settled for the correct render instead ("niech zostanie jak jest teraz").

- [x] `PUML_LAYOUT_FONT_SIZE = 14`, `PUML_SVG_SCALE = 1` (both exported, so the guards assert the
      shipped pair instead of a copied number). Uniform 14 means no size sits below the suspected
      floor, so nothing can overflow — this also fixes the native 11px activity labels grazing their
      hexagon, visible in the user's very first screenshot.
- [x] `scalePumlSvg` kept (it is the other half of the pair) and now also **pins each label's size as
      an inline style** — `font-size` on `<text>` is a presentation attribute, i.e. bottom of the
      cascade, so any author rule that matches SVG text silently beats it. That rules out the second
      candidate cause of the overflow; a minimum-size floor no cascade trick can defeat.
- [x] Guards retuned to the settled render and run: `plantuml-overlay-size` → `naturalW 104, liveW
      104, maxFontPx 14 vs 14px prose, scale 1.00`; `plantuml-sprite-size` → vector 125→125,
      sprite 316→316. 6 unit tests (scale from the exported constant, ownTheme skip, idempotence, no
      viewBox, inline-style pinning, the FontSize declaration). `npm test` 1952 ✓.
- [x] plantuml goldens regenerated (5 themes), collateral reverted, `github-dark` eyeballed.
- [x] Throwaway probe spec deleted. Measurement harness kept at `tmp/puml-font/probe.mjs`.

**If this is revisited:** get the floor confirmed first (a `getComputedStyle` reading from the user's
own editor on a `font-size="7"` text, or their Chromium/OS minimum-font-size setting). Every sizing
idea that renders text below 14 units is dead until that is known, and rendering the diagram to a
bitmap is the only lever that side-steps it entirely.

## Step 5 — post-render theming pass turned OFF (2026-07-29, user's call)

`PUML_POST_RENDER_THEMING = false` in `plantuml-render.ts`. Gated at the CALL SITES (the render path's
`themeOnce`, and `backSpritesIn` in `render-cache-client.ts`), so every mechanism and its unit tests
stay intact and flipping the flag back to `true` restores the old behaviour with no other edit.

What is off: `themePumlSvg` in full — baked foreground -> `currentColor`, box fills -> tint,
transparent bg-rect removal — plus `adaptBakedColours` (the dark adaptation of a baked light-page
palette) and, driven by it, the bitmap-sprite ink backing (`backSprites`/`fillSpriteShape`) and its
post-cache re-apply. Untouched: the pre-engine `PUML_MODE` injection (task 384/431) and the palette
`<style>` injected at SOURCE, which is what colours our own (non-self-themed) diagrams.

Consequence, stated so it isn't mistaken for a regression: **a stdlib / self-themed diagram (C4, AWS,
k8s, domainstory) now renders exactly as the engine drew it — its light-page palette survives on a
dark theme.**

⚠ **Three real-VS-Code guards are RED by construction** — they assert the mechanism this flag
disables, so they were left failing rather than rewritten to match a state under review:
- `plantuml-native-dark.spec.ts` — "mode-aware libs keep their own dark palette; mode-blind libs keep
  the compensation" (the compensation is gone).
- `plantuml-stdlib.spec.ts` — "stdlib diagrams are legible on vscode-dark-2026" and "on github-dark"
  (white cards survive now).
- `diagram-visual.spec.ts` plantuml goldens on the dark themes were deliberately NOT regenerated.
Decide with the user: restore the flag, or retire/re-scope those guards.

## Step 6 — the font floor extended to the STDLIB libraries (2026-07-29) ✅

User report after step 5: on the icon diagrams the text **overflows the card** («AzureVirtualMachine»
clipped at the border, `[Standard_D2s_v3]`, «namespace», «KubernetesSvc»). Same root cause as step 4,
on the diagrams our layout font never reached: they theme themselves, so `plantumlStyleBlock` skips
them and the engine lays out with the library's sizes.

Measured from a real render (throwaway probe, since deleted): the overflowing lines are all
**font-size 12**, the ones that fit are 16 — exactly the ~14 floor again.

Three declaration families had to be covered, each found by measuring after the previous fix failed:
1. `injectStdlibFontFloor` — C4-PlantUML declares `!$STEREOTYPE_FONT_SIZE ?= 12`, `$TECHN_FONT_SIZE`,
   `$ARROW_FONT_SIZE` and interpolates them into creole `<size:…>` tags, so NO textual rewrite of the
   expanded source can reach them. Prepended `!global` before expansion (same trick as `injectPumlMode`),
   so the `?=` defaults never apply. azure/k8s/awslib pull C4 in transitively.
2. `raiseStdlibFontFloor` — literal `FontSize n` in the expanded source, including the COMPOUND
   spellings (`rectangleStereotypeFontSize`; an earlier `\bFontSize` anchor silently skipped every one
   of them), plus the LEGACY `!define TECHN_FONT_SIZE 12` that azure/awslib use for the [technology]
   line — a different preprocessor namespace, which `!global` cannot reach. `FontSize 0` is excluded:
   it is awslib's "no text" marker, not a small size.
3. `injectPlantumlTheme` now gives a self-themed source a size-only `<style> root { FontSize 14 }`.
   Colours are still untouched (ADR-0006), but the engine's OWN defaults — arrow labels at 13 — no
   longer sit below the floor.

Verified by re-probing the real webview after each step: C4/AWS/Azure/k8s blocks now emit only 14 and
16, and the layouts widened to match (azure card 160 -> 181 units, C4 409 -> 421 tall).

**Known residual:** one `edgy` micro-label ("Brand") still renders at **5**. That library declares no
font sizes at all, so none of the three levers reaches it, and raising a deliberately tiny facet label
is not obviously right. Left alone rather than guessed at.

- [x] 6 unit tests on the two floor functions + the self-themed injection (the three "source untouched"
      tests were rewritten to assert what now holds: colours untouched, size block added). 1957 ✓.
- [ ] The three guards listed in step 5 are still red — they assert the step-5 flag's old behaviour.
      Re-run them once the flag question is settled; this step does not change that.

**Still open in this task** (unchanged by steps 2-6): smiles at 2.06x — the `max-width` cap acting as a
target — though task 397 has since re-decided it to 42%; graphviz at 1.33x while `main.css` claims it
is intrinsic; and finding #3, the missing common measure for column fill across families.

## Related
Task 354 (added the stdlib icon libs + the `:has(image)` sizing scope), the `diagram-fill-width` memory
(natural-size, shrink-only direction), `diagram-width.spec.ts`. Files: `media-src/src/main.css`
(search `min-width`, `.language-plantuml`), the per-renderer sizing rules around it.
