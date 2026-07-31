# Task 478 — Convert the 8 remaining misrouted `main.css` overrides to source patches

**Status:** 🔴 OPEN — split out of task 464 on 2026-07-31 · **Impact:** 🟢 no visual change intended
(each conversion relocates identical literal values), 🟡 blast radius varies sharply per item — one
of the eight touches every table in every theme · **Origin:** task 464's audit
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

- [ ] **1. `.vditor-tip__close` position** (`main.css:1699-1702`) — `top:4px;right:8px` vs Vditor's
      `top:-7px;right:-15px`. Purely cosmetic, About-dialog close button. Single declaration, no
      `!important`. Lowest risk; do it first as a dry run of the whole procedure.
- [ ] **2. `.vditor-outline` width** (`main.css:1429-1433`) — `200px` default vs Vditor's `250px`.
      Single value, no `!important`, `--me-outline-width`-driven exactly like the two already
      converted. 464 explicitly nominates this as the best follow-up pick.
- [ ] **3. link-ref-defs marker `content`** (`main.css:1325-1329`) — relabels Vditor's
      `.vditor-ir div[data-type="link-ref-defs-block"]:before` marker from `'"A"'` to `'↩'`.
      Verified shape-1 win, (0,3,2) vs Vditor's (0,2,2), no `!important`. Single declaration.
- [ ] **4. HR margin / Edit↔Preview parity** (`main.css:450-453`) —
      `:is(.vditor-ir,.vditor-wysiwyg) .vditor-reset hr { display:block; margin:1.5rem 0 }` vs
      Vditor's `.vditor-reset hr { margin:24px 0 }`. Note the pair: only the **HR half** collides
      with a Vditor declaration; the code-block half at `main.css:454-456` targets a wrapper `div`
      Vditor's rule never reaches and stays category 2 — **do not move it too.**
- [ ] **5. Editor font family/size** (`main.css:1045-1048` + `1056-1058`) — task 43's rules making
      the content follow VS Code's editor font instead of Vditor's hardcoded `16px` + GitHub stack.
      Genuinely misrouted, but **two layered rules** (auto-mode + named-theme-mode) that must move
      together, and it is user-setting-driven via `--me-font-size`. Do not split the pair.
- [ ] **6. `.vditor-reset table` + `table td/th`** (`main.css:1193-1200` + `1202-1211`) — the big
      one. `display:table` vs Vditor's `display:block`; `white-space:normal;word-break:break-word`
      vs Vditor's `nowrap`/`normal`. Exact selector match, `!important` on both, multiple properties,
      and it drives table column-fit for **every table in every content theme**. 464's recommendation
      stands: **its own pass with its own visual-golden coverage**, not folded in with the others.

*(That is 6 bullets covering the 8 deferred rule blocks — items 5 and 6 are each a pair of blocks
that must move as a unit; 464's "8" counts blocks, this list counts changes.)*

## Verification (per item, not once at the end)

- [ ] `node build.mjs` green, and each new patch's anchor assert **proven to throw on drift** by
      corrupting the anchor (ADR-0004's rule; 464 did this for both of its conversions).
- [ ] Patch idempotent across two consecutive builds — the vendor sync re-copies the Vditor assets
      each build, so a patch must not be applied twice to already-patched output.
- [ ] `content-theme/{light,dark}.css` checked for the same property, per the rule above.
- [ ] `xvfb-run -a npm run test:visual` — and **confirm the goldens actually look at the changed
      pixel** rather than merely passing. 464 found that its four goldens covered one of its two
      conversions and not the other; a green suite that doesn't render the affected element proves
      nothing. If no golden covers the item, add one or add a computed-style assertion in
      `media-src/e2e/content-theme.spec.ts` (the stronger net — positive per-theme RGB assertions).
- [ ] Item 6 additionally: a dedicated table-rendering golden across content themes before/after.

## Note

None of these are user-visible defects today. The cost of leaving them is the one ADR-0003 names:
an override leaves Vditor's wrong rule in place **plus** a rule of our own to maintain, and the next
Vditor bump can change the thing being overridden without anything failing loudly.
