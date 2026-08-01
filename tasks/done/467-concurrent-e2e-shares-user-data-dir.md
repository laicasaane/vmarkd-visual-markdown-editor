# Task 467 — ~~Concurrent real-VS-Code runs share one user-data dir~~ — PREMISE REFUTED

**Status:** ❌ **CLOSED, NOT A BUG (2026-07-30).** Filed and refuted the same evening, by me, on a
misreading. Kept rather than deleted because the refutation is the useful part: it names what IS
shared, what ISN'T, and which of the two related fixes still stands.

## What I claimed, and why it was wrong

I read this in `vscode-test-playwright/dist/index.js` and stopped one line too early:

```js
`--user-data-dir=${userDataDir ?? path.join(cachePath, 'user-data')}`
```

`playwright.config.ts` does not set `userDataDir`, so I concluded every run shares one
`settings.json`, and that concurrent runs corrupt each other's configuration mid-flight. The `ps`
output seemed to confirm it: several live VS Code processes all under
`test/vscode-e2e/.vscode-test/worker-0/`.

**Both steps were wrong.** Four lines up:

```js
const cachePath = await _createTempDir();
const installBasePath = path.join(process.cwd(), '.vscode-test', `worker-${workerInfo.parallelIndex}`);
```

`cachePath` is a **fresh temp directory per worker**, so `user-data` and `extensions` are already
isolated. The `.vscode-test/worker-N/` path I saw in `ps` is `installBasePath` — the downloaded VS
Code **binary**, which is exactly the thing that SHOULD be shared and which `downloadAndUnzipVSCode`
caches on purpose. Confirmed by direct observation: there is no `user-data` directory anywhere under
`.vscode-test/` at all.

So: concurrent runs do not corrupt each other's settings, and nothing needs isolating.

## What IS true, and is fixed elsewhere

Within a SINGLE run, one worker means one `cachePath`, hence one `user-data` shared by every
`test()` in that run. A spec calling `workspace.getConfiguration().update(...,
ConfigurationTarget.Global)` and not resetting it therefore leaks into every LATER spec of the same
run — `default-open-mode.spec.ts` and `preview-spacing.spec.ts` both did this with
`vmarkd.editor.defaultMode`, and `preview` hides `.vditor-ir`, which would have broken specs
downstream. Both now reset in `afterEach`. **That fix stands on its own** and is unaffected by this
refutation; only my claim that it also persisted across separate runs was wrong.

## What remains genuinely true about running suites in parallel

Contention, not corruption. Measured with five agents active: load average ~8, four `Xvfb`
displays, several VS Code instances — and 60s locator timeouts becoming unreliable at that load. So
"run real-VS-Code specs one at a time" is still sound advice; it is a **throughput and
timeout-reliability** argument, not a correctness one.

The diagnostic consequence matters more than the advice: contention produces **non-deterministic**
failures. A failure that reproduces deterministically under load is a REAL failure and must not be
written off as environmental.

### Correction 2026-07-31 — the 456 example in this section was wrong

This file originally said task 456's escape-toolbar L3 "failed deterministically". **It does not.**
Measured later the same night: **1 pass / 3 fail** over four identical runs, then **1 pass / 5 fail**
over six — roughly a 1-in-6 coin flip on the same build. So 456 was never the clean deterministic
example this section used it as.

The conclusion it was cited for still holds, and in fact holds *more* strongly: environment was never
a credible explanation for 456, because the failure survived a quiet machine and because the eventual
cause turned out to be in our own code — a `focusout` guard reading `document.activeElement` mid-focus-
transition. But the reasoning has to be stated correctly: *contention* was ruled out by measurement,
not by determinism. See [456](456-a11y-escape-the-editor.md) and the standing rule that came out of
it — for any focus/keyboard assertion in `test/vscode-e2e/`, run `--repeat-each` and report a **pass
rate**, never a verdict from a single run, and capture diagnostics from a FAILING run rather than
only from passing ones.

## Scope

- [x] Reproduce before changing anything — precisely what the original scope demanded ("it is
      possible Playwright's own worker indexing already isolates more than the path above
      suggests"). It does. Reading the four lines above the one I quoted was the whole
      investigation.
- [x] No `userDataDir` change: nothing to isolate.
- [x] ~~Document isolation in `DEVELOPMENT.md`~~ — nothing to document beyond "already isolated";
      folded into this file rather than adding a doc section about a non-problem.
