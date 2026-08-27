# Task 512 E2E Readiness Observability Design

## Status and decision

Approved direction: replace repeated file-by-file guessing with a test-only readiness ledger plus a
static wait inventory. The first implementation is a 90-minute vertical-slice checkpoint. Continue
with bulk migration only if the slice can cover at least 70% of the remaining eligible long waits.

“Eligible” means an unconditional wait longer than one second that proves positive completion.
Negative observation windows, multi-engine geometry quiescence, input sequencing, skipped tests,
conditional timeout guards, and already-documented retained waits are excluded from the denominator.

## Goals

- Make recurring editor, command-router, mode, render, theme, and cache boundaries observable.
- Preserve test semantics: no first-true shortcut may weaken negative or quiescence coverage.
- Produce a complete, reproducible inventory of remaining waits and their dispositions.
- Reduce repeated FAST runs: verify each readiness primitive once, representative consumers next,
  then run FAST and full only at integration checkpoints.
- Keep all instrumentation absent from ordinary product sessions.

## Non-goals

- Removing every timer. Negative windows and input sequencing remain timers by design.
- Adding user-facing settings or diagnostics.
- Refactoring renderer architecture solely for tests.
- Changing retry counts, timeouts, test tiers, or assertions to hide failures.

## Approaches considered

### 1. Full renderer event bus

Wrap every renderer and theme/cache path in a shared asynchronous event system. This offers the most
precise state but touches too many production paths and risks changing scheduling. Rejected for the
checkpoint.

### 2. Static codemod only

Generate an AST inventory and mechanically replace common sleeps with existing DOM polls. This is
fast but cannot resolve the command-router, undo-snapshot, cache-PUT, and lost-mode-click races already
measured during task 512. Rejected as insufficient alone.

### 3. Gated minimal ledger plus static inventory

Recommended. Add precise signals only at existing lifecycle boundaries, keep renderer-specific DOM
conditions where they are already authoritative, and use a static inventory to classify everything
else. This minimizes production touch while addressing the recurring unobservable races.

## Architecture

### Host-to-webview enablement

Add optional `e2e?: boolean` to the host `update` payload. `EditorSession` sets it from
`process.env.VMARKD_E2E` in both inline and ready-roundtrip init payloads. The field is absent or false
in ordinary sessions.

### Webview readiness ledger

Create `media-src/src/testing/e2e-readiness.ts`. When disabled, every exported operation is a no-op
and no global is installed. When enabled, expose `window.__vmarkdE2EReadiness` with plain serializable
state:

```ts
interface E2EReadinessSnapshot {
  routerReady: boolean
  editorEpoch: number
  modeEpoch: number
  mode: 'ir' | 'wysiwyg' | 'sv' | null
  pending: Record<string, number>
  completed: Record<string, number>
}
```

The module exports:

- `configureE2EReadiness(enabled)` — creates or removes the ledger;
- `markRouterReady()` — called after the message listener is installed;
- `markEditorReady(mode)` — called at the end of `runFinishInit`;
- `markModeReady(mode)` — called from the existing post-mode persistence/report boundary;
- `beginE2EActivity(kind)` — increments `pending[kind]` and returns an idempotent completion closure;
- `snapshotE2EReadiness()` — pure copy for unit tests and consumers.

Activity tokens must be completed in `finally` blocks. Pending counts may never become negative.
The vertical slice initially instruments router/editor/mode. Cache PUT acknowledgement and broad
render/theme activity are added only if the checkpoint mapping proves they are necessary to reach the
70% threshold.

### Cache acknowledgement, if required

The current render-cache PUT is fire-and-forget. If eligible wait coverage requires it, extend the
protocol with a request identifier and `diagram-cache-put-ack`. The webview begins `cache-put` before
posting and completes it only when the host acknowledgement returns. This is preferable to exposing
“posted” state because task 512 waits specifically protect close-before-host-receipt races.

### Render and theme activity, if required

