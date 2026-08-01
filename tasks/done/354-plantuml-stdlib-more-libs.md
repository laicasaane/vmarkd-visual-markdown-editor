# Task 354 — Vendor more PlantUML stdlib icon libraries (offline), size-optimized

**Status:** ✅ DONE (2026-07-05) — vendored the **7 cleanly-licensed** libs of the requested set.

## Done — what shipped
Vendored 7 MIT/Apache icon libs from the **plantuml/plantuml-stdlib aggregator** (`stdlib/<folder>`),
pinned to commit **`bdbb819`** (the aggregator has no release tags → sha pin, per task 353). Packed via the
task-136 pipeline (`fetch-plantuml-stdlib.mjs`), lazy-loaded per reference, `/all` synthesized at runtime.

| lib | prefix | packed .js | license (origin) |
|---|---|---|---|
| k8s | `k8s` | 46 KB | MIT (dcasati/kubernetes-PlantUML) |
| eip | `eip` | 48 KB | MIT (plantuml-stdlib/EIP-PlantUML) |
| edgy | `edgy` | 27 KB | MIT (boessu/plantuml-stdlib — README) |
| domainstory | `DomainStory` | 33 KB | MIT (johthor/DomainStory-PlantUML) |
| cloudogu | `cloudogu` | 128 KB | MIT (cloudogu — README) |
| cloudinsight | `cloudinsight` | 189 KB | MIT (plantuml-stdlib/cicon-plantuml-sprites) |
| kubernetes | `kubernetes` | 303 KB | Apache-2.0 (plantuml-stdlib/plantuml-kubernetes-sprites) |

Total **~774 KB** packed (lazy — zero main-bundle cost). Licenses shipped per lib (5 fetched from origin
repos, 2 synthesized MIT NOTICE for edgy/cloudogu which declare MIT but ship no LICENSE file).

