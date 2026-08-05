# Task 147 — Vditor patch-engine hardening (close the silent-drift holes)

> **Status:** ✅ CLOSED (2026-08-01) — **items 1, 3, 5 DONE**; item 4's actionable part DONE
> (fragile-anchor subset catalogued, 7/7 confirmed fail-loud) — re-anchoring the 7 onto a
> "more structural" token is not possible by definition (a version literal / translated
> string IS the thing being anchored), and a full function-by-function read of the other
> ~40 was judged unnecessary after spot-checks; item 2 is owned by [task 144](144-plantuml-architecture-hardening.md),
> not this one — nothing left here to do. Created
> 2026-06-24 from an audit of the whole `VDITOR_TS_PATCHES` registry + the esbuild onLoad engine +
> its drift tests. Robustness, not a feature.
> **Source:** architecture review (2026-06-24); status re-verified 2026-07-27 (Codex architecture review).
>
> **🟢 Item 5 DONE (2026-07-28):** consolidated "Vditor bump checklist" written to
> [`docs/vditor-patch-checklist.md`](../docs/vditor-patch-checklist.md) (linked from `DEVELOPMENT.md`
> and ADR-0004) — every one of the **49** `patchXxx`-named functions (48 registry-facing + 1 private
> shared helper) read directly and tabulated by registry entry/file: anchor, fragility class
> (structural / whitespace-sensitive-multiline / version-literal / translated-text / chain-order),
> what it guards, fail-loud-or-silent. The real count is **29 registry entries, 49 functions** — the
> task's original "23 patches" and item 4's "47 functions" are both superseded by this recount.
> Supersedes/extends item 4's fragile-anchor subset: confirms its 7 findings, adds a much larger
> whitespace-sensitive-multiline category (~12 more functions) it didn't name, and surfaces two NEW
> gaps the grep-based item-4 pass couldn't see (both documented on the checklist page): (a)
> `patchEchartsThemeInit`'s second `.setOption(option)` rewrite is a genuinely silent (non-throwing)
> sub-patch — deliberate, but with zero test/build signal if it ever stops matching; (b)
> `patchPreviewComments`'s import-splice has no anchor guard of its own (fails as an unlabelled
> `ReferenceError` rather than the registry's usual named throw). Neither is a live bug — both are
> pre-existing, intentional-or-benign gaps now written down for the next person doing a version bump.
>
> **🟢 Item 1 DONE — verified 2026-07-27 against the current source:** the SMILES `?v=` patch is no
> longer a silent `return code` — `media-src/esbuild-shared.mjs:1663` **throws** the named
> "version drift?" error when its anchor is missing, matching the other patches, and the smiles
> source is now asserted in `test/backend/vditor-source-patches.test.ts` (5 references). Both halves
> of the proposed fix landed.
>
> **🟢 Item 3 DONE (2026-07-27):** added a regression test (`test/backend/patch-mutation.test.ts`,
> `VDITOR_TS_PATCHES registry entries do not overlap`) asserting no two registry entries' `file`
> regexes match the same vendored `.ts` file — reusing that file's existing real-vendored-source
> file list (`allFiles`), so it exercises the actual 29-entry registry against the actual pinned
> Vditor tree, not a synthetic one. Currently passes (no overlap exists today) — this converts a
> previously-unenforced invariant into a loud CI failure if a future entry ever collides. Verified:
> 31/31 in that file, full suite 1791/1791, typecheck clean, `lint:ci` clean.
>
> **📌 Baseline recount (superseding this task's original numbers):** written against "23 patches";
> the real figures, verified by reading the whole registry file end-to-end (2026-07-28), are
> **29 registry entries / 49 `patchXxx` functions** (48 registry-facing + 1 private shared helper,
> `patchNativeDiagramError`) — several entries chain multiple patches over one file, which is why
> functions ≫ entries. This is the concrete input to
> [task 401](../401-adr0004-vditor-fork-trigger.md) (the fork-trigger decision) — use 29/49, not 23.
> **Value / Risk:** 🟢 removes the few silent-failure paths in an otherwise strong system / low —
> assertions + tests + small consistency fixes, no behavioural change.

## What's already strong (do NOT regress)
- **One generic engine** `vditorSourcePatches` iterating a declarative `VDITOR_TS_PATCHES` registry
  (`media-src/esbuild-shared.mjs`) — replaced ~14 near-identical per-patch plugin objects.
- **Nearly all patches fail-loud** with a named "version drift?" error when their anchor is missing.
  (The original "23 patches, 22 fail-loud" line is superseded — see the recount above: 29 entries /
  49 functions. The known non-throwing sub-patches are enumerated in
  [`docs/vditor-patch-checklist.md`](../docs/vditor-patch-checklist.md); one of them is now tracked
  as [task 418](418-unguarded-echarts-setoption-rewrite.md).)
- **Double drift net:** `test/backend/vditor-source-patches.test.ts` reads the REAL vendored Vditor
  source (chartRender, markmap, graphviz, flowchart, mindmap, plantuml, abc, ir/index, …) and runs
  each patch against it; AND `node build.mjs` runs in CI (`.github/workflows/ci.yml:40`) so the
  throwers fail the build on drift. This is the right design.

## Findings → work items (by ROI)

### 1. ✅ DONE (verified 2026-07-27) — Silent no-op cache-buster bumps — the one real hole
The SMILES registry entry does `if (!code.includes(anchor)) return code` (`esbuild-shared.mjs:1089`)
— **silent** — with a version-literal anchor (`smiles-drawer.min.js?v=2.1.7`), and the smiles source
is NOT asserted by the drift test. So a Vditor smiles-version bump → the `?v=` rewrite silently
doesn't apply → a **stale/cached asset ships**, with no build throw and no test failure. Same risk
class for any `?v=` literal anchor not asserted against real source.
- **Fix:** make every version-bump anchor fail-loud like the other 22 (throw on miss), OR add a
  real-source assertion in the drift test for each `?v=` patch (smiles, and verify mermaid/echarts/
  markmap version bumps are each covered against the actual vendored file). Prefer fail-loud — it's
  consistent with the rest and catches drift at build, not just in the test suite.

### 2. 🟠 Two whole-function string rewrites vs 21 surgical replaces
21 patches do a small targeted `code.replace(ANCHOR, …)` (robust — survives surrounding Vditor
changes). Only `patchPlantumlRender` + `patchGraphvizRender` replace the ENTIRE function via a JS
string (fragile + untyped). Already tracked in [task 144](144-plantuml-architecture-hardening.md)
(item 1 there covers BOTH plantuml and graphviz). Recorded here for the engine-wide picture: the 21
surgical replaces are the pattern to converge on.

### 3. ✅ DONE (2026-07-27) — No mutual-exclusion guard on registry filters
The engine relies on esbuild running only the FIRST matching `onLoad` per file (documented). Adding a
second registry entry with an overlapping `file` filter would silently never run. Each entry targets
a distinct file today, but nothing enforces it.
- **Fix:** a one-time assert in `setup()` (or a unit test over `VDITOR_TS_PATCHES`) that no two
  filters match the same vendored file path — turns a future silent-drop into a loud error.

### 4. 🟡 PARTIAL (2026-07-27) — Anchor fragility spectrum — prefer structural anchors
Anchors range from robust structural ones (`export const insertAfterBlock =`,
`plantumlEncoder.encode(text)`) to fragile cosmetic literals: the Chinese copy-tip string
(`已复制到剪切板`, `patchPreviewCopyTip`), version literals, and the whitespace-sensitive multiline
`itemStyle: { … }` (`patchMindmapThemeColors`). Cosmetic anchors break on a Vditor reformat / i18n
change even when the logic is intact (false drift) — or silently miss (#1).
- **Fix:** catalogue each patch's anchor + its fragility (structural vs literal vs whitespace), and
  re-anchor the fragile ones onto structural tokens where a stabler anchor exists.
- **Done (the fragile subset — the actionable part of this item):** grepped the whole registry
  (`media-src/esbuild-shared.mjs`, 47 `patchXxx` functions across the 29 file-matched entries) for the
  three known fragility SIGNALS — version literals, non-ASCII/translated text, whitespace-sensitive
  multiline template anchors — rather than reading all 47 bodies individually (judged the right
  depth: exhaustive on the risk that matters, not exhaustive on reading every structural one-liner).
  Confirmed **7 fragile anchors, all already fail-loud** (throw "version drift?" on miss — none silent):
  - **5 version-literal `?v=` bumps:** `patchMermaidVersion`, `patchEchartsVersion`,
    `patchMarkmapStatic`, `patchAbcRender`, `patchSmilesVersion` (the last was item 1's fix target).
  - **2 non-ASCII (Chinese UI-text) anchors:** `patchPreviewCopyTip` (`已复制到剪切板` — already known)
    and **newly catalogued here**: `patchInfoDialog` (`组件版本` = "component version", `esbuild-shared.mjs:1085`)
    — an extra guard alongside its structural `tip.show(` anchor, not previously named in this task.
  - **1 whitespace-sensitive multiline anchor:** `patchMindmapThemeColors`'s `itemStyle: { … }` block
    (`:1280`), confirmed still present and unchanged.
  - Spot-checked several of the remaining ~40 functions (`patchIrLinkClick`, `patchWysiwygLinkClick`,
    `patchOutlineCurrent`, `patchIrBlurExpand`) — all anchor on real Vditor SOURCE CODE lines
    (structural), consistent with this task's own "already strong" claim.
  - **Not done:** re-anchoring the 7 fragile ones onto structural tokens (no clearly-stabler
    structural anchor exists for a version-string bump or a translated UI string by definition — the
    thing being anchored IS the literal), and a full function-by-function read of all 47 bodies (the
    remaining ~40 are presumed structural by spot-check + the file's own design pattern, not
    individually re-verified). A full per-patch table remains item 5's territory.

### 5. ✅ DONE (2026-07-28) — 29-entry/49-function surface = a per-bump audit; give it a checklist
A Vditor version bump is now a documented procedure, not tribal knowledge: every `patchXxx` function
(29 registry entries, 49 functions — see the status block above for the exact breakdown) is
catalogued in [`docs/vditor-patch-checklist.md`](../docs/vditor-patch-checklist.md) with its anchor,
anchor fragility, what it guards, and fail-loud-or-silent, grouped by the vendored file it targets.
Linked from `DEVELOPMENT.md`'s Vditor-bundle section and from ADR-0004. The drift test
(`test/backend/vditor-source-patches.test.ts`) remains the enforcement mechanism; this doc is the
human-readable map for reading its failures during an actual bump.

## Tests (per AGENTS)
- **unit** — extend `vditor-source-patches.test.ts`: a real-source assertion for the smiles `?v=`
  anchor (and any other version-bump patch lacking one); a test that `VDITOR_TS_PATCHES` filters are
  mutually exclusive (#3).
- The existing per-patch unit tests + CI build remain the primary drift net.

## See also
- `media-src/esbuild-shared.mjs` (`VDITOR_TS_PATCHES` + `vditorSourcePatches` engine),
  `test/backend/vditor-source-patches.test.ts`, `.github/workflows/ci.yml`.
- [Task 144](144-plantuml-architecture-hardening.md) (the plantuml/graphviz string→module extraction).
- Memory: "Vditor index.css = single linked copy" (the CSS-is-NOT-in-this-registry rule / ADR-0004).
