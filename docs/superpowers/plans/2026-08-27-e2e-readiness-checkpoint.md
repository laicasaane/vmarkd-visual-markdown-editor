# E2E Readiness Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove whether a gated readiness ledger plus AST inventory can safely cover at least 70% of task 512's remaining eligible long waits.

**Architecture:** The extension host enables a small webview readiness ledger only under `VMARKD_E2E`. Existing router, finish-init, and mode-report boundaries advance monotonic state; real-VS-Code tests consume snapshots through one helper. A parser-backed inventory supplies the eligible-wait denominator and verifies that every retained wait has a disposition.

**Tech Stack:** TypeScript, Vitest/jsdom, Playwright with `vscode-test-playwright`, Node ESM, `oxc-parser` 0.140.0, Biome.

**Spec:** `docs/superpowers/specs/2026-08-27-e2e-readiness-observability-design.md`

## Global Constraints

- Instrumentation is absent outside `VMARKD_E2E` and may not schedule product work.
- No retry, timeout, tier, or assertion weakening is allowed.
- Negative, geometry-quiescence, input-sequencing, skipped, conditional, and <=1s waits are not eligible conversions.
- `LOCAL_AGENT_TASK.md` stays untracked and unstaged.
- Create commits only; do not push.
- Continue bulk migration only when mapped eligible seconds are at least 70%.

---

### Task 1: Readiness ledger core

**Files:**
- Create: `media-src/src/testing/e2e-readiness.ts`
- Create: `media-src/src/testing/e2e-readiness.test.ts`

**Interfaces:**
- Produces: `configureE2EReadiness`, `markRouterReady`, `markEditorReady`, `markModeReady`, `beginE2EActivity`, `snapshotE2EReadiness`.
- Produces global: `window.__vmarkdE2EReadiness` only while enabled.

- [ ] **Step 1: Write failing unit tests for disabled, epoch, token, and reconfigure behavior**

```ts
it('does not expose a ledger while disabled', () => {
  configureE2EReadiness(false)
  markRouterReady()
  expect(window.__vmarkdE2EReadiness).toBeUndefined()
})

it('latches router installation that happens before E2E init enablement', () => {
  configureE2EReadiness(false)
  markRouterReady()
  configureE2EReadiness(true)
  expect(snapshotE2EReadiness()?.routerReady).toBe(true)
})

it('advances lifecycle epochs and completes an activity token once', () => {
  configureE2EReadiness(true)
  markRouterReady()
  markEditorReady('ir')
  markModeReady('wysiwyg')
  const done = beginE2EActivity('cache-put')
  done()
  done()
  expect(snapshotE2EReadiness()).toMatchObject({
    routerReady: true,
    editorEpoch: 1,
    modeEpoch: 1,
    mode: 'wysiwyg',
    pending: { 'cache-put': 0 },
    completed: { 'cache-put': 1 },
  })
})
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx vitest run --config test/vitest.config.ts media-src/src/testing/e2e-readiness.test.ts`

Expected: FAIL because `e2e-readiness.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal ledger**

```ts
export type E2EMode = 'ir' | 'wysiwyg' | 'sv'
export interface E2EReadinessSnapshot {
  routerReady: boolean
  editorEpoch: number
  modeEpoch: number
  mode: E2EMode | null
  pending: Record<string, number>
  completed: Record<string, number>
}

export function beginE2EActivity(kind: string): () => void {
  if (!ledger) return () => {}
  ledger.pending[kind] = (ledger.pending[kind] ?? 0) + 1
  let completed = false
  return () => {
    if (completed || !ledger) return
    completed = true
    ledger.pending[kind] = Math.max(0, (ledger.pending[kind] ?? 1) - 1)
    ledger.completed[kind] = (ledger.completed[kind] ?? 0) + 1
  }
}
```

Implement configuration, marks, defensive copies, and global cleanup around this state.

- [ ] **Step 4: Run unit tests and focused coverage GREEN**

Run:

```bash
npx vitest run --config test/vitest.config.ts media-src/src/testing/e2e-readiness.test.ts
COLUMNS=2000 npx vitest run --config test/vitest.config.ts --coverage --coverage.include='media-src/src/testing/e2e-readiness.ts' --coverage.reporter=text media-src/src/testing/e2e-readiness.test.ts
```

Expected: PASS; no new readiness lines appear in uncovered-line output.

- [ ] **Step 5: Commit**

```bash
git add media-src/src/testing/e2e-readiness.ts media-src/src/testing/e2e-readiness.test.ts
git commit -m "test(512): add gated E2E readiness ledger"
```

### Task 2: Host enablement and lifecycle wiring

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/session/editor-session.ts`
- Modify: `test/backend/extension.test.ts`
- Modify: `media-src/src/boot/main.ts`
- Modify: `media-src/src/bridge/message-router.ts`
- Modify: `media-src/src/boot/finish-init.ts`
- Modify: `media-src/src/chrome/toolbar-actions.ts`
- Modify: `media-src/src/boot/finish-init.test.ts`
- Modify: `media-src/src/bridge/message-router.test.ts`