### Licensing decision (user chose "clean MIT/Apache only")
A license audit of the 12 requested libs surfaced problems, so 5 were **deliberately NOT vendored** (user
picked the clean tier via AskUserQuestion):
- **adaml** → GPL-3.0 (copyleft) — excluded.
- **gcp, elastic** → origin repos (Crashedmind/*) ship NO license; elastic README = informal "shared with
  kind permission from Elastic" (not a redistribution grant); GCP/Elastic are brand icons — excluded.
- **classy, classy-c4** → james-gadrow-kr/*, no LICENSE and no README = all-rights-reserved — excluded.
Re-add on explicit request if the licensing risk is accepted.

### Size optimization (the AWS `/all` trick, verified)
- **gcp is not vendored** (licensing), but the mechanism was verified: every `all.puml` is dropped
  (`EXCLUDE_FILE`) and `<lib/Cat/all>` is synthesized from the direct-child icons (plantuml-stdlib.ts).
  Confirmed pure-concatenation for k8s/OSS/all (static `!include` of siblings) and cloudinsight/all
  (`!foreach $sprite` → the flat icon set — synthesis reproduces it, and sidesteps the variable-include our
  textual expander can't evaluate). A curated cross-category `all` (elastic) would NOT be synthesis-safe —
  documented in the packer; none of the vendored libs are that case.

### Two bugs found + fixed while wiring it up
1. **Transitive lib deps** — k8s/Common builds on `<C4/C4>`, which a `<k8s/…>` source never names, so c4.js
   wasn't auto-loaded → k8s macros went missing. Added `STDLIB_DEPS = { k8s: ['c4'] }` +
   `withStdlibDeps` (plantuml-render.ts) so referencing k8s also loads c4. (domainstory references the
   unvendored material2.1.19 only inside a `!if $icon`-guarded procedure — an optional icon feature; core
   renders without it, so NOT a declared dep.)
2. **Nested `@startuml`** — edgy/cloudogu/cloudinsight icon files wrap their defs in `@startuml…@enduml`
   for standalone preview; inlining them injected a nested `@startuml` → "Syntax Error (Assumed diagram
   type)". Added `stripDiagramWrappers` (plantuml-stdlib.ts) — strips `@start…/@end…` from INLINED files
   only (never the user's top-level source). C4/awslib/azure carry no wrapper → no-op for them.

### Verification
- `node build.mjs` sha-gate green (10 maps + 10 licenses). `vendored-licenses` unit 81 green.
- Unit: `plantuml-stdlib.test.ts` (real vendored maps resolve, `/all` synthesis, wrapper strip, casing)
  + `plantuml-render.test.ts` (`referencedStdlibLibs` dep-closure). Full suite **1351 green**. stdlib.ts
  100% line coverage.
- Real-VS-Code e2e `plantuml-stdlib-more.spec.ts` — all 7 libs render offline, no Fatal error, labels
  present, c4 loaded as k8s's dep. Regression `plantuml-stdlib` + `plantuml-multiblock` (C4/AWS/Azure)
  still green. `typecheck` + `lint:ci` clean.

To add a lib later: append to `LIBS` in `fetch-plantuml-stdlib.mjs` (repo+sha/tag, distSub, license) +
`STDLIB_FILES` + the vendored-assets `copy`/`license` arrays, re-pack, add an e2e block.

### Post-landing fixes (found while the user eval'd a demo of all diagram types)
- **eip rendered EMPTY (10×10)** — a latent `stripInertStdlibLines` bug: it dropped the `/'…'/`
  block-comment CLOSER `'/` (starts with `'`), leaving the block open → it swallowed EIP's macros AND the
  user's diagram. Fixed with `'(?!\/)` (keep the closer); would have hit any stdlib with `/'…'/` blocks.
  Strengthened the e2e to assert each block renders NON-EMPTY (was only checking non-fatal).
- **Sprite diagrams upscaled/stretched** — `main.css` `min-width:300px` blew up small icon diagrams;
  scoped the boost to pure-vector plantuml (`:not(:has(image))`) so sprite diagrams render natural.
- **⚠️ Sizing/fonts still look wrong to the user → task 355 (open).** The `:has(image)` scope wasn't
  enough; a proper holistic sizing/font pass is tracked in **[355](355-diagram-sizing-fonts.md)**.

---
_Original plan below (kept for reference)._

## Problem

## Problem
Offline `!include <lib/…>` only works for the 3 libs we vendor (`c4`, `awslib`, `azure` — see
`STDLIB_FILES` in `media-src/src/plantuml-render.ts`). Every other stdlib icon library errors offline
(`[vmarkd: stdlib file not found offline: <k8s/…>]` + undefined-macro). The user wants the **cheap tier**
added. (Native PlantUML diagram TYPES already work offline — task 137; this is only about icon LIBRARIES.)

## Libs to add (the "cheap tier" — the user's list)
Sizes = the packed `.min.js` from the upstream js-plantuml 1.2026.6 build (measured in the task-352 spike;
our packed `.js` may differ). Azure is already vendored.

| lib | ~size | what |
|---|---|---|
| `k8s` | 49 K | Kubernetes (small set) |
| `eip` | 39 K | Enterprise Integration Patterns |
| `adaml` | 18 K | ArchiMate/ADA |
| `edgy` | 26 K | EDGY (enterprise design) |
| `domainstory` | 30 K | Domain Storytelling |
| `classy` / `classy-c4` | 43 K / 43 K | "classy" C4 style |
| `cloudogu` | 127 K | Cloudogu |
| `cloudinsight` | 189 K | Cloudinsight |
| `gcp` | 273 K | Google Cloud Platform |
| `kubernetes` | 300 K | Kubernetes (fuller) |
| `elastic` | 406 K | Elastic stack |

Total ≈ **1.3 MB** for the cheap tier (before the `/all` size-optimization below). Explicitly OUT of scope
(too heavy — add only on specific request): `office` 1.4 M, `osa` 1.9 M, `logos` 5.2 M, `material` 6.7–16.4 M,
`tupadr3` 19 M, `ibm` 22 M, versioned `awslib10/14/20`, `bootstrap`.

## Plan
Reuse the task-136 pipeline end-to-end:
1. **Source** each lib from its upstream repo, **pinned to a release tag** (task 353 convention — do NOT use
   a mutable branch). The `plantuml/plantuml-stdlib` repo aggregates most of these as subfolders and is
   tagged — likely the cleanest single pinned source; confirm per lib (some have their own repo, as
   `source.json` already does for awslib).
2. **Pack** each lib's `.puml` files into a `<lib>.js` file-map (`window.__vmarkdPumlStdlib['lib/path'] =
   text`), same format as `c4.js`/`awslib.js`, through the task-136 packer.
3. **Register:** add each lib to `STDLIB_FILES` (`media-src/src/plantuml-render.ts`), the vendored-assets
   registry, and `source.json` (with tag + sha256). Vendor each LICENSE.
4. **Prefix check:** confirm the include prefix each lib uses (e.g. `<k8s/…>`, `<gcp/…>`) matches the map key
   prefix — `referencedStdlibLibs` extracts the lowercased prefix before the first `/`, so `STDLIB_FILES`
   keys must match exactly (this is why `<awslib20/…>` doesn't resolve today — we key `awslib`, not
   `awslib20`).

## Size optimization (the user's explicit ask — "like the AWS `/all` trick")
Task 136 already **synthesizes `<lib/Cat/all>` aggregators at runtime** from the individual icon files
(`plantuml-stdlib.ts` → `expandFile`: when the key ends in `all`, it concatenates the category's direct-child
icons instead of shipping the redundant aggregator — saved ~3.4 MB on AWS). So:
- **Verify each new lib follows the same structure** (category dirs of individual icons + an `all.puml` that
  is exactly their concatenation). If yes → **drop the `all.puml` files from the pack** and let the runtime
  synthesis rebuild them (same saving as AWS). If a lib's `all.puml` has extra glue (not a pure
  concatenation), it must be shipped — flag those.
- **Also drop** inert lines already stripped for perf (`stripInertStdlibLines` — comments/blanks, task 349)
  and any `*-list`/preview/demo `.puml` that isn't reachable from an `!include`.
- Report the before/after packed size per lib so the user sees the win (like AWS's aggregator drop).

## Verification
- Real-VS-Code e2e: a fixture with one diagram per new lib (`!include <k8s/…>`, `<gcp/…>`, `<elastic/…>`, …)
  renders a real SVG with the icon (no "not found offline" note, no undefined-macro error). Extend the
  offline-stdlib fixture/spec from task 136.
- Unit: `expandStdlibIncludes` resolves each new lib's includes + the `/all` synthesis for any lib whose
  aggregators were dropped.
- `node build.mjs` sha gate green; `lint:ci` + typecheck clean. Report the total added VSIX size.

## Related
Task 136 (the pipeline + `/all` synthesis this reuses), 137 (native type coverage — orthogonal), 349
(`stripInertStdlibLines` size trim), 353 (pin to tags — apply here too). Memory:
`plantuml-stdlib-preinline-mechanism`. Files: `media-src/src/plantuml-render.ts` (`STDLIB_FILES`),
`media-src/src/plantuml-stdlib.ts` (`/all` synthesis), `media-src/vendor/plantuml-stdlib/`, the task-136 packer.
