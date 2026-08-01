# Task 464 — Audit `main.css` for **specificity-based** Vditor overrides (the class task 402 didn't cover)

**Status:** ✅ DONE (2026-07-31) — the audit this task is named for is complete: all 115 `.vditor*`
rule blocks enumerated, classified against ADR-0003's routing table, and the per-category counts
recorded. 2/10 genuine category-4 conversions executed and build-proven (anchor-throw verified).
Verification closed by the lead: `test:visual` 4/4 and `test:vscode:fast` 39/39 (see Verification).

> **⚠️ 8 of the 10 misrouted rules were deliberately NOT converted** — this is a real scope
> reduction, not a completed conversion pass, and it is called out here so it cannot be read as
> "done and clean". They are listed and reasoned individually under "The 10 category-4 rules"; the
> blockers are blast radius (the table pair touches every table in every theme and wants its own
> visual-golden pass) and layered/user-setting-driven rules that must move together. **Follow-up:
> task 478.** Leaving them changes nothing visually — they are simply still misrouted.
**⚠️ One of the two executed conversions shipped a dark-mode regression — found and fixed 2026-07-31,
see "Conversion #2 was incomplete" below. Read it before converting anything else.** A regression net
for it already existed (`media-src/e2e/content-theme.spec.ts:901`) and caught it — confirmed
red-then-green the same day, see "Verification" below.
**Origin:** patch-vs-runtime audit 2026-07-30 (CSS axis surfaced by an independent Fable review).
**Related:** ADR-0003 (routing rule + the 2026-07-27 task-402 amendment), ADR-0004
(`patchVditorIndexCss`), task 402.

## Why this exists

ADR-0003's routing rule says: *prefer fixing Vditor's own rule at the source over a
higher-specificity override in `main.css` — an override leaves Vditor's wrong rule in place plus a
rule to maintain.*

Task 402's compliance audit (ADR-0003 amendment, 2026-07-27) checked that rule — **but only over
`!important` declarations**. It concluded "no misrouted `!important` found" and set a baseline of
1705 lines / 78 `!important`.

**An override does not need `!important` to violate the rule.** It only needs higher specificity. That
whole class was never audited, and it is invisible to task 402's method:

| measure | count (2026-07-30) |
|---|---|
| `main.css` lines | ~1850 |
| `!important` declarations | ~84 — **audited by task 402** |
| rules targeting a `.vditor*` selector | **~262 — never audited as a class** |

*(Counts include uncommitted in-flight a11y edits to `main.css`; re-measure on a clean tree.)*

## The instance that proves the class exists

`main.css:139-141` — and its own comment documents the trick:

```css
/* `.vditor-reset .vditor-ir__link` (0,2,0) out-ranks Vditor's `.vditor-ir__link` (0,1,0). */
.vditor-reset .vditor-ir__link {
  color: var(--vmarkd-link, var(--vscode-textLink-foreground, #4493f8));
  text-decoration: none;
}
```

No `!important`, invisible to task 402, and a textbook case of what the routing rule forbids.

### ⚠️ Do NOT fix this by redefining `--ir-bracket-color`

The tempting one-liner is to redefine Vditor's custom property. **Verified: that is broader than the
current override, not narrower.** `--ir-bracket-color` (defined `index.less:45` light `#0000ff` /
`:75` dark `#287bde`) has **three** consumers:

| consumer | selector |
|---|---|
| `_ir.less:78` | `.vditor-ir__marker--bracket` — the `[ ]` markers in IR |
| `_ir.less:130` | `.vditor-ir__link` — **the only thing we override** |
| `_sv.less:117` | `.vditor-sv__marker--bracket` — split-view brackets |

Redefining it would also recolour IR and sv bracket markers. **Correct shape: patch the *rule* in the
copied `media/vditor/dist/index.css` via `patchVditorIndexCss` (`build.mjs:344`)** — the same
mechanism that already rewrote WYSIWYG inline-code padding.

*(Whether the bracket markers **should** also take the link colour is a visual decision for the user,
not a side effect to ship silently. Ask before widening.)*

## Known items to fold in

- [x] `main.css:139-141` — `.vditor-ir__link` colour + underline → `patchVditorIndexCss`. **CONVERTED.**
- [x] `main.css:169-171` — `.vditor-reset pre > code { background-image: none }`, dropping Vditor's
      diagonal-hatch decoration. **CONVERTED.** Shape differs from the `__link` case: the selector is
      *identical* to Vditor's own (`vditor/dist/index.css:988`, `.vditor-reset pre > code`), so it won
      on **load order**, not specificity.
