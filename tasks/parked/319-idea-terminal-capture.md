# Task 319 — Terminal capture-to-fence with provenance [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled.

## What it is & the effect

One command/keybinding grabs the LAST command's output from the integrated terminal and
drops it into a fenced block at your caret — auto-stamped with the command, cwd, exit code
and timestamp as fence metadata. Bug reports and runbooks stop being sloppy
select-copy-paste plus hand-typed "this was `npm test` on the 3rd": run the thing, hit one
key in the doc, get a perfectly attributed evidence block.

## Why novel

No markdown editor is co-resident with a terminal. VS Code's shell-integration API
(command text, exit code, output stream per execution) shipped recently and almost nobody
builds on it. **Zero command execution by the extension** — it only records what the user
already ran (clean security posture, unlike 238).

## Feasibility on our assets

Host-only: `onDidStartTerminalShellExecution`/`onDidEndTerminalShellExecution` +
`execution.read()`; insertion via the block↔line map + shipped writeback; the only new
state is a small ring buffer of recent executions. Composes with 242 (ANSI strip) for
clean text.

## Honest value

Honest daily value for bug reports, incident notes, runbook authoring; modest wow. Small
build, sticky habit once bound to a key.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