Do not infer global render idleness from DOM silence. A quiet MutationObserver can stop on a transient
plateau before a delayed engine starts. Instrument only existing authoritative async boundaries:

- PlantUML’s serialized promise queue;
- D2/custom renderer promises;
- foreground/theme polling completion;
- cache-first hit/miss resolution.

Renderer-specific DOM markers remain the preferred signal when they already express final state.

### Test helper

Add a helper in `test/vscode-e2e/webview-helpers.ts`:

```ts
waitForE2EReadiness(frame, predicate, options?)
```

It polls a snapshot, includes the last snapshot in timeout diagnostics, and fails loudly if the ledger
is unavailable in an E2E run. Consumer specs wait for exact epochs/pending counts rather than sleeping.

### Static inventory

Add `scripts/audit-vscode-e2e-waits.mjs`, backed by parser tests. It must:

- derive the default discovered spec set from the real Playwright configuration;
- find imported `settle`, direct `setTimeout`, `waitForTimeout`, and local wrapper call sites;
- distinguish unconditional sleeps from conditional timeout guards and polling intervals;
- exclude `test.skip`, `@probe`, `@visual`, and spike-only tests from executable cost;
- report file, line, delay, shape, and nearby `task 512` disposition;
- fail a verification mode when an in-scope wait lacks a disposition.

The task record consumes the generated summary, but generated output is not committed.

## Data flow

1. The extension host detects `VMARKD_E2E` and includes `e2e: true` in init.
2. Webview boot configures the readiness ledger before installing runtime subsystems.
3. Existing lifecycle boundaries advance epochs or activity counters.
4. Real-VS-Code tests snapshot the ledger through the nested iframe and poll exact conditions.
5. The AST inventory measures which remaining positive waits map to available signals.
6. If mapped eligible seconds are at least 70%, bulk migration continues. Otherwise the ledger slice
   remains only if it independently fixes recurring readiness races; all other waits are classified
   and retained without expanding instrumentation.

## Safety and product impact

- Ordinary sessions receive no global and execute only constant-time disabled no-ops.
- No source text, paths, user data, or secrets enter the ledger.
- Epochs are monotonic; tokens are idempotent; re-init advances `editorEpoch` rather than resetting
  history in a way that could satisfy stale waits.
- The ledger observes scheduling; it does not schedule product work.

## Testing

### Unit RED/GREEN

- disabled mode creates no global and operations are no-ops;
- router/editor/mode signals are monotonic and snapshots are copies;
- activity tokens increment once, complete once, and never underflow;
- reconfiguration removes stale state;
- AST inventory recognizes every supported wait shape and excludes skipped/conditional shapes.

### Focused real-VS-Code

Add one readiness spec proving:

- ledger exists under `VMARKD_E2E`;
- router and editor readiness are visible on initial open;
- one mode switch advances `modeEpoch` and reports the target mode;
- re-init advances `editorEpoch` without satisfying a stale epoch comparison.

Migrate representative consumers that previously required boot/mode waits, including one command
router case and one repeated reopen case. Run without retries and repeated under load.

### Checkpoint measurement

Run the inventory before and after the vertical slice. Publish:

- eligible long-wait call count and seconds;
- mapped count and seconds per readiness signal;
- mapped percentage;
- retained categories and seconds;
- instrumentation files touched and focused test results.

Continue bulk migration only at 70% or greater mapped eligible seconds.

## Verification cadence

- Unit and focused real-VS-Code tests while building each primitive.
- One representative repeated no-retry batch after the vertical slice.
- One FAST run at the checkpoint, not after each consumer file.
- One full run and `npm run quality` only after the remaining inventory is fully dispositioned.

## Rollback and fallback

If the checkpoint misses 70%, do not keep adding renderer hooks speculatively. Revert unused
instrumentation, keep only primitives proven by real recurring races, generate the complete inventory,
and close the remaining tail through explicit retained classifications and final gates.
