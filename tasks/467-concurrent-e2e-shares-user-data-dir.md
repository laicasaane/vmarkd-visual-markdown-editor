# Task 467 — Concurrent real-VS-Code runs share one `worker-0` user-data dir and corrupt each other's settings

**Status:** 🔵 **OPEN — not started.** Diagnosed 2026-07-30 while several agents ran e2e in
parallel. · **Impact:** 🟠 high for anyone running two suites at once (silently wrong results, not
just slow) · **Origin:** measured during the 110/243/454/456/457 batch.

## Problem

`vscode-test-playwright` launches VS Code with

```
--user-data-dir=${userDataDir ?? path.join(cachePath, 'user-data')}
```

and `test/vscode-e2e/playwright.config.ts` does not set `userDataDir`. Every run therefore uses the
same `test/vscode-e2e/.vscode-test/worker-0/` tree — **one user-data dir, one `settings.json`,
shared by every VS Code instance on the machine.**

Within a single serial run that is harmless. It stops being harmless the moment two runs overlap,
which happens whenever two people (or two agents) run specs at the same time, or a `--workers=2`
run is attempted:

- Any spec that calls `workspace.getConfiguration().update(..., ConfigurationTarget.Global)` writes
  that shared file. A second run reads or clobbers it mid-flight.
- The failure mode is a **confidently wrong result**, not a timeout: a spec can pass or fail because
  of a setting another process wrote a moment earlier. That is worse than a crash, because nobody
  goes back to re-check a green.

Observed alongside it: four `Xvfb` displays and several VS Code instances at load average ~8, with
60s locator timeouts becoming unreliable.

## Related, already fixed (do not re-do)

Two specs set `vmarkd.editor.defaultMode` globally and never reset it, so the value persisted into
every LATER spec of the same run — `.vditor-ir` is hidden in Preview mode, so this poisoned anything
downstream. Both now reset in `afterEach` (`default-open-mode.spec.ts`, `preview-spacing.spec.ts`).
That fix is necessary but NOT sufficient: with a shared user-data dir, the reset itself races.

## Scope

- [ ] Reproduce deliberately: two overlapping runs, one setting a config value, and show the other
      observing it. Measure before changing anything — it is possible Playwright's own worker
      indexing already isolates more than the path above suggests.
- [ ] Give each run its own `userDataDir` (the option exists; it is simply unset). A per-run
      temporary directory, or one keyed on the Playwright worker index, both work — pick whichever
      keeps the VS Code download cache SHARED, since re-downloading VS Code per run would be a
      serious regression in suite cost.
- [ ] Document the isolation in `DEVELOPMENT.md` next to the existing test-tier guidance, so the
      "can I run two suites at once?" question has a written answer.

## Out of scope

- Raising the worker count. Isolation is a prerequisite for that conversation, not the same one.
- The per-`test()` boot cost (task 448/450) — a different axis of the same suite.
