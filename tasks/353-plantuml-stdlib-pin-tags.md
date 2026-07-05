# Task 353 — Pin the PlantUML stdlib vendor maps to immutable tags (not branch `main`)

**Status:** 📋 TODO (small / reproducibility hygiene). Requested 2026-07-05.

## Problem
The vendored stdlib file-maps (`media/vditor/dist/js/plantuml-stdlib/{c4,awslib,azure}.js`, packed by the
task-136 pipeline) are sourced from **mutable branches**, per `media-src/vendor/plantuml-stdlib/source.json`:
- `c4` → `plantuml-stdlib/C4-PlantUML` @ **`master`**
- `awslib` → `awslabs/aws-icons-for-plantuml` @ **`main`**
- `azure` → `plantuml-stdlib/Azure-PlantUML` @ **`master`**

So a re-fetch/re-pack pulls whatever is on the branch at that moment — **not reproducible**, unlike the
engine itself (`plantuml.js` is pinned to the stable, immutable tag `v1.2026.6`; see the plantuml
`source.json` + task 144 item 5). A silent upstream change could shift the vendored icons/macros between
builds with no sha review.

## Plan
For each lib, replace the branch with a specific **release tag or commit sha** in
`media-src/vendor/plantuml-stdlib/source.json` (`branch` → `tag`/`ref`), pick the latest stable tag of each
repo, re-pack from that ref through the task-136 packer, and update the per-file `sha256` guards. Record the
exact tag in `source.json` (like the engine's pin note). No runtime change — same maps, just a pinned source.

- C4-PlantUML: use its latest release tag (e.g. `v2.x`).
- aws-icons-for-plantuml: use a release tag (e.g. `v20.x`) — note our prefix is bare `awslib/` (the repo's
  own `dist` prefix), keep it.
- Azure-PlantUML: latest release tag.

## Constraints
- The packed maps must stay **byte-comparable** in structure (same `window.__vmarkdPumlStdlib['lib/path']`
  keys, same `/all` synthesis — see task 136 / `plantuml-stdlib.ts`). Only the *source ref* changes; the
  content changes only insofar as the tag differs from the current `main`/`master` HEAD.
- Update the `source.json` sha256 for each re-packed `.js`; the `build.mjs` `syncVendored` sha gate must pass.
- Keep the vendored LICENSE files.

## Verification
- `node build.mjs` green (sha gate passes with the new pins).
- The existing PlantUML e2e (`plantuml-cache`, `plantuml-multiblock`, C4/AWS/Azure render) stay green — the
  pinned maps still render the same diagrams.
- `source.json` documents the exact tag/sha per lib.

## Related
Task 136 (offline stdlib + the pack pipeline + `/all` synthesis), 137 (type matrix), 354 (adds MORE stdlib
libs — should pin them to tags from the start, same convention as this task). Files:
`media-src/vendor/plantuml-stdlib/source.json`, the task-136 packer, `build.mjs` (`syncVendored`).
