# Task 136 — PlantUML `!include` / standard library / sprites (C4, AWS, Azure, archimate)

> **Status:** ✅ DONE (2026-07-03) — offline `!include <C4/…>` + `<awslib/…>` + `<azure/…>` render in
> real VS Code. HIGH priority; was the biggest gap in our offline PlantUML (task 87).
>
> ## Outcome (scope = C4 + AWS + Azure, user-chosen)
> Our TeaVM engine ships no stdlib + no include hook, so we EXPAND `!include <lib/…>` textually before
> `render()`: a typed, unit-tested expander (`media-src/src/plantuml-stdlib.ts`) inlines each referenced
> `.puml` from a vendored per-lib file-map, strips the `!if %variable_exists("RELATIVE_INCLUDE") … !else
> <remote> … !endif` guard STRUCTURALLY (keep the relative branch — else the engine skips the inlined
> content and the lib's `?=` defaults never run → "Cannot convert $X to integer"), resolves dir-relative
> includes (`./`, `../`, include-once), and drops remote `http(s)` includes with a note. Wired into
> `plantuml-render.ts`: a plain diagram is untouched (`needsStdlib` gate); a stdlib diagram lazy-loads
> ONLY the referenced lib map(s) via `loadScript` (a window global — CSP allows script-src, not fetch)
> and expands before render. C4/AWS/Azure set their own palettes (they carry `skinparam`/`<style>`, so
> `injectPlantumlTheme`'s `HAS_OWN_THEME` gate leaves them alone); plain diagrams still pair to the
> content theme.
>
> **Vendoring** (`media-src/scripts/fetch-plantuml-stdlib.mjs` → `media-src/vendor/plantuml-stdlib/`):
> C4-PlantUML (MIT), aws-icons-for-plantuml (MIT-0), Azure-PlantUML (MIT), packed to per-lib `.js`
> file-maps (`c4.js` 201 KB / 32 files, `awslib.js` 3.76 MB / 827, `azure.js` 265 KB / 268), sha-pinned
> in `source.json`, shipped via the `plantuml-stdlib` vendored-assets entry. **The `all.puml` category
> aggregators are dropped** (~3.4 MB / half of awslib) — every individual icon still resolves; a rare
> `<awslib/Compute/all>` include falls back to the "not found offline" note. `!includeurl`/remote
> `https://` includes stay unsupported offline (dropped with a note, by design).
>
> **Tests:** `plantuml-stdlib.test.ts` (9 unit — detection, dir-aware resolve, guard-strip, remote-drop,
> include-once, missing — 100% lines/funcs), `test/vscode-e2e/plantuml-stdlib.spec.ts` (real-VS-Code: C4
> `«person» User`/`«container» Web App`, AWS `«EC2» Web Server`, Azure `«AzureVirtualMachine» My VM` all
> render offline, no "Fatal parsing error", each lib map lazy-loaded). Gates green (unit 1290, typecheck,
> lint, coverage, bundle-size). Local `!include "sibling.puml"` (host FS) remains out of scope (task 131
> shape). Builds on task 87 (TeaVM engine, `patchPlantumlRender` in `media-src/esbuild-shared.mjs`).
>
> ## Step 0 RESULT — stdlib is NOT bundled (verified in real VS Code)
> Rendered `!include <C4/C4_Container>` and `!include <awslib/AWSCommon>` through our actual engine
> (`media/vditor/dist/js/plantuml/plantuml.js`, real-VS-Code probe): both produce a PlantUML **"Fatal
> parsing error"** SVG at the `!include` line, while a plain diagram (no include) renders fine and our
> injected `<style>` block is NOT the cause (the control carries it and renders). So C4/AWS/Azure
> currently FAIL offline → we proceed. (`js-plantuml-1.2026.6` ships no stdlib; grep is inconclusive
> because PlantUML stores stdlib as compressed `.repx` — only a render settles it.)
>
> ## Mechanism — pre-inline is VIABLE (the pre-built TeaVM engine has no include hook)
> The engine is a black box with no include-resolution API, so the lever is a **JS-side textual
> `!include` expander**: vendor the stdlib `.puml` files and inline them into the source before
> `render()`. Verified the engine SUPPORTS the C4 preprocessor (`%intval`, `!unquoted function`,
> `!return`, `!if`/`!while` all render), so this is fundamentally sound. BUT a naïve "inline relative,
> drop remote" expander errors deep in C4 (line ~1154): C4-PlantUML files use an
> `!if %variable_exists("RELATIVE_INCLUDE") … !else !includeurl … !endif` convention, so the inliner
> must honour that (set `RELATIVE_INCLUDE`, or resolve the correct branch) — not just drop the remote
> line. Also vendor the **version-matched** `plantuml/plantuml-stdlib` C4 (what the jar bundles), NOT
> `C4-PlantUML@master` (ahead of our 1.2026.6 engine). Size: the C4 set is ~100 KB (small); AWS/Azure
> sprite sets are hundreds of files / multi-MB (a separate, large commitment).
>
> ## Recommendation (decision-gate)
> Ship **C4 only** first (small, highest-value) via the pre-inline expander + a vendored version-matched
> C4 subset; detect `!include <awslib/…>`/`<azure/…>`/`!includeurl` and show a precise
> "not available offline" note (never a silent failure). AWS/Azure = a follow-up if wanted (size). The
> user's call before implementing — recorded below in the original plan.

---
### Original plan (as proposed 2026-06-24)

## Problem
PlantUML diagrams routinely pull external content:
```plantuml
!include <C4/C4_Container>
!include <awslib/AWSCommon>
!include <azure/AzureCommon>
!includeurl https://.../archimate.puml
```
`!include` (bundled stdlib), `!includeurl` (remote), and the standard-library sprite sets (C4,
AWS/Azure icons, archimate, …) reference files. We render **fully offline** with no filesystem and a
strict CSP, so:
- `!includeurl <remote>` → blocked (no remote fetch, by design — privacy + offline).
- `!include <stdlib/...>` → works ONLY if the TeaVM `plantuml.js` build bundles plantuml-stdlib.
  **Unverified.** If it doesn't, C4/AWS/Azure diagrams fail (compile error → raw source fallback).

C4 + AWS/Azure architecture diagrams are extremely common, so this is the highest-value gap.

## Step 0 — VERIFY (do this first, it decides everything)
Render a `!include <C4/C4_Container>` (and an `<awslib/...>`) diagram through our actual engine
(`media/vditor/dist/js/plantuml/plantuml.js`, e.g. a throwaway harness like `tmp/d2-compare`'s, or the
real-VS-Code suite) and see whether the stdlib resolves. Outcomes:
- **Bundled** → C4/AWS already work; downgrade this task to "add a C4 example + test" and document it.
- **Not bundled** → proceed below.

## Approach (if stdlib is NOT bundled)
- **Vendor plantuml-stdlib** (the `stdlib/` from `plantuml/plantuml-stdlib`, MIT) and teach the TeaVM
  engine / our `plantumlRender` patch to resolve `!include <...>` against it (an in-memory file map the
  engine can read). Size-gate it (sha-pinned like the engine) and lazy-load — the full stdlib is large,
  so consider shipping only the popular sets (C4, AWS, Azure) or all behind the lazy plantuml load.
- **`!includeurl` (remote):** keep unsupported (offline). Detect it → clear note ("remote includes are
  disabled offline"), like the d2-imports task (131). Optionally host-side resolve later (the extension
  host has network/FS) — separate, gated.
- **Local `!include "file.puml"`** (sibling file): like d2 imports — needs host-side resolution against
  the `.md` folder; defer / separate.

## Decision gates
- Bundle the whole stdlib (big) vs a curated subset (C4/AWS/Azure) vs none-just-document. Decide after
  Step 0 + a size check.

## Acceptance / tests
- A C4 (`!include <C4/C4_Container>`) diagram renders an SVG offline (real-VS-Code), or — if out of
  scope — shows a precise "stdlib/include not available offline" note (never a silent failure).
- Keep typecheck / lint / `npm test` green.

## Related
Task 87 (PlantUML offline), 131 (d2 imports — same offline/no-FS shape), 67 (CSP). Patch +
`themePumlSvg` in `media-src/esbuild-shared.mjs`; vendored engine `media-src/vendor/plantuml/`.