**Interfaces:**
- Consumes ledger functions from Task 1.
- Produces optional `HostMessage.update.e2e` and lifecycle readiness marks.

- [ ] **Step 1: Add failing host tests for the E2E init flag**

Extend the provider ready-handshake test to set `process.env.VMARKD_E2E='1'`, receive `{command:'ready'}`, and assert the posted init update contains `e2e: true`; restore the environment in `finally`.

- [ ] **Step 2: Add failing webview wiring tests**

Mock `markRouterReady`, `markEditorReady`, and `markModeReady`; assert:

```ts
expect(markRouterReady).toHaveBeenCalledTimes(1)
expect(markEditorReady).toHaveBeenCalledWith('ir')
expect(markModeReady).toHaveBeenCalledWith('wysiwyg')
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
npx vitest run --config test/vitest.config.ts test/backend/extension.test.ts media-src/src/boot/finish-init.test.ts media-src/src/bridge/message-router.test.ts
```

Expected: FAIL because the protocol field and lifecycle marks are absent.

- [ ] **Step 4: Implement minimal enablement and marks**

Add `e2e?: boolean` beside the init payload's other optional fields. Include
`e2e: !!process.env.VMARKD_E2E` in both `onReady` and `inlineInitPayload`. In webview boot call
`configureE2EReadiness(msg.e2e === true)` before init wiring, mark router installation after
`installMessageRouter`, mark editor readiness at the end of `runFinishInit`, and mark mode readiness
from the existing delayed `reportEditorMode` boundary.

- [ ] **Step 5: Run focused tests and type checks GREEN**

Run:

```bash
npx vitest run --config test/vitest.config.ts test/backend/extension.test.ts media-src/src/boot/finish-init.test.ts media-src/src/bridge/message-router.test.ts media-src/src/testing/e2e-readiness.test.ts
npm run typecheck
npm run typecheck:vscode-e2e
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/protocol.ts src/session/editor-session.ts test/backend/extension.test.ts media-src/src/boot/main.ts media-src/src/bridge/message-router.ts media-src/src/boot/finish-init.ts media-src/src/chrome/toolbar-actions.ts media-src/src/boot/finish-init.test.ts media-src/src/bridge/message-router.test.ts
git commit -m "test(512): expose E2E lifecycle readiness"
```

### Task 3: Real-VS-Code readiness helper and vertical slice

**Files:**
- Modify: `test/vscode-e2e/webview-helpers.ts`
- Create: `test/vscode-e2e/e2e-readiness.spec.ts`
- Modify: `test/vscode-e2e/list-normalize.spec.ts`
- Modify: `test/vscode-e2e/link-button-url.spec.ts`

**Interfaces:**
- Consumes `window.__vmarkdE2EReadiness` from Tasks 1–2.
- Produces `waitForE2EReadiness(frame, predicate, options?)`.

- [ ] **Step 1: Write the failing real-VS-Code readiness spec**

Assert initial router/editor readiness, capture epochs, dispatch a WYSIWYG mode click, and require
`modeEpoch` to increase with `mode === 'wysiwyg'`. Trigger one config re-init and require
`editorEpoch` to exceed the captured value.

- [ ] **Step 2: Add the helper implementation**

```ts
export async function waitForE2EReadiness(
  frame: ReturnType<typeof wf>,
  ready: (snapshot: E2EReadinessSnapshot) => boolean,
  options: { timeout?: number; message?: string } = {},
) {
  let last: E2EReadinessSnapshot | null = null
  await expect.poll(async () => {
    last = await frame.locator('body').evaluate(() =>
      structuredClone(window.__vmarkdE2EReadiness ?? null),
    )
    return !!last && ready(last)
  }, options).toBe(true)
  return last
}
```

Use a local test-facing snapshot type and include the last snapshot in a caught timeout diagnostic.

- [ ] **Step 3: Build and run the readiness spec RED/GREEN**

Run:

