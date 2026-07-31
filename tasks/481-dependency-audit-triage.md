# Task 481 — dependency-audit triage: 6 vulnerable packages across three workspaces, plus one the audit cannot see

**Status:** 📋 OPEN — measured 2026-07-31, nothing changed yet · **Impact:** 🟡 medium — the shipped
production tree audits clean, so this is hygiene rather than an incident; the one item with real
user-facing reach (item 5) is a **local DoS** on a file the user chose to open, not RCE and not
exfiltration · **Origin:** ad-hoc `npm audit` / `bun audit` run requested by the user.
**Related:** [469](469-housekeeping-sweep.md) (the quality toolchain and the "wire a tool into CI
only once it runs clean" rule that keeps this OUT of `quality.mjs`),
[468](468-cross-file-link-opens-builtin-editor.md) (same lesson as item 5: a gate that measures the
wrong thing reports green).

## Measured — 2026-07-31

All three workspaces — `./package.json`, `media-src/package.json`, `test/vscode-e2e/package.json`;
`find . -name package.json -maxdepth 3 -not -path "*/node_modules/*"` finds no fourth (the hits
under `tmp/` and `.worktrees/` are throwaway copies, not part of the repo's manifest set).
`npm audit` and (where npm supports it) `npm audit --omit=dev`.
Cross-checked with `bun audit` (Bun 1.3.10); it reports the same advisories, counted
**per-advisory** instead of per-package, which is why its totals look larger (root: 10 vs 3).
Bun migrated `package-lock.json` in memory only — `git status` stayed clean, no `bun.lock` written.

### root

```
npm audit             → 3 high severity vulnerabilities
npm audit --omit=dev  → found 0 vulnerabilities
```

| package | severity | path | fix |
|---|---|---|---|
| `postcss <=8.5.17` | high — path traversal via `sourceMappingURL` ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)) | vitest › @vitest/mocker › vite › postcss | `npm audit fix` |
| `vite 8.0.0–8.0.15` | high — `server.fs.deny` bypass ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)) + moderate NTLMv2 disclosure | vitest › @vitest/mocker › vite | `npm audit fix` |
| `undici 7.0.0–7.27.2` | high — 7 advisories (TLS bypass via SOCKS5, header injection, WS DoS, …) | jsdom › undici | `npm audit fix` |

**Every root finding is dev-only** (vitest, jsdom). None reaches the VSIX. All three offer a plain
`npm audit fix` inside the declared ranges — no `--force`.

### media-src

```
npm audit             → 2 vulnerabilities (1 high, 1 low)
npm audit --omit=dev  → 1 low severity vulnerability
```

| package | severity | path | note |
|---|---|---|---|
| `linkify-it <=5.0.1` | high — quadratic-complexity DoS in the `mailto:` validator ([GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm)) | `markmap-lib` › markdown-it › linkify-it | `markmap-lib` is a **devDependency** → drops out under `--omit=dev` |
| `esbuild 0.27.3–0.28.0` | low — dev-server arbitrary file read, Windows only ([GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr)) | direct | survives `--omit=dev` because `esbuild` sits in `dependencies` |

### test/vscode-e2e

```
npm audit → 2 high severity vulnerabilities
```

