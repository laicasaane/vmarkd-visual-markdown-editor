# ADR-0004 — Patching Vditor at build time

- **Status:** Accepted
- **Date:** 2026-06-14
- **Tags:** vditor, build, esbuild, css, patching, architecture
- **Related:** ADR-0003 (CSS theming — "behaviour → esbuild TS patch", "Vditor-origin CSS → build-time source-patch"), `media-src/esbuild-shared.mjs` (`VDITOR_TS_PATCHES` + `vditorSourcePatches`), `build.mjs` (`patchVditorIndexCss`, `varifyVditorPalette`, `syncVditorAssets`), `src/html-builder.ts` (the `index.css` `<link>`), [`docs/vditor-patch-checklist.md`](../vditor-patch-checklist.md) (per-function bump checklist — task 147 item 5).

## Context

Visual Markdown Editor embeds **Vditor** (vendored under `media-src/node_modules/vditor`) and must change some of
its behaviour and CSS. A fork is on the table long-term, but until then we patch at build time.
Two questions decide every patch: **what kind of thing am I changing (TS behaviour vs CSS)** and
**which copy of the asset does the surface that needs the change actually load.** Get the second
wrong and the patch silently does nothing on the surface you care about while still looking
"fixed" on another (the harness).

### One copy of every asset (this used to be two)

Vditor's TS is only ever consumed by being bundled from source (`media-src/src/*.ts` →
esbuild → `media/dist/main.js`). Vditor's CSS (`index.css`, the content-themes) is loaded by a
`<link>` to the **copied** `media/vditor/dist/…` assets (`build.mjs syncVditorAssets()` copies
node_modules → `media/`), by every surface: the **real editor** (`src/html-builder.ts` links it),
the **Playwright harness** (`/vditor/…` link), and the **HTML-export** feature. One copy, linked
everywhere — so a single build-time source-patch of the copied file reaches all of them.

> **History (why the rules below exist).** `index.css` used to also be **bundled** into
> `media/dist/main.css` via `main.ts: import 'vditor/dist/index.css'`. That created a SECOND copy
> (bundled from the *unpatched* node_modules) that only the editor loaded, while `build.mjs`
> patched only the *copied* `media/` one (harness + export). The two drifted: a WYSIWYG
> inline-code-padding fix went green in the harness but the editor still showed Vditor's
> `0 !important` (the harness loaded the patched copy, the editor the unpatched bundle). Fixed by
> dropping the bundle import and linking the patched `media/` copy in the editor too — so there is
> now ONE copy of `index.css` and no CSS bundle-patch mechanism at all. (ADR-0004 simplification B.)

## Decision

### Two patch mechanisms — pick by what you're changing

*(A third and fourth mechanism, and the decision funnel for choosing between all four, are documented
in the 2026-07-31 amendment below — read that BEFORE assuming one of the two below applies.)*

1. **Vditor TS behaviour** → **esbuild `onLoad` source patch**, declared in the
   `VDITOR_TS_PATCHES` registry and applied by the single `vditorSourcePatches` engine plugin
   (`media-src/esbuild-shared.mjs`). Each entry is `{ file: <filter>, transform: (code, path) => code }`;
   the transform is an **anchor-asserted** `patchXxx` function (e.g. `patchIrLinkClick`,
   `patchMathRender`, `patchCalloutArrowNav`). A file touched by more than one patch chains them in
   one transform (esbuild runs only the first matching `onLoad` per file). Reaches the bundle (the
   only thing that consumes Vditor TS). Adding a patch = write the asserted `patchXxx` + one
   registry row.

2. **Vditor CSS** → **`build.mjs` source-patch** of the copied `media/vditor/dist/…` file, run
   AFTER `syncVditorAssets()`. Examples: `varifyVditorPalette` (palette literals →
   `var(--vmde-*)`), `patchVditorIndexCss` (WYSIWYG inline-code padding `0` →
   `var(--vmde-code-px, .4em)`). Reaches every surface, because every surface links that one copy.

### Rules for every patch

- **Anchor-assert and throw on miss.** Each patch checks its exact source anchor and throws a named
  error if absent, so a Vditor version bump **fails the build loudly** instead of silently no-op-ing.
- **Token-drive values** where a theme should vary them: rewrite to `var(--vmde-*, <default>)`
  rather than a literal, so themes stay the single source (ADR-0003).
