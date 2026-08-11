# Prerender / Live Style Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the static Markdown prerender match the settled IR/WYSIWYG view for typography, geometry, colours, and backgrounds, while keeping JS-rendered content explicitly outside that guarantee.

**Architecture:** Add a test-only, real-webview capture seam that records a fixed set of rendered Markdown probes both while the host-side overlay is present and after Vditor has mounted. Use the measured deltas to add only static CSS/markup parity rules in the host HTML path; do not run webview decoration or diagram engines in the extension host.

**Tech Stack:** TypeScript, Vditor, Playwright via vscode-test-playwright, Vitest, Biome.

## Global Constraints

- Preserve the instant host-side first paint: no synchronous webview work before the overlay.
- Test in a real VS Code webview after `node build.mjs`.
- Dynamic output (syntax highlighting, diagrams, custom link decoration) is intentionally not a first-paint parity target.
- Keep unrelated uncommitted Mermaid C4 work untouched.

---

### Task 1: Establish a real-webview parity oracle

**Files:**
- Modify: `src/webview-host/html-builder.ts`
- Modify: `media-src/src/chrome/prerender-overlay.ts`
- Create: `test/vscode-e2e/prerender-style-parity.spec.ts`
- Create: `test/vscode-e2e/fixtures/prerender-style-parity.md`

**Interfaces:**
- Consumes: host prerender `#vmarkd-prerender` and live `.vditor-ir/.vditor-wysiwyg` roots.
- Produces: a test-only capture point that can sample both states without changing normal startup.

- [x] **Step 1: Write the failing real-VS-Code test**

  Open the fixture, retain the overlay long enough to sample it, then allow the normal handoff. Compare the `getComputedStyle()` values and bounding rectangles for a heading, paragraph, list, quote, table, and fenced-code container. The assertion must fail against today’s first mismatch and name the differing property.

- [x] **Step 2: Run the focused spec and verify the expected failure**

  Run: `node build.mjs`, then `xvfb-run -a npm --prefix test/vscode-e2e test -- prerender-style-parity.spec.ts`

  Expected: FAIL because at least one static probe differs between the overlay and live view.

- [x] **Step 3: Add the smallest test-only capture seam**

  Gate the seam behind a webview test marker. Normal documents retain the present immediate removal path and do not receive a new user-facing setting.

- [x] **Step 4: Re-run the focused spec**

  Expected: the test reaches both states and reports exact deltas.

  Result: static Markdown probes were byte-for-byte equal at the measured computed-style/geometry level, so no product CSS or markup delta was required.

### Task 2: Apply static parity fixes

**Files:**
- Modify: `src/webview-host/html-builder.ts`
- Modify: `media-src/src/main.css`
- Modify: `test/backend/html-builder.test.ts`
- Modify: `test/vscode-e2e/prerender-style-parity.spec.ts`

**Interfaces:**
- Consumes: measured static deltas from Task 1.
- Produces: equal first-paint and settled style/geometry for the fixture’s static blocks.

- [x] **Step 1: Write a focused failing backend or browser assertion for each host-emitted parity rule**

  Assert the generated overlay has the state needed for the rule, and let the real-webview oracle assert the visible outcome.

- [x] **Step 2: Add the minimal shared static CSS/markup rules**

  No-op on evidence: all measured static rules already match. Dynamic rendering remains explicitly out of scope.

- [x] **Step 3: Run focused backend and real-VS-Code parity tests**

  Expected: PASS with equal computed static style and geometry for all probes.

### Task 3: Verify and document the change

**Files:**
- Modify: `tasks/README.md` only if this becomes a fully tracked completed task; otherwise do not alter task status files.

- [x] **Step 1: Run focused verification**

  Run: relevant `vitest` tests, `npx tsc -p media-src/tsconfig.typecheck.json --noEmit`, `npx biome check` for touched paths, and the real-VS-Code parity spec.

- [x] **Step 2: Run end-of-task verification**

  Run: `npm test`, `npm run quality`, and report any pre-existing/environment-only failures distinctly. Result: 2874/2874 unit tests passed; quality's `npm audit` stage could not resolve `registry.npmjs.org` (EAI_AGAIN), while the local stages continued.

- [x] **Step 3: Commit only the files belonging to this change**

  Use a `fix:` commit and do not include unrelated Mermaid C4 files.
