# Task 478 — Convert the 8 remaining misrouted `main.css` overrides to source patches

**Status:** 🟡 IN PROGRESS (2026-08-01) — items 1-5 (7 of the 8 rule blocks) converted and
build-proven (anchor-throw verified, red-then-green per item). **Item 6 (the table pair)
deliberately NOT done**, per this task's own instruction — its own pass, own visual-golden
coverage. **Impact:** 🟢 no production-visible change (verified — see "Findings" below for the one
test-fixture-only side effect, fixed and documented, not absorbed silently).
**Origin:** split out of task 464 on 2026-07-31, task 464's audit.
**Related:** ADR-0003 (routing rule), ADR-0004 (`patchVditorIndexCss`), task 464 (the audit and the
two conversions already done), task 402.

## Why this is a separate task

Task 464 audited all 115 `.vditor*` rule blocks in `main.css` and found **10** that genuinely
violate ADR-0003's routing rule (they counter a Vditor-authored declaration by out-specifying it or
by winning on load order, rather than fixing Vditor's rule at the source). It converted **2** and
deferred **8**.

The deferral was the right call and should not be undone in one sweep: the two converted rules were
single-declaration, unconditional and provably pixel-identical. The remaining eight are not
uniform — they range from a one-line cosmetic nudge to a pair that drives table layout on every
theme. **Convert them individually, each with its own verification.** The ordering below is by
ascending risk deliberately; do them in that order so the cheap ones build confidence in the
mechanism before the expensive one.

## The rule that makes this non-trivial — read before touching anything

From 464's own hard-won lesson (a dark-mode regression that shipped and was caught by an existing
net):

> **Before deleting a `main.css` override, grep for the property in `content-theme/{light,dark}.css`
> as well as `index.css`.** A conversion is only safe once *every* Vditor declaration of that
> property is accounted for — and check light and dark separately, because the two content themes do
> not carry the same rules.

`html-builder.ts` links the content theme **after** `index.css`/`main.css`, so an equal-specificity
rule in `dark.css` beats a patched `index.css` rule. That is exactly how conversion #2 in 464
silently reverted the IR link colour in every dark session while light mode looked perfect. The
existing `patchContentThemeIrLink()` in `build.mjs` is the template for handling that case.

## The eight, ascending by risk

- [x] **1. `.vditor-tip__close` position** (was `main.css:1750-1753`) — `top:4px;right:8px` vs
      Vditor's `top:-7px;right:-15px`. **CONVERTED** — patched onto Vditor's own rule
      (`build.mjs patchVditorIndexCss`, patch 4). Single declaration, no `!important`, exactly as
      described. Regression net: `content-theme.spec.ts` "`.vditor-tip__close` sits inside the
      corner…" (drives the persistent tip via `vditor.tip(html, 0)`, the same call the About-dialog
      toolbar handler makes).
- [x] **2. `.vditor-outline` width** (was `main.css:1471-1475`) — `200px` default vs Vditor's
      `250px`. **CONVERTED** — patch 5. `position: relative; flex-shrink: 0` on the same selector
      never collided with a Vditor declaration (Vditor's own `.vditor-outline` rule has neither), so
      they stay a (smaller) main.css rule — not a scope cut, those two properties were never part of
      the ADR-0003 violation. Regression net: `outline.spec.ts` "`.vditor-outline` width defaults to
      200px…" (a page where `--me-outline-width` is never set, so the fallback in `var(…, 200px)` is
      what's actually read — the pre-existing 321px-explicit test can't cover that).