- **Prefer fixing Vditor's own rule at the source over a higher-specificity override in `main.css`.**
  An override leaves Vditor's wrong rule in place plus a rule to maintain; patching the source makes
  the actual rule correct (cleaner cascade, nothing to out-rank). Reserve `main.css` `!important` for
  what we genuinely can't patch (VS Code injected defaults — ADR-0003).
- **CSS load order is a contract.** The editor links `media/vditor/dist/index.css` **before**
  `media/dist/main.css` (`html-builder.ts`), so our bundle still wins equal-specificity ties — the
  same order the harness HTML uses. If you add a Vditor CSS `<link>`, keep our CSS after it.
- **Verify in the REAL webview, not just the harness.** Use the real-vscode suite
  (`test/vscode-e2e/`) for anything touching a Vditor asset; it loads exactly what ships and is the
  only thing that caught the (now-removed) bundled/copied drift.

## Alternatives considered

- **Runtime `main.css` override** (higher specificity + `!important`) instead of patching the source —
  works and reaches the editor, but leaves Vditor's wrong rule and an override to maintain. Use only
  when the rule can't be patched at source.
- **Bundling `index.css`** (`import 'vditor/dist/index.css'`) — rejected/removed: it created the
  unpatched second copy and the editor/harness drift (see History). Linking the single patched copy
  is simpler and drift-free.
- **Patch the node_modules file in place** before bundling — fragile: `npm ci` / reinstall resets it,
  not reproducible. The esbuild `onLoad` rewrite is hermetic (operates on read, not on disk).
- **Cache-buster (`?v=`) on index.css** — does NOT apply: the editor links the same file as the
  harness/export. `?v=` matters only for runtime-`<link>`-loaded vendored JS (mermaid/echarts —
  `patchMermaidVersion`/`patchEchartsVersion`).
- **Fork Vditor** — the accepted long-term backstop; until the anchor-asserted patches become
  unmanageable, the build patches win on maintenance cost.

## Consequences

- **+** One copy of every asset, two mechanisms (TS bundle-patch via the registry, CSS source-patch
  of the copied file). No "patched it but the editor didn't change" class of bug.
- **+** TS patches live in one declarative registry — adding/auditing them is a table edit, and the
  near-identical per-patch plugin boilerplate is gone.
- **+** Anchor asserts turn a Vditor bump into a loud build failure at the exact patch site.
- **−** Relies on Vditor source anchors — drift risk, mitigated by the asserts; a fork removes it.
- **−** Requires the real-vscode suite (slower, ad-hoc, WSLg/display) to truly verify Vditor-asset patches.

## Amendment 2026-07-31 — four mechanisms, a decision funnel, and the drift-detection asymmetry (task 465)

**Origin:** a patch-vs-runtime audit (2026-07-30, cross-checked by an independent Fable review) found
two independent runtime workarounds (`list-tight.ts`, `list-backspace.ts`) compensating for one
Vditor branch in a file already patched four times over (`util/fixBrowserBehavior.ts`). The cause was
this ADR documenting two mechanisms while a third (seam patches) was already the dominant pattern and
a fourth (capture-phase interceptors) had no name at all, and no rule existed for choosing between
them. Tasks 461-464 (below) supplied the missing rule; task 465 writes it down.

### Two more mechanisms

