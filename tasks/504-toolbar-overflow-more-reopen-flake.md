# 504 — `toolbar-overflow.spec.ts`: `more` panel fails to reopen on second click (real VS Code)

Status: **TODO — undiagnosed.** Split out of [task 492](done/492-toolbar-layout-usability.md) during
its Phase 4/5 close-out; discovered by the Phase 5 implementer, not caused by either phase.

## The failure

`test/vscode-e2e/toolbar-overflow.spec.ts`'s original (pre-task-492-Phase-4/5) test fails around
line 144: `await expect(morePanel).toBeVisible()` after a **second** click on the `more` trigger
(post-widen-to-1400px) — the panel resolves hidden instead of visible again.

## What's confirmed (from task 492's Phase 4/5 close-out)

- **Reproduces with every Phase 5 file reverted** (`git stash`), so Part A/B (submenu ARIA, upload
  button) did not cause it.
- **Reproduces with the Phase 4 agent's WIP also absent** at one check point, and again later **with
  no concurrent real-VS-Code suite running anywhere on the machine** (load average back to normal) —
  so it is not purely a concurrent-agent-load artifact either, contrary to an earlier hypothesis
  during triage.
- **Not 100%-reproducing across a whole session**: Phase 4's own `xvfb-run -a npm run
  test:vscode:fast` run (which includes this same file) passed clean earlier in the same session —
  so whatever the cause, it is intermittent, not a deterministic every-time break.
- Predates task 492's Phase 4/5 work; likely predates the whole task (Phase 1-3 already shipped this
  spec file's first version — worth checking whether it ever passed reliably post-Phase-1, or has
  always been borderline-flaky and simply hadn't been run enough times to notice).

## Not yet done

- Root cause. Candidates worth checking first: a timing/settle assumption around the second
  open/close cycle (the panel's own transition/animation, a `display` write racing the assertion),
  or a state leak from the FIRST open (e.g. `more`'s `aria-expanded`/MutationObserver state, or the
  overflow module's hysteresis/measurement pass, not resetting cleanly between the two clicks).
- A minimal, isolated repro outside the full spec file (the debug-spec approach used during 492's
  triage worked — write one, don't reuse a deleted one from memory).
- Whether it's specific to the 1400px widen-back step, or reproduces at other widths / without the
  overflow-then-restore cycle at all.

## Where the code lives

Same table as task 492: `media-src/src/chrome/toolbar-overflow.ts` (the `more` trigger + panel,
`updateMoreState`), `media-src/src/editing/escape-toolbar.ts` (roving nav), the spec itself at
`test/vscode-e2e/toolbar-overflow.spec.ts`.

## Tests (per AGENTS.md)

Once root-caused, the fix needs its own regression coverage at whichever layer actually catches it
(the existing real-VS-Code test already catches the symptom — the job is making it reliably GREEN,
not adding a new assertion).
