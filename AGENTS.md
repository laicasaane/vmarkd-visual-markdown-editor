**Read [`DEVELOPMENT.md`](DEVELOPMENT.md) first** — it documents the build layout, test layers, harnesses, coverage, and how to run everything. All build/test/lint commands live there.

## Task tracking

When finishing implementation, always update task status inside the relevant `tasks/` file: tick checklist items that were implemented and flag what isn't ready yet. The task file is the single source of truth for status.

`tasks/README.md` is an informative index, not a status tracker — do not record partial or in-progress status there. Only update `tasks/README.md` when a task is fully complete, to mark it done.

## Testing

Every new piece of functionality must ship with **unit tests and e2e tests**, and you must **verify the coverage** for it (run the coverage report and confirm the new code is exercised). A task is not done until its tests pass and cover the new behaviour.

**Any webview / renderer feature (anything that renders or behaves in the editor surface — diagrams, themes, caret, links, etc.) MUST ship a real-VS-Code e2e in `test/vscode-e2e/`, and you MUST WRITE IT AND RUN IT yourself before calling the work done — do not defer real-webview verification to the user.** `xvfb` IS installed here, so the real-VS-Code suite runs headless — there is no "it can't run headless / no display" excuse. If you ever doubt it, run `which xvfb-run` (don't assume from memory; memories about the environment go stale). Run a single spec with:

```bash
node build.mjs   # FIRST — the suite loads out/ + media/ via extensionDevelopmentPath, not the installed .vsix
xvfb-run -a npm --prefix test/vscode-e2e test -- <spec>.spec.ts   # one real-VS-Code spec (downloads VS Code once, then cached)
```

The Playwright/chromium harness (`media-src/e2e`) is a faster first net but CANNOT reproduce real-webview-only behaviour (VS Code's injected CSS, the custom-editor resource/CSP pipeline, SVG-anchor link routing, etc.) — it does not replace the real-VS-Code e2e for those.

**Do NOT run the whole real-VS-Code suite routinely — it is on the order of an hour to two, not ~40 minutes.** The boot is per `test()`, not per spec file (task 448 — `vscode-test-playwright`'s `electronApp` fixture has no `scope: 'worker'`), so a spec with N tests pays N boots; splitting/merging tests moves the wall clock directly. While working, run **your own spec(s)** plus the **fast tier**; keep the full suite for handing work over. The tier lists live in `test/vscode-e2e/playwright.config.ts`. Cheapest possible real-VS-Code test measured at ~5 s (boot + open + one assert); the chromium harness (`media-src/e2e`) runs comparable tests at ~1 s each — call the layer ratio an order of magnitude, more for heavier assertions.

**Always run tests headless with `xvfb-run -a`** — no GUI windows. Quick reference:

```bash
npm test                                        # unit tests (vitest)
node build.mjs                                  # build (run from project root!)
xvfb-run -a npm --prefix media-src run test:e2e # Playwright e2e (harness)
xvfb-run -a npm --prefix test/vscode-e2e test -- foo.spec.ts  # ONE real-VS-Code spec (~15-60 s)
xvfb-run -a npm run test:vscode:fast            # real VS Code, routine tier (~39 tests, 8.5-16 min depending on load — grew since it was ~20)
xvfb-run -a npm run test:vscode:smoke           # real VS Code, PR gate (10 tests, ~2 min)
xvfb-run -a npm run test:vscode                 # real VS Code, EVERYTHING except @probe (count moves with every merge/new spec — run `npx playwright test --list` in test/vscode-e2e for today's exact count; ~1-2 h)
npm run lint:ci                                 # Biome lint gate (whole tree)
```

See [`DEVELOPMENT.md` → Running tests headless](DEVELOPMENT.md#running-tests-headless-xvfb) for details, troubleshooting, and coverage commands. For the full testing playbook — which layer to use, real-VS-Code spec patterns, booting the WASM in a vitest vm-context, coverage, and the gotchas — use the **`vmarkd-testing`** skill.

## Quality-metrics toolchain

Run `npm run quality` **at the end of a task's implementation** — alongside the existing "run a
simplify pass at the end of every task" convention, not once per batch and not only in CI (task
469). It runs `scripts/quality.mjs`, which executes, in order: Biome lint (`lint:ci`, incl.
cognitive complexity — `complexity/noExcessiveCognitiveComplexity`, gated at `error`/max 15) →
`knip` (cross-file unused exports/files/dependencies) → `jscpd` (duplication) →
`dependency-cruiser` (circular/unresolvable imports) → `test:coverage` (unit coverage) →
`check:coverage-modules` (the 0%-module ratchet, `scripts/check-coverage-modules.mjs` — a
*separate* stage from `test:coverage`, reading the coverage summary it just wrote). **It is NOT a
`&&` chain** — every stage runs regardless of earlier failures, then it prints a PASS/FAIL summary
and exits non-zero iff any stage failed. A `&&` chain was tried first and rejected: with `lint:ci`
red for reasons unrelated to a given task (deferred complexity sites, see task 469 5a), it would
report nothing past the first red stage — exactly the blind spot this command exists to avoid.
Type-strictness (`type-coverage`, task 469 item 5e) is not wired in yet — `media-src/tsconfig.json`
has `strict: false` and flipping it needs its own plan, see the task file.

Each step can also be run individually: `npm run knip`, `npm run jscpd`, `npm run depcruise`. See
`knip.jsonc` / `.jscpd.json` / `.dependency-cruiser.cjs` for what's excluded and why (mostly:
vendored code, the two esbuild-entry-point classes, and cross-tree test file reads that aren't
real imports). None of these three tools are wired into CI yet — see ADR-0005's "Philosophy" for
why they're an accepted exception to "keep the toolchain plain", and task 469 for the current
baselines and the plan to wire them in once each is clean.

## Visual / layout bugs

For **layout / CSS / caret** bugs — the perceptual "a few px / jumps / squished / repro only in the real editor" class — use the **`vmarkd-visual-debugging`** skill: `playwright-cli` for an interactive measure-and-screenshot loop on the harnesses (`npm run harness:serve` + `npm run pw:cli`), `@visual` golden screenshots (`npm run test:visual`, a local-only net excluded from CI), and the real-VS-Code webview suite (`npm run test:vscode`) for bugs that only reproduce with VS Code's injected CSS / the custom-editor pipeline.
