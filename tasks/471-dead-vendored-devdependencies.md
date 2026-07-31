# Task 471 — 6 possibly-dead vendored devDependencies (markmap/vega/three)

**Status:** 📋 OPEN · **Impact:** 🟢 no behaviour change if confirmed dead — devDependency-only,
never shipped in the VSIX · **Origin:** [task 469](469-housekeeping-sweep.md) item 5b, `knip`'s
first run, 2026-07-31/08-01.

## What was found

`knip` (task 469 item 5b) flags 6 `media-src/package.json` devDependencies as unused — no source
file, script, or config in the repo references them by package name:

- `markmap-lib`
- `markmap-view`
- `three`
- `vega`
- `vega-embed`
- `vega-lite`

These are diagram-engine libraries the project genuinely ships (mindmap uses markmap, STL uses
three.js, vega/vega-lite render the `vega`/`vega-lite` fenced-code blocks — see
`media-src/src/custom-diagrams.ts`), but per ADR-0005 the *runtime* code for every diagram engine is
**vendored** into `media-src/vendor/{markmap,threejs,vega}/` as pre-built bundles (see
`media-src/vendor/markmap/source.json` etc.), not imported from `node_modules` at build time. So the
devDependency and the vendored bundle are two separate things, and knip only sees the former.

## ⚠️ Before removing anything

Unlike lute/mermaid/echarts/plantuml-stdlib/mermaid-layout-elk — each of which has a checked-in
`media-src/scripts/fetch-*.mjs` that re-derives the vendored bundle from the matching npm package
(sha-pinned, see `DEVELOPMENT.md` "Maintenance tooling") — **there is no `fetch-markmap.mjs` /
`fetch-vega.mjs` / `fetch-three.mjs`.** That's the actual finding: not just "these 6 packages look
unused," but "these 3 vendored bundles have no reproducible, checked-in way to regenerate them,"
which is arguably the more important half of this task. Two separate but related questions to
answer, in order, before touching `package.json`:

1. **Are the devDependencies still needed for anything?** `knip` only sees static imports/requires
   and script/binary references — it does **not** see "someone ran `npm install` + a manual copy
   step once, by hand, outside any checked-in script." Check `media-src/vendor/{markmap,threejs,vega}/
   source.json` for how each bundle claims to have been produced, check git blame/history on those
   vendor directories for how they were actually added, and ask whoever vendored them (or search
   chat/task history) before assuming "unreferenced by knip" means "safe to delete." If the answer
   is genuinely "nobody remembers, and there's no script," that's useful information on its own —
   it means the next vendor-version bump for these three engines will be manual and undocumented,
   unlike every other diagram engine in the project.
2. **If they really are dead**, removing them is a `media-src/package.json` + lockfile change only —
   confirm `node build.mjs` and the full e2e suite (`npm --prefix media-src run test:e2e`, plus the
   real-VS-Code mindmap/STL/vega/vega-lite diagram specs) still pass after removal, since none of
   those tests exercise `node_modules` directly but a lockfile change can still shift transitive
   versions.

## Suggested first step

Write (or find) the missing `fetch-markmap.mjs` / `fetch-vega.mjs` / `fetch-three.mjs` scripts,
following the existing `fetch-*.mjs` pattern (sha-pin, license capture, `source.json` update) — that
resolves the ambiguity either way: if the fetch script confirms the devDependency is exactly what
produces the vendored bundle, keep it and the mystery is closed; if writing the script turns out to
need a *different* version or package than what's currently declared, that's a real drift bug worth
its own finding.

## Checklist

- [ ] Determine whether each of the 6 devDependencies is still needed to (re)produce its vendored
      bundle.
- [ ] Write the missing `fetch-*.mjs` scripts for markmap/vega/three (or document why they can't
      follow the existing pattern).
- [ ] Remove any devDependency confirmed genuinely dead — `node build.mjs` + e2e green after.
- [ ] Re-run `npm run knip` and record the new unused-devDependency count here.