- [x] **The leftover task 402 explicitly deferred:** `pre > code:is(.language-echarts,
      .language-mindmap) { height: auto !important }` counters Vditor's `index.css`
      `.language-echarts, .language-mindmap { height: 420px }`. **Re-examined and RECLASSIFIED
      4→3, NOT converted** — see "Findings" below for why: Vditor's 420px rule is *correct* for the
      render div and only wrong for the editable `<code>` that happens to share the class; Vditor's
      own cancel-rule (`pre:first-child code` / `.node--expand .marker--pre code`) just doesn't reach
      it because of DOM order, not because the 420px declaration itself is wrong. There is no correct
      Vditor-source edit to make here — only a place to relocate the same override, which is worse
      (buried in a generated file, invisible to `.claude/rules/css.md`'s comment requirement).

## The audit itself (the actual work)

- [x] Enumerate every `main.css` rule whose selector contains a **Vditor-authored class**
      (`.vditor*`), with and without `!important`. — **115 rule blocks / 171 selector-branches / 217
      declarations** (postcss AST walk, `media-src/src/main.css` on a clean tree, 1850 lines / 84
      `!important` total). The task's own "~262" baseline is `grep -c '\.vditor'` — a **line** count
      including multi-line selector continuations, not a rule count; it matches exactly on this tree
      (262) and is a fine cheap regression tripwire, but it is not what was classified below.
- [x] For each, classify against ADR-0003's routing table — see "Category counts" below.
- [x] Convert category 4 where conversion is genuine (patches a Vditor declaration that is simply
      wrong, unconditionally). **2 converted.** 6 more genuine category-4 rules were found by a
      mechanical cross-reference against Vditor's own `index.css` but deliberately **not** converted
      this pass — see "Findings" for the list and the reasoning; flagged for team-lead/user decision
      rather than executed unilaterally, per this task's own instruction on ambiguous cases.
- [x] **Record the count found in each category in this file.**

## Findings (2026-07-31)

### Method

1. Parsed `media-src/src/main.css` with `postcss`, kept every rule with ≥1 selector-branch matching
   `/\.vditor[A-Za-z0-9_-]*/` → **115 rule blocks** (some blocks have several comma-branches; 171
   branches, 217 declarations, 55 of them `!important` across 29 of the 115 blocks).
2. Classified each block by reading its own comment (the file is heavily and accurately commented —
   `.claude/rules/css.md`'s "every override needs a why" is followed almost without exception) against
   ADR-0003's 4-way routing table.
3. Cross-referenced every `.vditor*` selector in `main.css` against `media-src/node_modules/vditor/dist/index.css`
   (the pre-patch source Vditor ships) two ways: **exact selector-string match**, and **suffix match**
   (our selector = some ancestor prefix + an exact Vditor selector — the shape of the `__link` case),
   keeping only hits where the declared **properties overlap** with Vditor's own rule for that
   selector. This is what actually distinguishes "counters a Vditor rule" (category 4) from "just
   happens to reference a `.vditor*` class as a DOM scoping hook, Vditor never declared anything there"
   (the overwhelming majority — diagram sizing, callouts, wiki chips, overlays, etc., all scoped
   *under* a Vditor element but styling classes Vditor doesn't know exist).

### Category counts (ADR-0003 routing table, 115 total)

| # | Category | Count | Notes |
|---|---|---|---|
| 1 | VS Code / webview injected-default neutralizer | **4** | blockquote bg (L94), the smiles/diagram `<code>` foreground+background strip vs `--vscode-textPreformat-foreground` (L645), outline `<li>` native marker suppression ×2 (L1477, L1480) — the last is a browser UA-stylesheet default rather than a VS-Code-*injected* one, but same "external, not ours, not Vditor's" shape. |
| 2 | IR/WYSIWYG edit-surface anti-jank/anti-glitch | **20** | the dual-node collapsed/expanded phantom-height family (code-block, math-block, html-block), the code-panel-vs-inline-code-leak fixes, first-paint stable-height/colour, marker-out-of-flow, the code-block-margin half of Edit↔Preview parity. (The HR-margin half moved to category 4 below — same family, but it's a genuine unconditional Vditor-rule collision, not just an anti-jank fix.) |
| 3 | Layout/geometry/our own feature | **81** | the largest bucket by far: diagram sizing/theming (mermaid…d2…vega, ~35 rules), callouts (~15, entirely our own `[data-callout]`/`.vmarkd-callout__*` attribute, Vditor has no concept of it), Vditor's own documented CSS-custom-property API used as designed (toolbar/panel colours — configuring, not overriding), full-width/narrow-width mode geometry, the double-scrollbar preview fix, task 110's Preview-surface rhythm parity (ADR-0003 explicitly sanctions "small deltas" here), wiki-link chips, outline resize handle, diff gutters, diagram error/loading/note boxes. Includes the reclassified echarts/mindmap item (see above). |
| 4 | Counters a Vditor-authored rule (misrouted) | **10** | see below — **2 converted**, **8 found and flagged, not converted.** |

4 + 20 + 81 + 10 = 115.

### The 3 override shapes

Counted only over the **21 rule-blocks that mechanically collide** with a Vditor-declared property on
the same selector (exact or suffix match, real property overlap) — counting every `.vditor*` rule here
would be meaningless, since most reference Vditor classes only as scoping hooks with nothing to
collide with. Every one of the 21 is exactly one of: pure shape 1, pure shape 2, or shape 1/2 *plus*
`!important` (7 + 4 + 10 = 21).

- **Shape 1 — higher specificity, no `!important` needed (7):** `main.css:139` `.vditor-reset
  .vditor-ir__link` (0,2,0) vs Vditor's `.vditor-ir__link` (0,1,0) — the task's own textbook case,
  **converted**; `main.css:450` `:is(.vditor-ir,.vditor-wysiwyg) .vditor-reset hr` (0,2,1) vs Vditor's
  `.vditor-reset hr` (0,1,1) — **deferred** (category 4, see below); `main.css:956`
  `.vmarkd-d2-md.vmarkd-d2-md .vditor-copy` vs Vditor's `.vditor-copy`; `main.css:1105`
  `#fix-table-ir-wrapper .vditor-panel` max-width (ID beats class); `main.css:1325` link-ref-defs
  marker `content` relabel (0,3,2) vs Vditor's `.vditor-ir div[data-type="link-ref-defs-block"]:before`
  (0,2,2), verified at `index.css:1676-1677` — **deferred**; `main.css:1588` Preview line-height; plus
  1 instance of `main.css` setting a value on the same selector Vditor declares it on, but through
  Vditor's *own* documented CSS-custom-property extension point (`body[...] .vditor`'s
  `--panel-background-color`/`--textarea-background-color`) — by-design configuration, not an override
  to fix.
- **Shape 2 — identical selector, wins on load order alone (4):** `main.css:169` `.vditor-reset pre >
  code` background-image — the task's own example, **converted**; `main.css:1429` `.vditor-outline`
  width (250px→200px default) — **deferred**; `main.css:1699` `.vditor-tip__close` position —
  **deferred**; plus 1 more by-design Vditor-var-API case (`.vditor` itself, `--toolbar-*` vars).
- **Shape 3 — `!important` (re-counted baseline, task 402's method):** **55** `!important`
  declarations inside `.vditor*`-selector rules, across **29** of the 115 rule blocks (file-wide: 84
  `!important` / 1850 lines, up from task 402's baseline of 78 / 1705 — see ADR-0003 amendment below).
  **10 of the 21 mechanical collisions above also carry `!important`** (8 otherwise shape 1, 2
  otherwise shape 2 — dual shape) — these are the `data-use-vscode-theme-color`/`data-full-width`/
  `:has()`-gated mode-conditional rules (see next section) plus the task-43 editor-font pair and the
  table/td/th pair, where `!important` is load-bearing because the un-important form would sometimes
  lose to Vditor's own declaration for the same element in another mode or theme layer.

Of the 21: **2 converted**, **8 found genuinely misrouted and deferred** (category 4 below), **11
stay category 3** (by-design var-API use, our-own-wrapper-scoped, mode-gated/irreducible, or an
ADR-0003-sanctioned Preview-surface delta).

### The 10 category-4 rules (converted vs. deferred)

**Converted (2):**
1. `main.css:139-142` `.vditor-reset .vditor-ir__link` → patched Vditor's own `.vditor-ir__link`
   rule (`index.css:1594-1597`) to carry `color: var(--vmarkd-link, var(--vscode-textLink-foreground,
   #4493f8)); text-decoration: none;` directly. Removed the main.css override.
2. `main.css:169-171` `.vditor-reset pre > code { background-image: none }` → patched Vditor's own
   `.vditor-reset pre > code` rule (`index.css:988-1001`) to drop the `background-image`/`background-size`
   hatch declarations. Removed the main.css override.

**Found genuinely misrouted, deliberately NOT converted this pass — flagged for a decision, not
decided unilaterally (larger blast radius or lower confidence than the two above, no visual change
intended by leaving them, but also no visual change *guaranteed* without dedicated verification):**

3. `main.css:450-453` — `:is(.vditor-ir, .vditor-wysiwyg) .vditor-reset hr { display: block; margin:
   1.5rem 0 }` vs Vditor's own `.vditor-reset hr { margin: 24px 0 }` (`index.css:906-910`, no
   `display`). Part of the Edit↔Preview HR/code-block margin-parity pair (main.css:450-456) — only the
   HR half collides with a Vditor declaration by property; the code-block half (`main.css:454-456`,
   `div[data-type="code-block"]` margin) targets a wrapper `div` Vditor's own rule doesn't reach, so it
   stays category 2. Static, unconditional (surface-scoped to `:is(.vditor-ir,.vditor-wysiwyg)`, not a
   runtime toggle) — same architectural shape as the two converted rules, just not pursued this pass.
4. `main.css:1193-1200` + `:1202-1211` — `.vditor-reset table` (`display: table` vs Vditor's `display:
   block`) and `table td/th` (`white-space: normal; word-break: break-word` vs Vditor's `nowrap`/
   `normal`) both use `!important` on an **exact** selector match. The single biggest candidate by far
   (multiple properties, differing values, drives table column-fit for every theme) — converting is
   architecturally clean (same shape as the two already done) but the blast radius is real: every
   table, every content theme. Recommend a dedicated follow-up with its own visual-golden pass, not
   folded into this one silently.
5. `main.css:1045-1048` + `:1056-1058` — `.vditor .vditor-reset` / `body.markdown-body .vditor
   .vditor-reset` forcing `font-family`/`font-size` to follow VS Code's editor font (task 43) instead
   of Vditor's hardcoded `16px` + GitHub-esque stack. Unconditional (no data-attribute gate) — genuine
   shape 1+3. Not converted: it's user-setting-driven (`--me-font-size`), and there are two layered
   rules (auto-mode + named-theme-mode) that would both need moving together.
6. `main.css:1429-1433` — `.vditor-outline` width `200px` default vs Vditor's `250px`. Lowest-risk
   deferred candidate (single value, single declaration, no `!important`, `--me-outline-width`-driven
   like the two converted ones) — good pick for whoever does the follow-up.
7. `main.css:1699-1702` — `.vditor-tip__close` position `top:4px;right:8px` vs Vditor's `top:-7px;
   right:-15px`. Purely cosmetic (About-dialog close button), same low-risk shape as #6.
8. `main.css:1325-1329` — `.vditor-ir .vditor-reset div[data-type="link-ref-defs-block"]::before`
   relabels Vditor's own marker `content` from `'"A"'` (`index.css:1676-1677`,
   `.vditor-ir div[data-type="link-ref-defs-block"]:before`) to `'↩'`. Verified: our selector adds an
   extra `.vditor-reset` ancestor, (0,3,2) vs Vditor's (0,2,2) — genuine shape-1 win, no `!important`.
   Deferred alongside #6/#7 as a low-risk single-declaration follow-up, not because of any confidence
   gap — just to keep this pass's blast radius to the two already done.

**Explicitly NOT counted as category-4 despite mechanically colliding with a Vditor declaration (11
rules), for three distinct reasons:**

- **Mode-gated (7):** `data-use-vscode-theme-color`/`data-full-width`/`:has(.vditor-sv…)`-gated —
  `main.css:49,58,82` (auto-vs-named-theme background/var config), `main.css:1221` (full-width border),
  `main.css:1532,1542,1556` (the double-scrollbar/narrow-width preview fix, `:has()`-gated). Vditor's
  static CSS has exactly one value per selector, but vMarkd needs a *different* value depending on
  runtime theme-mode or width-mode. A single source-patch cannot hold two different "correct" values
  for the same selector gated on a runtime attribute — that's what `main.css` conditional rules are
  *for*.
- **Scoped by an ID/class that is ours, not Vditor's, to know about (2):** `main.css:956`
  `.vmarkd-d2-md .vditor-copy` (suppresses the copy button inside our injected diagram-label markup),
  `main.css:1105` `#fix-table-ir-wrapper .vditor-panel` (collapses only the table-insert panel, one of
  several `.vditor-panel` instances). Pushing either to Vditor's own file would mean the vendor CSS
  referencing an application-specific wrapper — backwards.
- **By-design or ADR-sanctioned (2):** `main.css:39` (Vditor's own `--toolbar-*`/`--panel-*` CSS
  custom-property extension points, used as documented, not overridden), `main.css:1588` (task 110's
  Preview-surface line-height delta — ADR-0003 explicitly sanctions "structure from Vditor + small
  deltas" as the Render/Preview mechanism, not a routing violation).

All 11 stay category 3, irreducible or by-design.

### Two extra checks before converting #1 and #2 (both clear)

- **Conversion 1 (`.vditor-ir__link`):** grepped `index.css` for every selector between (0,1,0) and
  (0,2,0) that could also match a `.vditor-ir__link` span. Only `.vditor-ir__node--expand
  .vditor-ir__marker--bracket` (line ~1555) is nearby and it targets a **different** class
  (`__marker--bracket`, the `[ ]` brackets — the one the task file explicitly warned not to touch via
  `--ir-bracket-color`), not `__link` itself. No rule between the two specificities matches the link
  span in either collapsed or expanded state — the conversion is pixel-identical by construction (same
  literal value, just relocated).
- **Conversion 2 (hatch background-image):** the copied `media/vditor/dist/index.css` is linked by
  **three** surfaces per ADR-0004 (real editor, Playwright harness, HTML-export). Source-patching it
  removes the hatch on **all three**, including the export surface and the static prerender overlay —
  previously the hatch was ALSO removed there only if `main.css` was loaded (it is, on every surface
  that loads Vditor content at all, since it's part of the same `media/dist/main.css` bundle) — so this
  is not a behaviour change on any third surface; the hatch was already suppressed everywhere `.vditor-reset
  pre > code` renders, main.css is simply no longer the reason.

### Verified NOT re-litigated (per the task's own two traps)

- Did **not** redefine `--ir-bracket-color` (would also recolour `.vditor-ir__marker--bracket` and
  `.vditor-sv__marker--bracket` — confirmed still 3 consumers in the vendored `_ir.less`/`_sv.less`).
- Did **not** decide whether bracket markers should take the link colour — out of scope, not touched.

### Nothing here changes what a user sees

Both executed conversions carry over the exact same literal values that were previously enforced by
the `main.css` override — same computed style, same visual result on every surface, just relocated per
ADR-0004. The 8 deferred category-4 rule blocks (6 features: HR margin, table, task-43 font, outline
width, tip-close position, link-ref marker) are **not converted**, so by definition nothing changes for
them either. No visual decision was made silently.

## Conversion #2 was incomplete — a dark-mode regression, found and fixed 2026-07-31

Surfaced by the simplification pass on this task's own diff, then confirmed by the lead by reading
the built artifacts and `html-builder.ts`'s link order. **This is the single most important lesson in
this task file — a specificity-based override can be guarding against more than one Vditor rule.**

Conversion #2 moved `.vditor-ir__link` into `index.css` via `patchVditorIndexCss` and deleted
`main.css`'s `.vditor-reset .vditor-ir__link` (0,2,0) override, whose comment called it *"a textbook
ADR-0003 routing-rule violation"*. It was not. Vditor sets that colour in **two** stylesheets:

| where | selector | specificity |
|---|---|---|
| `index.css` | `.vditor-ir__link` | (0,1,0) — the one the audit found |
| `content-theme/dark.css:31` | `.vditor-reset a, .vditor-ir__link` | (0,1,0) — **missed** |

`html-builder.ts` links the content theme AFTER `index.css`/`main.css` (unconditionally, for every
`theme.content` value — named vMarkd themes rely on that order). Equal specificity + later load means
`dark.css` won, so the IR link colour silently reverted to Vditor's hardcoded `#4285f4` in **every
dark session**. Light mode looked correct, because `light.css` has no such rule — which is exactly
how this would have shipped unnoticed. The deleted `.vditor-reset` prefix was never gratuitous: at
(0,2,0) it out-ranked `dark.css` regardless of load order.

**Fix (applied):** `patchContentThemeIrLink()` in `build.mjs` drops `.vditor-ir__link` from
`dark.css`'s selector list, leaving `.vditor-reset a` (the PREVIEW link, owned by the content theme)
untouched — so the patched `index.css` rule is the single owner of the IR link colour. That keeps
patch-at-source honest instead of re-introducing a specificity fight. Anchor-asserted with its own
drift `throw`, **verified red-then-green** (corrupted the anchor → build failed with the expected
message; restored → green) and verified idempotent across two consecutive builds (the vendor sync
re-copies `content-theme/` each build, so the patch is not applied to already-patched output).

**Rule for the remaining 8 conversions:** before deleting a `main.css` override, grep for the property
in `content-theme/{light,dark}.css` as well as `index.css`. A conversion is only safe once every
Vditor declaration of that property is accounted for — and check light and dark separately, since the
two content themes do not carry the same rules.

## Scope note

`main.css` currently has uncommitted edits from a parallel a11y task. Start on a clean tree, or the
diff is unreviewable and the counts are wrong.

**Resolved (2026-07-31):** `main.css` was already clean/committed on this tree by the time this task
started (task 110 landed the a11y edits it warned about). Counts above are re-measured on that clean
tree.

## Verification

- [x] `node build.mjs` — every new patch's anchor assert fires on drift (prove it by corrupting one).
      **Done.** `patchVditorIndexCss()` (`build.mjs`) runs early in the pipeline (`syncVditorAssets` →
      `varifyVditorPalette` → `patchVditorIndexCss`, before the `tsc`/webview-esbuild step) and printed
      `[index-css] WYSIWYG inline-code h-padding, .vditor-ir__link colour, pre>code hatch → patched` —
      verified all 3 rewrites landed in `media/vditor/dist/index.css` (`.vditor-ir__link` now reads
      `color: var(--vmarkd-link, …); text-decoration: none;`; the hatch `background-image` line is
      gone, replaced with `background-image: none;`). Corrupted the `.vditor-ir__link` anchor
      (appended `-CORRUPTED-FOR-TEST` to `--ir-bracket-color`) and re-ran — it threw immediately,
      before touching anything else:
      ```
      Error: [index-css] .vditor-ir__link rule anchor not found in vditor index.css — Vditor changed; update build.mjs
          at replaceAnchored (file:///…/build.mjs:341:11)
          at patchVditorIndexCss (file:///…/build.mjs:381:9)
          at async file:///…/build.mjs:434:1
      ```
      Restored the anchor and re-ran clean — same success line, patches confirmed byte-identical again.
- [x] **`node build.mjs` now completes end-to-end** (2026-07-31, follow-up session) — task 461
      (list-tight-observer-retire) landed, `media-src/src/list-tight.ts` exists again, the previously
      blocked webview esbuild step now succeeds. Re-verified: full `node build.mjs` run is clean
      (`d2-main.js`, `mermaid-elk-main.js`, `main.js`/`main.css`, `elk-main.js` all built), so the
      two items below are no longer blocked.
- [x] **Regression net for the dark-mode IR-link bug already existed** at
      `media-src/e2e/content-theme.spec.ts:901`, `IR link + checkbox follow --vmarkd-link (${c.theme})`,
      parameterised over `LINK_CONTRACT` (all 5 registry themes: github-light/dark, material-dark,
      vscode-light/dark-2026). It reproduces `html-builder.ts`'s exact stylesheet load order via
      `installRealWebviewBaseline` (base `index.css`/`main.css` from the harness page → Vditor's
      `content-theme/{light,dark}.css` via `addStyleTag`, mirroring `prerender.themeLink` → the named
      theme file via `addStyleTag`, mirroring `contentThemeLinks`, loaded last) — the same three-file
      collision `patchContentThemeIrLink` fixes. Per theme it asserts `getComputedStyle` on a
      `.vditor-ir__link` span against the theme's exact expected RGB (e.g. `vscode-dark-2026` →
      `rgb(72, 160, 199)`), not just an absence-of-the-old-value check — a genuinely strong positive
      assertion, stronger than what a first draft of a new spec here would have written. (An earlier
      version of this task's Verification section proposed folding a duplicate check into
      `test/vscode-e2e/d2-lazy-load.spec.ts` — reverted; a real-VS-Code boot buys nothing over this
      chromium-harness net for a pure stylesheet-load-order bug, since both load the same two files in
      the same order.)

      **Red-then-green against the existing net, both runs verbatim:**
      Red — commented out `await patchContentThemeIrLink()` at `build.mjs:467`, ran `node build.mjs`
      from repo root (confirmed the `[content-theme] dark.css .vditor-ir__link dropped …` line was
      absent and `media/vditor/dist/css/content-theme/dark.css` still had `.vditor-ir__link` in its
      selector), then `cd media-src && xvfb-run -a npx playwright test e2e/content-theme.spec.ts
      --reporter=line`:
      ```
      1) IR link + checkbox follow --vmarkd-link (github-dark)
         Expected: "rgb(68, 147, 248)"   Received: "rgb(66, 133, 244)"
      2) IR link + checkbox follow --vmarkd-link (material-dark)
         Expected: "rgb(97, 175, 239)"   Received: "rgb(66, 133, 244)"
      3) IR link + checkbox follow --vmarkd-link (vscode-dark-2026)
         Expected: "rgb(72, 160, 199)"   Received: "rgb(66, 133, 244)"
      3 failed, 53 passed
      ```
      All three failures land on exactly `rgb(66, 133, 244)` (`#4285f4`) — Vditor's hardcoded value —
      on the 3 dark themes only; both light themes (github-light, vscode-light-2026) stayed green,
      matching the bug's own signature ("light mode looked correct").

      Green — restored `build.mjs:467` (Edit, not git — the file is shared with other agents' work),
      re-ran `node build.mjs` (confirmed `.vditor-ir__link` gone from `dark.css` again), re-ran the
      same command:
      ```
      56 passed (30.1s)
      ```

      Gates run clean: `npm test` (167 files / 2397 tests), `npm run lint:ci` (one unrelated finding —
      `test/backend/vditor-source-patches.test.ts` formatting — confirmed via `git status` to be
      another agent's in-flight, uncommitted change, not touched by this session), `npm run
      typecheck`, and `./node_modules/.bin/tsc -p tsconfig.json --noEmit`.
- [x] `xvfb-run -a npm run test:visual` — **4/4 passed** (2026-07-31, lead). Pixel-identical
      confirmed, as a conversion that only relocates identical literal values must be.

      **Checked that the goldens actually cover the two conversions rather than merely being green** —
      a passing golden that doesn't look at the changed pixel proves nothing:
      - *Conversion #2 (the `pre > code` hatch)* — covered **explicitly**. `visual.spec.ts:22`
        (`codeblock-collapsed.png`) names it in its own guard list: *"phantom height above/below the
        render, panel padding, transparent inner code bg, **no diagonal hatch**"*. If dropping
        `main.css`'s override had let Vditor's hatch back in, this golden fails. Two more
        (`visual.spec.ts:96`, `:117`) render code surfaces as well.
      - *Conversion #1 (the IR link colour)* — **not** covered by any golden; none of the four render
        an IR link. Its net is `media-src/e2e/content-theme.spec.ts:901`, which is stronger for this
        purpose anyway: a positive per-theme `getComputedStyle` RGB assertion across all 5 registry
        themes, already proven red-then-green above.

      So both conversions have a real net, but not the same one — and the visual suite alone would
      **not** have caught the dark-mode regression documented above. That is worth stating: it is the
      reason `content-theme.spec.ts` exists and why "the goldens are green" was never sufficient here.
- [x] `xvfb-run -a npm run test:vscode:fast` — **39/39 passed, 7.9 min** (2026-07-31, lead, on a
      clean `rm -rf out && node build.mjs`; run for task 460 on this same tree, so it covers this
      task's CSS state too). Recorded for completeness — the original note stands on the merits: this
      bug is a pure stylesheet-load-order collision already proven at the correct layer
      (`media-src/e2e/content-theme.spec.ts`), and a VS Code boot adds no coverage for it.
- [x] Update ADR-0003's amendment with a new baseline **and** with the specificity-override counts,
      so the next audit checks both classes. **Done** — `docs/adr/0003-css-theming-architecture.md`,
      "Amendment 2026-07-31".
