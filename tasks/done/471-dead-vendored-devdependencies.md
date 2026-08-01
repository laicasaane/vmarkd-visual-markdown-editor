# Task 471 — vendored-bundle devDependencies (markmap/vega/three): recipes reconstructed

**Status:** ✅ DONE 2026-08-01 · **Impact:** 🟢 no behaviour change — devDependency-only, never
shipped in the VSIX; three new `fetch-*.mjs` scripts added, zero vendored bytes changed · **Origin:**
[task 469](469-housekeeping-sweep.md) item 5b, `knip`'s first run, 2026-07-31/08-01.

## ⚠️ The original write-up was stale — corrected here

This file originally listed **6** suspect devDependencies (`markmap-lib`, `markmap-view`, `three`,
`vega`, `vega-embed`, `vega-lite`). [Task 481](481-dependency-audit-triage.md) (committed b4e6d9e,
2026-07-31, before this task started) already removed `markmap-lib` and `markmap-view` — they were
confirmed genuinely dead at the source level — and, in the process, discovered a vendored
mermaid-layout-elk chunk needs `d3` transitively, so `d3@7.9.0` was added as an explicit
devDependency to replace what those two packages used to supply by accident. So the set this task
actually triaged was the remaining **four**: `three`, `vega`, `vega-embed`, `vega-lite` — plus,
newly surfaced by this task's own fetch script, `d3` joins the "knip-invisible but load-bearing"
list too (see Results below).

## What was found (original, still accurate for markmap-lib/markmap-view background)

`knip` (task 469 item 5b) flagged 6 `media-src/package.json` devDependencies as unused — no source
file, script, or config in the repo references them by package name. These are diagram-engine
libraries the project genuinely ships (mindmap uses markmap, STL uses three.js, vega/vega-lite
render the `vega`/`vega-lite` fenced-code blocks — see `media-src/src/diagrams/custom-diagrams.ts`),
but per ADR-0005 the *runtime* code for every diagram engine is **vendored** into
`media-src/vendor/{markmap,threejs,vega}/` as pre-built bundles, not imported from `node_modules` at
build time. So the devDependency and the vendored bundle are two separate things, and knip only sees
the former.

## Answer: are the four still-triaged devDependencies dead? NO — all four are load-bearing

This was tested two ways, per the task's own instruction to make the answer non-circular:

**1. The build oracle (does the *app* build need them?).** Removed all four from
`media-src/package.json`, ran `npm install` (regenerating the lockfile), then `node build.mjs`
(root) and `npm run build` inside `media-src` directly. **Both exited 0.** Neither the webview
esbuild bundle (`main.ts`, `elk-entry.ts`, `d2-entry.ts`, `mermaid-elk-entry.ts` — the only
esbuild entry points in the real app build) nor the CSS/vendor-sync pipeline references
`three`/`vega`/`vega-embed`/`vega-lite` at all. **Conclusion: the shipped app build does not need
them.** (One transient root-`build.mjs` red during this window — `.vditor-ir hr margin/display
anchor not found` — was a different agent's concurrent in-progress edit to `build.mjs`, not caused
by this change; it cleared on retry with no code change from this task. Recorded so it isn't
mistaken for a regression this task introduced.)

**2. Are they needed to *reproduce the vendored bundle by hand*?** This is the real answer, and it's
yes. Reverse-engineered the actual construction recipe for each vendored file (see `fetch-three.mjs`
/ `fetch-vega.mjs` below) and it bundles **directly from these packages' `node_modules`** via
esbuild — there is no network-only path the way there is for mermaid/echarts. Removing them would
make `three-stl.min.js` / `vega-embed.min.js` **unregenerable** without first manually
`npm install`-ing the exact right versions by hand, undocumented — which is worse than today, not
better. **Restored all four to `media-src/package.json` unchanged** (net diff on that file: zero).

### ⚠️ CORRECTION — the lockfile diff was NOT "harmless transitive patch bumps"