3. **Seam patch + runtime implementation.** A one-anchor TS patch inserts a *seam* — a
   `window.__vmde*` hook — at the exact point Vditor makes a decision; the implementation lives in a
   normal, testable, disposable webview module that reads the hook, and Vditor falls back to stock
   behaviour when the hook is absent. **"Runtime module" vs "patch" is a false dichotomy** — the
   question is not *where the code lives* but *does Vditor need to be told where to call it*. A patch
   is often one anchor, not a rewrite. This shape already dominates: over 20 `window.__vmde*` hooks
   (task 465's count; growing — e.g. `__vmdeListBackspaceOutdent`, task 462) span perf, theming,
   caret, paste, and links. Worked example: task 462's `patchFixListOutdent` gates `fixList`'s
   Backspace branch to top-level-only and adds the missing non-first-item branch; `list-backspace.ts`'s
   `installListBackspace()` reads `window.__vmdeListBackspaceOutdent` to do the actual outdent — the
   patch is the seam, the module is the logic, neither alone is the fix.
4. **Runtime observer / capture-phase interceptor** — no source patch at all. Two sub-shapes, do not
   conflate them: (a) a **MutationObserver on the stable `#app` mount** (ADR-0005) for surfaces with no
   JS call site to patch (see Gate 1 below); (b) a **capture-phase `document`/`window` listener** for
   reach a patch cannot have (see Gate 2 below). Within (b), five modules
   (`callout-nav.ts`, `gap-nav.ts`, `gap-paragraph.ts`, `diagram-zoom-gate.ts`, `undo-keybind.ts`) call
   `stopImmediatePropagation` to deliberately out-race a competing bubble-phase handler; a separate,
   weaker group (`caret.ts`, `preview-scroll-preserve.ts`, `escape-toolbar.ts`, others) uses
   capture-phase listeners without it — that's a different technique for a different purpose, not the
   same pattern twice.

### The decision funnel — two structural gates BEFORE the correctness question

The gap that actually caused the drift: a flat table with "Vditor's condition is wrong → patch" as a
peer row invites patching first and discovering the patch doesn't reach far enough second (exactly
what task 463 measured). Check these two gates first, in order — they are about *reach*, not
correctness, and either one alone settles the mechanism regardless of what the third question would
say.

- **Gate 1 — is there a JS call site at all?** If the surface is generated by Lute's WASM
  HTML-string templating (`SpinVditorIRDOM` et al.) rather than Vditor's own TS DOM-construction code,
  there is nothing to attach a patch to — go straight to a runtime `#app` observer. `code-source.ts` is
  the worked example: the IR marker DOM is regenerated by a Go-compiled template on every keystroke, so
  no patch could ever attach — not because highlight.js themes happen to be swappable (its old header
  implied that; corrected, task 465).
- **Gate 2 — must the behaviour act outside the element Vditor binds its own handler to?** If yes, a
  patch to Vditor's own source structurally cannot reach it, no matter how correct the underlying
  condition is. **Task 463 is the proof, not a hypothetical:** `undo-keybind.ts`'s gate
  (`&& !vditor.toolbar.elements.undo`) in `editorCommonEvent.ts` genuinely is a wrong Vditor condition,
  and `patchUndoToolbarGate` genuinely fixed it — measured GREEN for every key pressed inside the
  editable element. Moving focus outside `.vditor-ir` and pressing the one chord the patch didn't also
  cover made it do **nothing at all**, because Vditor's own handler is bound on the editor element in
  all 3 modes and a patch to Vditor's own code cannot become a `window`-bound listener. Reach beat
  correctness. `undo-keybind.ts` was kept for exactly this reason, not the module's own prior
  (unverifiable, and now known wrong) claim about racing VS Code's forwarding — see "Correction" below.

Only once both gates are cleared does the correctness question — and the table below — apply:

| situation (gates 1 & 2 already cleared) | mechanism |
|---|---|
| Vditor's own condition/branch is wrong | TS source patch (anchor-asserted) |
| Vditor needs to call our logic at a decision point | seam patch (anchor-asserted hook) + runtime implementation module |
| Caret/DOM geometry Vditor does not model | runtime, capture-phase pre-empt |
| VS Code host behaviour, not Vditor's | runtime |
| Our own feature or policy | runtime |
| A Vditor CSS rule is wrong | `patchVditorIndexCss` — never a `main.css` override, with or without `!important`; **check every source it declares in, not just `index.css`** (see CSS below) |

