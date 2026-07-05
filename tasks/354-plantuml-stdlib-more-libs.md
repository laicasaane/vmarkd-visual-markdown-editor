# Task 354 — Vendor more PlantUML stdlib icon libraries (offline), size-optimized

**Status:** 📋 TODO (medium). Requested 2026-07-05 — user wants k8s/gcp/elastic/… working offline like C4/AWS/Azure.

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