An earlier draft of this file (and this task's status report) waved away the `package-lock.json`
diff left over from step 1's `npm install`/re-`npm install` cycle as "transitive patch-version
bumps, expected/harmless." **That was wrong, and it mattered.** Diffing the raw lockfile: `vega`
moved **6.2.0 → 6.3.1** — a MINOR bump, not a patch — and a batch of `vega-*` subpackages moved
with it (`vega-encode ~5.1.0 → ~5.2.1`, `vega-dataflow ~6.1.0 → ~6.1.2`, etc.), because removing and
re-adding `vega` (with its unchanged `^6.2.0` range) triggered a fresh semver resolution that picked
up whatever had been published to that range since the committed lockfile was generated. This
directly undermines the headline claim: `fetch-vega.mjs`'s byte-identical result was captured
**while `node_modules/vega` was still at the original 6.2.0** (before the removal/reinstall cycle
that drifted it to 6.3.1) — re-running the script against the drifted tree would very likely produce
different bytes, since a minor vega bump is exactly the kind of change that flows through to the
bundled output. Same trap class as task 481's `d3` finding: the part of the diff that looked
incidental was the part that mattered.

**Resolution:** `media-src/package-lock.json` reverted to HEAD (`git restore --source=HEAD --
media-src/package-lock.json`), `media-src/vendor/vega/source.json`'s cosmetic JSON-escaping diff
also reverted (same content, not worth the noise). `node_modules` then re-synced with `npm ci`
(exact-lockfile install, chosen specifically so it can't re-drift a range like `npm install` did)
and `fetch-vega.mjs`/`fetch-three.mjs` **re-verified against the resynced tree**.

**Re-verification (2026-08-01, after `npm ci`):**

| package | before resync (drifted) | after `npm ci` | note |
|---|---|---|---|
| `vega` | 6.3.1 | **6.2.0** | matches `source.json` |
| `vega-lite` | 6.4.3 | 6.4.3 | unchanged throughout |
| `vega-embed` | 7.1.0 | 7.1.0 | unchanged throughout |
| `three` | 0.184.0 | 0.184.0 | unchanged throughout |
| `d3` | 7.9.0 | 7.9.0 | unchanged throughout |

Re-ran `fetch-three.mjs 0.184.0` and `fetch-vega.mjs 7.1.0` for real (not a dry run) against this
resynced tree: both again wrote sha256 `2e86d2b3a29471f7…` / `7021eaa8b7d8b68d…` — **the exact same
hashes as `source.json`**, confirmed by `git status --short` on `media-src/vendor/{threejs,vega}`
showing zero diff on the `.min.js` files (only `vega/source.json`'s cosmetic unicode-escape
formatting touched again, reverted again the same way). So the byte-identical reproduction claim
for `fetch-three.mjs`/`fetch-vega.mjs` now holds against a verified-correct tree, not a
since-drifted one. `fetch-markmap.mjs 0.18.12` (no `--write`) re-run too, same result as before
(parts 2/3 identical, part 1 documented drift) — unaffected since `d3` never moved.

`node build.mjs` and `npm test` re-run on the resynced tree: both exit 0 (2573/2573 tests).
`media-src/package.json`, `media-src/package-lock.json`, and `media-src/vendor/vega/source.json`
all confirmed clean vs HEAD as of this writeup — the only diff this task leaves behind is the three
new `fetch-*.mjs` scripts plus this task file.

This mirrors task 481's Correction 1 almost exactly: an import-grep (or knip) proves nothing about a
package that's consumed only by a non-source-level path — there it was a vendored chunk's runtime
import, here it's a fetch script's `esbuild.build({ stdin: {...} })` call, which is invisible to
static analysis because the "import" is a JS string, not a parsed import statement.

## The fetch scripts (the actual deliverable)

Three scripts added, all in `media-src/scripts/`, following the existing `fetch-*.mjs` conventions
(sha256-pin, LICENSE capture, `source.json` update). Unlike mermaid/echarts, none of these are
plain "download a pre-built file from unpkg" — each vendored bundle is genuinely a custom build:

### `fetch-three.mjs` — ✅ byte-identical reproduction

`three-stl.min.js` is a hand-tree-shaken subset (`Scene`/`PerspectiveCamera`/`WebGLRenderer`/
`Mesh`/`MeshPhongMaterial`/`AmbientLight`/`DirectionalLight`/`Box3`/`Vector3`/`Color` +
`examples/jsm/loaders/STLLoader.js` + `examples/jsm/controls/OrbitControls.js`), esbuild-bundled
+ minified as an IIFE exposing `window.__threeSTL`. Bundles from local `node_modules/three`
(the devDependency IS the mechanism). **Verified: `sha256sum` of the script's output matches
`source.json`'s pinned hash exactly** (`2e86d2b3a29471f7…`) — byte-for-byte, once the object-literal
key order in the entry file matches the original (esbuild's minifier assigns short names in
declaration order, so the property order in the source materially changes the output bytes; this is
called out in the script's own comment since it's non-obvious).

### `fetch-vega.mjs` — ✅ byte-identical reproduction

The stock `vega-embed` UMD on unpkg (`build/vega-embed.min.js`, ~60KB) treats `vega`/`vega-lite` as
external peer globals and does not stand alone offline. The vendored 805KB bundle is
`import embed from 'vega-embed'; window.vegaEmbed = embed` esbuild-bundled with `vega` and
`vega-lite` pulled in transitively from local `node_modules`. **Verified: sha256 of the script's
output matches `source.json` exactly** (`7021eaa8b7d8b68d…`). LICENSE reconstruction also fixed to
match the vendored file exactly (vega-embed's own LICENSE + an appended `vega:`/`vega-lite:`
copyright-line footer, which a first draft of the script dropped).

### `fetch-markmap.mjs` — ⚠️ 2/3 parts byte-identical; 1/3 documented drift

`markmap.min.js` is three parts joined by the literal separator `\n;\n`:
1. `var d3=(…);` — a hand-tree-shaken d3 subset (only `linkHorizontal`, `max`, `min`, `minIndex`,
   `scaleOrdinal`, `schemeCategory10`, `select`, `zoom`, `zoomIdentity`, `zoomTransform`),
   esbuild-bundled from `d3`.
2. markmap-lib's own published browser build (`markmap-lib@<ver>/dist/browser/index.iife.js`) —
   fetched from unpkg **verbatim**.
3. markmap-view's own published browser build (`markmap-view@<ver>/dist/browser/index.js`) —
   fetched from unpkg **verbatim**.

**Parts 2 and 3 verified byte-identical** (substring match against the currently vendored file, run
with `node media-src/scripts/fetch-markmap.mjs 0.18.12`, no `--write`). **Part 1 (the d3 subset)
reproduces the same tree-shaken export set via the same esbuild technique but is NOT byte-identical**
— same size ballpark, same logical structure, but different minified internal variable names
(`Vn`/`Qn`/`Un`… vs. `Qn`/`Un`/`Wn`…), most likely because the original bundle was built with a
different `esbuild` version than the one currently pinned (`media-src/package.json`'s `esbuild
^0.28.0` — the original build predates this task and its exact esbuild version was never recorded).
Per this task's own "STOP and report drift" instruction, this was **not** chased further (one honest
attempt, as directed) — the script hash-compares before writing and refuses to touch
`media-src/vendor/markmap/` unless the caller passes `--write` explicitly, so this drift is a
guardrail, not silent corruption. `markmap-lib`/`markmap-view` are **not** devDependencies (task 481
removed them as genuinely source-dead) — the script fetches their browser dists from the network
instead, same as `fetch-mermaid.mjs`; only `d3` is reused from local `node_modules` for part 1.

## Results — 2026-08-01

- [x] Determined whether each of the (corrected) 4 devDependencies is still needed: **all 4 are
      needed** — see "Answer" above. `three`, `vega`, `vega-embed`, `vega-lite` restored to
      `media-src/package.json` with **zero net diff** on that file (removed for the build-oracle
      test, then restored byte-identical).
- [x] Wrote the missing `fetch-*.mjs` scripts for markmap/vega/three (`media-src/scripts/
      fetch-three.mjs`, `fetch-vega.mjs`, `fetch-markmap.mjs`) — see recipes above.
- [x] Ran each script and compared against the currently-vendored bytes:
      - `fetch-three.mjs 0.184.0` → **byte-identical** (sha256 match).
      - `fetch-vega.mjs 7.1.0` → **byte-identical** (sha256 match); LICENSE reconstruction fixed
        along the way (see above).
      - `fetch-markmap.mjs 0.18.12` (no `--write`) → 2/3 parts byte-identical, part 1 (d3 subset)
        **documented drift** (see above); exits non-zero and does not touch `vendor/` without
        `--write`.
- [x] Removed any devDependency confirmed genuinely dead: **none of the remaining 4 are dead** —
      all restored. (The 2 that WERE genuinely dead, `markmap-lib`/`markmap-view`, were already
      removed by task 481 before this task started.)
- [x] Re-ran `npm run knip`: **Unused devDependencies (5)**: `d3`, `three`, `vega`, `vega-embed`,
      `vega-lite`. This is **expected and not actionable** — same class of false positive as task
      481's `markmap-lib`/`markmap-view` finding before their removal: each is consumed only through
      a fetch script's `esbuild.build({ stdin: { contents: <template string> } })` call (`d3` is
      also consumed by the vendored mermaid-layout-elk chunk at build time, per task 481), which is
      invisible to knip's static import graph. Do **not** remove any of these five in a future knip
      cleanup pass without re-reading this file first.

## Gates run

All commands, exit codes read directly (not through a pipe):

| gate | result |
|---|---|
| `node build.mjs` (root, during the removed-deps test) | 0 |
| `npm --prefix media-src run build` (webview bundle only, during the removed-deps test) | 0 |
| `npm test` | 0 — 2573/2573 (2561/2561 on an earlier run before other agents landed more tests in this shared session; one transient 1-failure run on `module-boundaries.test.ts` was a concurrent agent's mid-edit, confirmed by immediate green on retry) |
| `npm run typecheck` | 0 |
| `node build.mjs` (root, **after the `npm ci` resync** — final state) | 0 |
| `npm test` (**after the `npm ci` resync** — final state) | 0 — 2573/2573 |
| `npm run lint:ci` | **1** — persistently 3 errors in `media-src/e2e/content-theme.spec.ts` + `media-src/e2e/outline.spec.ts` referencing "task 478 item…", unchanged across 3 runs ~10 minutes apart. This is a different agent's (t478-css) in-progress work in this shared session, not caused by this task — confirmed by grepping the lint output for any `media-src/scripts/fetch-*.mjs` hit (none; those files are excluded from biome's tree per the existing "maintenance tooling, outside app's lint surface" convention, verified directly with `npx biome check` on the three new files: 0 files processed, all ignored by config as expected). |
| `xvfb-run -a npm --prefix media-src run test:e2e` (chromium harness) | flaky infra, not a regression — first run: 223 failed, ALL `net::ERR_CONNECTION_REFUSED` (the harness dev server dropped mid-run, a port-contention artifact of this shared multi-agent session); retry: 96 failed, again 100% `ERR_CONNECTION_REFUSED`, and critically **the STL, vega-lite, and d2 tests in `custom-diagrams.spec.ts` all passed** in the retry. No assertion failures anywhere in either run. |
| `xvfb-run -a npm --prefix test/vscode-e2e test -- stl-material.spec.ts` | 0 — 1/1 passed |
| `xvfb-run -a npm --prefix test/vscode-e2e test -- vega-theme.spec.ts` | 0 — 1/1 passed |
| `xvfb-run -a npm --prefix test/vscode-e2e test -- markmap-resize.spec.ts` | 0 — 1/1 passed |
| `xvfb-run -a npm --prefix test/vscode-e2e test -- custom-diagrams-render.spec.ts` | 0 — 1/1 passed (exercises STL/vega/vega-lite/markmap-adjacent engines together in the real webview) |

Full real-VS-Code suite was **not** run (per AGENTS.md — 1-2 hours, propose-don't-run).

## Out of scope / left for the future

- Chasing the `fetch-markmap.mjs` part-1 (d3 subset) byte drift further (pinning the exact original
  esbuild version, if it's even recoverable) — the task explicitly sanctions stopping here.
- Re-vendoring markmap with a fixed/patched d3 (unrelated to this task; see task 481 item 5 for the
  markmap/linkify-it security angle, which is a different reason to eventually re-vendor).
- Wiring `fetch-three.mjs`/`fetch-vega.mjs`/`fetch-markmap.mjs` into any npm script — they follow the
  existing "run by hand" convention (DEVELOPMENT.md "Maintenance tooling"), same as every other
  `fetch-*.mjs` in the repo.