`playwright <1.55.1` + `@playwright/test` — browsers downloaded without SSL certificate
verification ([GHSA-7mvr-c777-76hp](https://github.com/advisories/GHSA-7mvr-c777-76hp)).
`npm audit fix --force` would install `@playwright/test@1.62.1`.

## The finding neither audit can see

`npm audit --omit=dev` in `media-src` says `linkify-it` does not affect production. **That is
misleading.** The copy of `linkify-it` that actually reaches users is compiled into
`media/vditor/dist/js/markmap/markmap.min.js`, which [`build.mjs:43`](../build.mjs#L43) copies
from `media-src/node_modules/vditor/dist` — the `vditor` package's own prebuilt dist, and `vditor`
**is** a production dependency. `media/vditor/dist/` is gitignored and regenerated per build, so
it is real shipped output, not a stale checked-in artifact.

Both `npm audit` and `bun audit` read *dependency-tree edges*. Minified third-party code vendored
inside a package's own `dist/` has no edge to read, so this copy is invisible to both tools.
Confirmed by grep: `linkify` matches in that file and in no other shipped `media/**/*.js`.

So "0 vulnerabilities in the production tree" is true **about the npm tree** and is not the same
claim as "no vulnerable code ships in the VSIX". That distinction is the point of this task.

Worst realistic case: a hostile `.md` containing a ```markmap block whose text drives the
quadratic `mailto:` scan, hanging the webview. The user must open the file. No RCE, no data
exfiltration. Severity as *we* experience it: low.

## Scope

- [ ] **1. root — apply the fix.** `npm audit fix` (never `--force`). If it wants to leave the
      declared ranges, stop and report instead of forcing. Then prove nothing broke: `npm test`,
      `npm run typecheck`, `npm run lint:ci`. vitest and vite both move, so the unit suite is the
      risk surface. Record before/after audit output.
- [ ] **2. media-src — kill `linkify-it` at the root rather than bumping it.** `markmap-lib` and
      `markmap-view` are declared devDependencies and appear to be **dead**. Measured with a net
      deliberately wider than the `from '…'`-only regex that misled task 460 — all quote styles,
      plus bare side-effect and dynamic forms — across `media-src/src`, **`media-src/e2e`**
      (the most likely home for a dev-only consumer, and the directory the first pass missed),
      `media-src/*.mjs`, `build.mjs`, `scripts`, `test`:

      ```bash
      grep -rnE "(from|import|require\()\s*\(?['\"]markmap-(lib|view)" \
        media-src/src media-src/e2e media-src/*.mjs build.mjs scripts test | grep -v node_modules
      # → no matches
      ```

      A plain textual search for `markmap-lib|markmap-view` over the same paths returns **4 hits,
      all of them comments** (`markmap-fit.ts`, `diagram-zoom-keys-gated.ts`,
      `esbuild-shared.mjs`, `custom-diagrams-pin.test.ts`). Before removing, re-run the widened
      grep (the tree may have moved) and cross-check with `npm run knip`; also read
      `media-src/build.mjs` / `esbuild-shared.mjs` for a bundling path that would consume them
      without a source-level import. If genuinely dead, remove both — the `linkify-it` advisory
      goes with them. If something needs them, say so and leave them.

      Note the shape of the answer either way: `custom-diagrams-pin.test.ts:86` observes that the
      shipped bundle "carries inert CDN strings from markmap-view's autoloader", which is
      consistent with markmap arriving via `vditor`'s prebuilt dist (item 5) rather than via
      these npm deps.
- [ ] **3. media-src — `esbuild` is miscategorised.** It is the bundler; it has no business in
      `dependencies`, and it is the *only* reason `npm audit --omit=dev` is non-clean there. Move
      it to `devDependencies` and confirm `node build.mjs` still runs from the repo root.
- [ ] **4. test/vscode-e2e — leave it, and write the reasoning down here.** `@playwright/test` is
      pinned to exactly `1.52.0` for compatibility with `vscode-test-playwright@0.0.1-beta2`; the
      forced fix installs 1.62.1 and breaks the suite. The advisory affects only browser
      *downloading*, over a connection we control, in a dev-only workspace whose
      `package.json` description already states it is isolated so its dev-only advisories never
      reach the shipped extension's audit gate. Accepted risk — record it so the next audit does
      not re-litigate it.
- [ ] **5. The vendored `linkify-it` — investigate and document.** Determine the bundled
      markdown-it/linkify-it version inside `media/vditor/dist/js/markmap/markmap.min.js` if it is
      determinable at all. Check whether a newer `vditor` release ships a patched markmap bundle;
      if one does, that is the fix, and it needs the normal render-regression pass because
      upgrading `vditor` moves the whole editor. If none does, record it as a known accepted
      exposure with the severity reasoning above — **do not inflate it**.

## Out of scope — deliberate, not forgotten

- **Do not wire `npm audit` into `scripts/quality.mjs` or CI.** Per AGENTS.md and ADR-0005's
  philosophy, a tool joins the gate only once it runs clean; `quality` already carries
  un-actioned knip/jscpd/coverage-ratchet findings and is itself not in CI yet (task 469 item 6).
  Adding a seventh, immediately-red stage teaches people to ignore the summary.
- **Do not run `npm audit fix --force` anywhere.**
- **Do not adopt Bun.** It was used once as a cross-check. It reads `package-lock.json` and needs
  no migration, but it has **no `--omit=dev` equivalent** (flags are `--json`, `--audit-level`,
  `--ignore`) — which matters here, since dev-vs-prod is the distinction that makes the root
  findings ignorable. `npm audit --omit=dev` is the sharper signal for this repo.
- Auditing the other vendored prebuilt bundles under `media/vditor/dist/` for the same class of
  blind spot. Item 5 establishes that the blind spot exists; a systematic sweep is its own task
  if the answer to item 5 turns out badly.

## Definition of done

- Items 1–3 applied and verified with the commands named in each, or explicitly declined here with
  reasoning.
- Items 4–5 answered in writing in this file — a recorded decision counts as done; an unanswered
  question does not.
- Before/after `npm audit` output captured in this file for all three workspaces. The numbers are
  the evidence.
- Nothing committed or pushed; the working tree is left for the user to review.