Gate-1 failure routes to mechanism 4a; gate-2 failure routes to mechanism 4b (`stopImmediatePropagation`
if the competitor is Vditor's own bubble-phase handler, plain capture-phase otherwise).

### Correction — task 463 overturned its own module's stated reason, not just the table

`undo-keybind.ts`'s previous header claimed VS Code's forwarding listener sits on `window` in bubble
phase and that an editor-element handler "fires too late" — a claim that doesn't match standard
bubble-phase ordering and was never verifiable from this repo (VS Code's host is out of tree). The
experiment did not confirm that claim; it measured a different, verifiable fact instead (reach, per
Gate 2 above) and the module's header now states that measured reason. Gap 4's original framing in
task 465 anticipated the second capture-phase competitor as "VS Code's host forwarding (mechanism
unverified)" — the resolved reason is reach outside Vditor's own bound element, not a race against a
specific VS Code mechanism. Doctrine should say the thing that was measured.

### When a runtime `#app` observer is legitimate vs a symptom of a missing patch — and the retirement rule

Legitimate exactly when Gate 1 or Gate 2 forces it. It is a **symptom of a missing patch** when it
exists only to repair damage a patchable Vditor branch produces — that was `list-tight.ts`: a
MutationObserver repairing corruption from `fixList`'s own wrong branch. Task 462's
`patchFixListOutdent` fixed that branch at the source, making the corruption — and the repair —
permanently unreachable; task 461 retired the observer.

**The retirement rule, generalized from 461: a green regression test is not evidence a runtime
decorator is load-bearing.** Once something upstream (a patch, or another runtime module) prevents the
triggering condition, the spec passes whether or not the decorator is still wired — a green
`list-tight.spec.ts` after task 428 shipped `list-backspace.ts` proved nothing about the observer. The
discriminating run is green **with the decorator removed**, not green with it present. Don't stop at
"tests pass, keep it."

### Drift-detection asymmetry — state it, don't leave it implicit

Mechanisms 1, 2, and the seam half of 3 are **anchor-asserted**: a Vditor version bump makes the build
throw a named error at the exact patch site (proven red-then-green in tasks 463 and 464 — corrupting
the anchor failed the build with the expected message both times). Mechanism 4, and the **runtime
half** of mechanism 3, have **no equivalent** — nothing fails the build if Vditor's DOM shape or event
ordering changes underneath them; they silently stop matching, or worse, keep blocking/repairing a
branch Vditor has since fixed itself. A seam patch is therefore only **half-guarded**: the anchor
assert protects the injection point, nothing protects the runtime implementation on the other side of
the hook. Not a defect to fix — a cost to weigh before choosing 3/4 over 1/2 when either is genuinely
viable.

### CSS — a third patch shape, and "every source" (task 464)

- **Redefining a Vditor CSS custom property is broader than the specificity override it replaces** — it
  hits every consumer of that variable, not just the one you meant to fix. Prefer patching the *rule*
  via `patchVditorIndexCss`, not the variable. Verified: `--ir-bracket-color` has 3 consumers across
  IR/sv brackets and the link colour; only 1 was ever the intended target.
- **The routing rule applies to specificity- and load-order-based overrides too, not just
  `!important`.** Task 402's 2026-07-27 audit checked only `!important` and found nothing misrouted;
  task 464 checked the specificity/load-order class separately and found the routing rule's own
  textbook violation (`main.css:139`, `.vditor-reset .vditor-ir__link`) sitting unaudited (detail in
  ADR-0003's 2026-07-31 amendment).
- **"Patch at source" means every source Vditor declares the rule in — checking `index.css` alone is
  not enough.** A converted `.vditor-ir__link` rule shipped a **dark-mode regression**: Vditor also
  declares that selector in `content-theme/dark.css` (equal specificity, loaded after
  `index.css`+`main.css`, so it silently won in every dark session once the `main.css` override that
  used to out-rank it was deleted). Light mode looked correct, because `light.css` carries no such
  rule — that asymmetry is exactly how it would have shipped unnoticed. **Rule: before deleting a
  `main.css` override in favor of a source-patch conversion, grep the property in `index.css` AND both
  `content-theme/light.css` and `content-theme/dark.css` — check light and dark separately, since the
  two content themes do not carry the same rules.** (Fix pattern: `patchContentThemeIrLink` patches the
  content-theme file too, rather than reintroducing a specificity fight.)

### Worked examples (one line each; full detail in the cited task)

- `gap-nav.ts` (runtime, caret geometry Vditor doesn't model; was `hr-nav.ts` until task 292) vs `patchCalloutArrowNav` (TS patch,
  Vditor's own check) — already applied correctly: complementary, not duplicated.
- Task 462 — `patchFixListOutdent` (seam) + `list-backspace.ts` (`installListBackspace`, mechanism 3).
- Task 461 — `list-tight.ts` retired once 462 made its trigger structurally unreachable (mechanism 4a
  as symptom, resolved; retirement rule above).
- Task 463 — `undo-keybind.ts` kept; `patchUndoToolbarGate` measured insufficient on reach (Gate 2),
  fully reverted rather than left as unreachable dead code.
- Task 464 — `.vditor-ir__link` conversion (CSS shape above), then the content-theme regression and its
  fix.