```bash
node build.mjs
env -u ELECTRON_RUN_AS_NODE npm --prefix test/vscode-e2e test -- e2e-readiness.spec.ts --retries=0
```

Expected before Tasks 1–2 are built: RED with no ledger. Expected after wiring: PASS.

- [ ] **Step 4: Migrate two representative consumers**

Replace `list-normalize` boot command-router wait with `routerReady && editorEpoch > 0`. Replace
`link-button-url` boot/mode waits with epoch comparisons. Preserve all hard document assertions.

- [ ] **Step 5: Repeat representative consumers without retries**

Run:

```bash
env -u ELECTRON_RUN_AS_NODE npm --prefix test/vscode-e2e test -- e2e-readiness.spec.ts list-normalize.spec.ts link-button-url.spec.ts --repeat-each=5 --retries=0
```

Expected: all attempts pass; the two original waits are absent.

- [ ] **Step 6: Commit**

```bash
git add test/vscode-e2e/webview-helpers.ts test/vscode-e2e/e2e-readiness.spec.ts test/vscode-e2e/list-normalize.spec.ts test/vscode-e2e/link-button-url.spec.ts
git commit -m "test(512): consume lifecycle readiness signals"
```

### Task 4: Parser-backed wait inventory

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/audit-vscode-e2e-waits.mjs`
- Create: `test/backend/e2e-wait-audit.test.ts`

**Interfaces:**
- Consumes Playwright default discovery and TypeScript spec sources.
- Produces JSON `{summary, rows}` and `--verify-dispositions` exit status.

- [ ] **Step 1: Add `oxc-parser` as a direct development dependency**

Run: `npm install --save-dev oxc-parser@0.140.0`

- [ ] **Step 2: Write failing parser fixtures/tests**

Use temporary source strings covering imported `settle`, direct `setTimeout`, `waitForTimeout`, a
local wrapper with a named constant, `test.skip`, a conditional timeout fallback, and nearby
`task 512: retain — negative` comments. Assert executable calls and milliseconds exactly.

- [ ] **Step 3: Run the audit unit test RED**

Run: `npx vitest run --config test/vitest.config.ts test/backend/e2e-wait-audit.test.ts`

Expected: FAIL because the audit module does not exist.

- [ ] **Step 4: Implement inventory and verification modes**

Use `parseSync(filename, source, {lang:'ts', sourceType:'module'})`, walk call expressions, resolve
local wrapper parameter positions and numeric constants, and associate each wait with its containing
test and nearest task-512 comment. `--verify-dispositions` fails only for default-tier waits that are
neither converted nor classified.

- [ ] **Step 5: Run audit tests and current inventory GREEN**

Run:

```bash
npx vitest run --config test/vitest.config.ts test/backend/e2e-wait-audit.test.ts
node scripts/audit-vscode-e2e-waits.mjs --json
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/audit-vscode-e2e-waits.mjs test/backend/e2e-wait-audit.test.ts
git commit -m "test(512): add authoritative wait inventory"
```

### Task 5: Checkpoint coverage decision

**Files:**
- Modify: `tasks/512-e2e-residual-settle-sleeps.md`

**Interfaces:**
- Consumes readiness consumer mapping and authoritative audit JSON.
- Produces the continue/fallback decision with mapped eligible seconds.

- [ ] **Step 1: Generate the remaining inventory**

Run: `node scripts/audit-vscode-e2e-waits.mjs --json`

- [ ] **Step 2: Map eligible waits to lifecycle signals**

Record a table with `editor`, `router`, `mode`, `cache-put`, `render/theme`, and `renderer-specific DOM`
seconds. Exclude retained categories using the exact denominator rules in the spec.

- [ ] **Step 3: Calculate and record coverage**

Compute `mappedEligibleMs / eligibleMs * 100`. Continue bulk readiness migration only when the result
is at least 70%; otherwise follow the spec's rollback/classification fallback.

- [ ] **Step 4: Run checkpoint verification**

Run:

```bash
npx biome check media-src/src/testing test/vscode-e2e/e2e-readiness.spec.ts test/vscode-e2e/webview-helpers.ts scripts/audit-vscode-e2e-waits.mjs test/backend/e2e-wait-audit.test.ts
npm run typecheck:vscode-e2e
env -u ELECTRON_RUN_AS_NODE npm run test:vscode:fast
```

- [ ] **Step 5: Commit the checkpoint decision**

```bash
git add tasks/512-e2e-residual-settle-sleeps.md
git commit -m "docs(512): record readiness checkpoint decision"
```
