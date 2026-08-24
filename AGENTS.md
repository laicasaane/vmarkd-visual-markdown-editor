# vMarkd development with Codex

## Start here

Read [DEVELOPMENT.md](DEVELOPMENT.md) before implementing or testing a change. It is the authority for exact build, test, lint, coverage, and troubleshooting commands. This file defines the stable workflow; do not duplicate volatile command details, test counts, or release procedures here.

Read the active task file before changing code. Apply the repository skills that match the work.

## Repository map

The repository has two compilation units:

- `src/` is the VS Code extension host, running in Node/CommonJS.
- `media-src/src/` is the browser-based webview, built as ESM.

Do not edit generated output. `out/`, `media/dist/`, `media/vditor/dist/`, and `media/vmarkd-icons.js` are generated artifacts; change their source or build process instead.

The module map in `scripts/module-manifest.mjs` and the boundary test in `test/backend/module-boundaries.test.ts` enforce the host and webview structure. Preserve those boundaries and update their source of truth only when an approved structural change requires it.

## Repository skills

Use applicable repository-local skills and follow their `SKILL.md` instructions before acting. This section is the catalog location for those skills as they are migrated; keep it as the single concise index rather than copying skill bodies into agent instructions.

## Task lifecycle

Task files under `tasks/` are the status authority. Read the active task, keep its implementation and verification checklists honest, and mark incomplete work or failing gates explicitly. `tasks/README.md` is only an index: update it only when a task is fully complete.

Keep work within the approved task scope. If a needed change is outside that scope, or you discover a separate implementation opportunity, ask for direction before expanding the work.

## Implementation workflow

Inspect the relevant source, tests, configuration, and existing working-tree changes before proposing a structural change. Make the smallest coherent change that satisfies the task and add the test coverage appropriate to the behavior.

Build from the repository root before any real-VS-Code test. Use `xvfb-run` for browser and VS Code test commands as documented in DEVELOPMENT.md. At task completion, run the applicable focused gates, inspect changed-behavior coverage, and run `npm run quality` for implementation work.

## Testing and verification

Choose the test layer for the behavior under change:

- Vitest covers extension-host logic and importable pure webview helpers.
- Chromium e2e in `media-src/e2e` covers webview behavior in a browser with Vditor.
- Real-VS-Code e2e in `test/vscode-e2e` verifies behavior through VS Code's actual webview and custom-editor pipeline.

These layers have distinct responsibilities; a Chromium harness result does not replace real-VS-Code verification for behavior affected by VS Code integration. Every webview or renderer behavior requires a written and run focused real-VS-Code spec in `test/vscode-e2e/`: run `node build.mjs` first, then run that spec under `xvfb-run`.

Run the targeted tests for the changed surface as well as the appropriate routine tier described in DEVELOPMENT.md. The default full real-VS-Code suite excludes `@probe` tests and `*spike*` files. Documentation- and tooling-only changes use proportionate validation: relevant path and link checks, consistency searches, formatting or lint when applicable, and quality checks when required by the task. Do not add artificial runtime tests for prose-only work.

`npm run quality` currently runs lint, knip, jscpd, dependency-cruiser, audit, unit coverage, and the zero-coverage-module ratchet. Consult DEVELOPMENT.md for the exact stages and interpretation of failures.

## Source and change safety

Preserve unrelated user changes and do not overwrite or revert work you did not create. Avoid generated output and keep vendored or upstream material intact unless the task explicitly calls for its update.

Keep credentials, tokens, and other secrets out of tracked files, patches, command output, and reports. Resolve exact targets before destructive operations, and ask before destructive, irreversible, externally visible, or scope-expanding actions.

## Parallel Codex agents

Use parallel Codex agents only for independent work. Give each agent a bounded, non-overlapping scope and avoid concurrent edits to the same files. The primary agent owns integration, conflict resolution, task-tracker updates, and final verification.

## Completion and handoff

Before handing work off, inspect the diff and task tracker, confirm that generated artifacts and unrelated changes are excluded, and record the verification actually run. Report changed files, commands and outcomes, remaining risks, and any incomplete acceptance items. Do not claim a test, fix, or task is complete beyond the available evidence.