- [x] **3. link-ref-defs marker `content`** (was `main.css:1367-1371`) — relabels Vditor's
      `.vditor-ir div[data-type="link-ref-defs-block"]:before` marker from `'"A"'` to `'↩'`.
      **CONVERTED** — patch 6. Verified shape-1 win, (0,3,2) vs Vditor's (0,2,2), no `!important`,
      single declaration exactly as described; `position: relative; top: 2px` on the same selector
      never collided (Vditor's rule declares neither), so they stay main.css. Regression net:
      `content-theme.spec.ts` "IR link-ref-defs-block marker reads the return arrow…".
- [x] **4. HR margin / Edit↔Preview parity** (was `main.css:443-446`) — **CONVERTED, but not as
      described — see "Findings" below.** The rule that actually governs the EDITING surface is
      Vditor's `.vditor-ir hr`/`.vditor-wysiwyg hr` (inline-block, 12px), not `.vditor-reset hr`
      (24px) as this task and 464 both said; patching `.vditor-reset hr` would have been a no-op on
      the surface the override was written for. Patched the two rules that actually collide — patches
      7+8. Pixel-identical (1.5rem is the literal main.css already used). The code-block half
      (`main.css:454-456`/now the sole remaining rule in that block) still targets a wrapper `div`
      Vditor's rule never reaches and stays category 2, untouched, exactly as instructed. Regression
      net: `content-theme.spec.ts` "IR `hr` renders block/24px…".
- [x] **5. Editor font family/size** (was `main.css:1034-1040` + `1041-1050`) — task 43's rules
      making the content follow VS Code's editor font instead of Vditor's hardcoded `16px` +
      GitHub stack. **CONVERTED, but split — see "Findings" below**, deliberately against this
      task's own "do not split the pair" instruction, with the specificity math to back it: only the
      unconditional `.vditor .vditor-reset` rule (0,2,0) ever collided with a Vditor declaration
      (Vditor's own `.vditor-reset` base rule, 0,1,0) — patched onto it directly, `!important`
      preserved (patch 9; another main.css rule relies on out-ranking it at the `!important` tier).
      The named-theme bridge (`body.markdown-body .vditor .vditor-reset`, 0,3,1) never collided with
      a Vditor declaration, only with the rule just patched, and (0,3,1) beats (0,1,0) exactly as it
      beat (0,2,0) — needs no change, stays main.css (category 3, mode-gated on `body.markdown-body`,
      same bucket as the 7 other mode-gated rules 464 already found and kept). Regression net:
      `outline.spec.ts` "`.vditor-reset` font-family follows --vscode-editor-font-family…".
- [ ] **6. `.vditor-reset table` + `table td/th`** (`main.css:1193-1200` + `1202-1211`) — the big
      one. `display:table` vs Vditor's `display:block`; `white-space:normal;word-break:break-word`
      vs Vditor's `nowrap`/`normal`. Exact selector match, `!important` on both, multiple properties,
      and it drives table column-fit for **every table in every content theme**. 464's recommendation
      stands: **its own pass with its own visual-golden coverage**, not folded in with the others.
      **Deliberately NOT done this pass** — explicitly out of scope per the delegation instruction
      for this session; the blast radius and the task's own ordering both say it wants a dedicated
      pass, not to be folded in behind five much cheaper conversions.

*(That is 6 bullets covering the 8 deferred rule blocks — items 5 and 6 are each a pair of blocks
that must move as a unit; 464's "8" counts blocks, this list counts changes. Item 5 turned out to be
a pair that must NOT move as a unit — see "Findings".)*

## Findings (2026-08-01) — two corrections to how 464/478 characterized items 4 and 5

**Item 4:** main.css's own comment on the rule (still accurate) said the IR value is `margin:12px 0`
+ `display:inline-block` and named `.vditor-ir hr` as what it out-ranks — but this task's bullet list
(copied from 464) said the colliding Vditor rule was `.vditor-reset hr { margin:24px 0 }`. Checked
Vditor's `index.css`: **three** `hr`-adjacent rules exist — `.vditor-reset hr` (906, 24px, no
`display`, matches on the PREVIEW pane where there's no `.vditor-ir`/`.vditor-wysiwyg` ancestor) and
`.vditor-ir hr` / `.vditor-wysiwyg hr` (1449/1625, inline-block, 12px, load LATER in the same file).
On the editing surface both `.vditor-reset hr` and `.vditor-ir hr` match at equal specificity
(0,1,1); the later one wins the tie, so `.vditor-ir hr`/`.vditor-wysiwyg hr` are what the editing
surface actually renders — and what main.css's override actually had to beat. Patching
`.vditor-reset hr` per the task's literal wording would have been a no-op: removing the main.css
override afterward would have reverted the editing surface to 12px/inline-block, a real regression.
Patched the two rules that actually collide instead; `.vditor-reset hr` (and its
background-color-only companion in `content-theme/{light,dark}.css`) is untouched, so Preview keeps
its 24px exactly as before — pixel-identical on both surfaces, just a different (correct) patch
target.

**Item 5:** verified via `advisor` before implementing, then checked the specificity math directly.
The bridge rule (`body.markdown-body .vditor .vditor-reset`, 0,3,1) was bundled with the unconditional
rule as "two layered rules that must move together" — but the bridge rule was NEVER what ADR-0003
calls misrouted: it never collided with anything Vditor declares (Vditor has no
`body.markdown-body`-gated rule), only with vMarkd's OWN unconditional rule, and it out-ranks that
rule by specificity alone regardless of which file the loser lives in. Moving the bridge rule into
`index.css` would have been actively wrong: Vditor's own `.vditor-reset` has no `body.markdown-body`
gate, so folding the bridge into it would apply the GitHub sans stack in `auto` mode too, a real
behaviour change. Split instead: the unconditional rule moved (genuine ADR-0003 violation), the
bridge rule stayed (category 3, mode-gated, same bucket as 464's other 7 mode-gated rules).

**A third, narrower finding — test-fixture-only, not production, with a false lead and a real root
cause (2026-08-01):** patching Vditor's own `.vditor-reset` base rule for item 5 makes it apply
UNCONDITIONALLY (any `.vditor-reset`, anywhere), whereas the main.css rule it replaced required a
`.vditor` ancestor. In production `.vditor-reset` is never rendered without a `.vditor` ancestor
(verified — Vditor's own mount always wraps in that class, and `--vscode-editor-font-family` is a
VS Code-injected webview variable present on every webview root regardless), so this changes
nothing for a real user's rendered pixels — the property VALUES are identical before and after,
just relocated. It DID expose one thing: `media-src/e2e/callouts-harness.ts` is a synthetic
unit-DOM fixture that builds a bare `<div class="vditor-reset">` with NO `.vditor` wrapper
(deliberately minimal, for testing `applyCallouts` in isolation) — the one place in the whole tree
with an orphan `.vditor-reset`. It was invisible to the OLD `.vditor .vditor-reset` rule and is now
reached by the patched unconditional one; with no `--vscode-editor-font-family`/`--me-font-size` set
there, the (correctly-preserved, `!important`, no-fallback) `var()` resolved to the browser's UA
default (Times New Roman) instead of Vditor's own font — a real, if test-fixture-only, pixel change,
caught by `test:visual`'s `callout-note.png` golden.

**First fix attempt was wrong and made it worse, caught by the lead, not self-caught.** Wrapped the
fixture's content in an actual `<div class="vditor" style="--vscode-editor-font-family:…">` to match
production's DOM shape. This "fixed" the height (58→64px, the font-size half) but left the golden
**1226px wide vs HEAD's 1228px** — a genuine 2px shrink the lead measured and flagged, correctly
refusing to accept a silently-rebaselined golden without an explanation. Root-caused it: `.vditor`
itself carries Vditor's own structural CSS (`index.css:513`, `border: 1px solid …; box-sizing:
border-box`) — wrapping in that class for the first time pulled in a 2px border that had never been
part of this fixture, shrinking the content box. **This was entirely a side effect of my fixture fix
reaching for the wrong tool (a real `.vditor` class) to solve a narrower problem (two missing CSS
custom properties) — nothing to do with item 5's conversion itself,** which only relocates
font-family/font-size, never touches `border`/`box-sizing`. Proved this empirically before
concluding: swapped the golden back to HEAD's 1228×64 (`git restore --source=HEAD`), reran
`test:visual` **without** `--update-snapshots` against the corrected fixture (properties set
directly on `#app` via `style.setProperty`, no `.vditor` class at all) — the actual screenshot came
back **1228×64**, matching HEAD's dimensions exactly; the only residual diff was glyph pixels
(Consolas vs Vditor's default sans stack), zero layout shift. **Confirmed: item 5 is pixel-identical
in production, full stop — the 2px was 100% my own fixture-fix mistake, corrected, not a defect in
the conversion.** Regenerated the golden from the corrected fixture, re-verified 4/4 stable across
two independent runs. Confirmed no other harness or golden was touched — grepped the whole tree for
`vditor-reset` outside a `.vditor`/`.vditor-ir`/`.vditor-wysiwyg` ancestor and this fixture was the
only hit.

**Also found and ruled out during item 4/5 investigation:** a chromium-harness spec
(`media-src/e2e/wiki-keyboard-focus.spec.ts`, 4 tests, Tab-to-a-wiki-chip) fails consistently (12/12 across
`--repeat-each 3`) — but reproduced **identically against the pre-task-478 file versions** (swapped
in via `git show HEAD:<path>`, not `git checkout`, then restored), so this is pre-existing breakage
on this branch, unrelated to any of the five conversions. Not investigated further — out of this
task's scope — but flagged here so it isn't mistaken for something this session introduced.

## Verification (per item, not once at the end)

- [x] `node build.mjs` green, and each new patch's anchor assert **proven to throw on drift** by
      corrupting the anchor (ADR-0004's rule; 464 did this for both of its conversions). Done for
      all 6 new anchors (items 1/2/3, item 4's two `hr` rules, item 5) — each corrupted individually
      in `build.mjs` (not the built CSS, which `syncVditorAssets()` would just re-copy over),
      confirmed the exact `[index-css] … anchor not found …` throw, restored, confirmed clean again.
- [x] Patch idempotent across two consecutive builds — the vendor sync re-copies the Vditor assets
      each build, so a patch must not be applied twice to already-patched output. Verified (two
      consecutive `node build.mjs` runs, same summary line, same output).
- [x] `content-theme/{light,dark}.css` checked for the same property, per the rule above. All 5
      items checked: only item 4's `hr` overlaps at all (`background-color` only, in both light and
      dark — no `margin`/`display`, so no collision). Items 1/2/3/5 have no matching selector in
      either file. Also checked the 5 named-theme files (`media/markdown-themes/*.css`, load AFTER
      content-theme) for the same properties, since those load even later — same result, no
      collisions on items 1-4; item 5's two `vscode-*-2026.css` files DO declare
      `body.markdown-body .vditor .vditor-reset` font-family (their own, deliberate, pre-existing
      override of the main.css bridge rule — untouched, see Findings) but nothing on the patched
      base `.vditor-reset` rule itself.
- [x] `xvfb-run -a npm run test:visual` — and **confirm the goldens actually look at the changed
      pixel** rather than merely passing. None of the 4 existing goldens cover items 1/2/3/4/5 (none
      render the About-dialog close button, outline panel, link-ref-defs marker, or a bare `hr`/prose
      paragraph) — added a computed-style assertion per item instead: `content-theme.spec.ts` for
      items 1/3/4, `outline.spec.ts` for items 2/5 (reusing its existing `.vditor-outline`/
      `.vditor-reset` harness). Each proven with a red-then-green run (patch commented out in
      `build.mjs` → rebuild → assertion reports Vditor's ORIGINAL value → restore → rebuild → green).
      The 4 existing goldens DID catch a real, if narrow, side effect on item 5 (Findings above,
      `callout-note.png`) — fixed at the fixture, regenerated, re-verified 4/4 stable across two runs.
- [x] Item 6 additionally: a dedicated table-rendering golden across content themes before/after. **N/A
      — item 6 not attempted this pass**, per its own instruction (own pass, own coverage).

## Note

None of these are user-visible defects today. The cost of leaving them is the one ADR-0003 names:
an override leaves Vditor's wrong rule in place **plus** a rule of our own to maintain, and the next
Vditor bump can change the thing being overridden without anything failing loudly.
