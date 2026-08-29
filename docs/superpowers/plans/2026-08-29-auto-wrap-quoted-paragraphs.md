# Auto-wrap Quoted Paragraph Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep marker-only blockquote lines as paragraph boundaries so auto-wrap changes only the quoted paragraph containing the caret.

**Architecture:** Retain `rewrapMarkdownRange` as the single formatting engine. Add one source-line predicate that recognizes logical blankness after stripping Markdown quote prefixes, and use it only where paragraph/unit boundaries are discovered; formatting and byte splicing remain unchanged.

**Tech Stack:** TypeScript, Vitest, Playwright Chromium harness, vscode-test-playwright

**Spec:** `tasks/523-auto-wrap-quoted-paragraph-boundaries.md`

## Global Constraints

- Preserve quote separator bytes and every unrelated quote paragraph.
- Do not change wrap settings, debounce behavior, Lute patches, or transaction semantics.
- Build before the real-VS-Code test and keep `LOCAL_AGENT_TASK.md` untracked and uncommitted.

---

### Task 1: Protect quoted paragraph boundaries

**Files:**
- Modify: `media-src/src/editing/rewrap-markdown.test.ts`
- Modify: `media-src/src/editing/rewrap-markdown.ts`

**Interfaces:**
- Consumes: `rewrapMarkdownRange(markdown, startOffset, endOffset, caretOffset, column)`
- Produces: unchanged `RewrapResult`; marker-only quote lines delimit collapsed-caret logical units

- [x] **Step 1: Write the failing test**

Add a literal fixture with four quoted paragraphs separated by `>` lines, put the collapsed caret at
the end of the reported final line, use column 60, and assert that only that line becomes:

```markdown
> **Lifecycle constraints:** **Notes:** Add to plan file
> instead of proposal
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config test/vitest.config.ts media-src/src/editing/rewrap-markdown.test.ts`

Expected: FAIL because the actual Markdown merges preceding quoted paragraphs into the formatted
unit.

- [x] **Step 3: Write minimal implementation**

Add a quote-marker-only predicate alongside raw blank detection, then use it in collapsed-unit
expansion, logical-unit skipping, and continuation compatibility. Keep it narrower than generic
prefix-stripped blankness so callout markers and empty list items retain their behavior.

- [x] **Step 4: Run test to verify it passes**

Run the same focused Vitest command. Expected: PASS with existing formatter cases still green.

### Task 2: Prove the live auto-wrap path

**Files:**
- Modify: `media-src/e2e/auto-wrap.spec.ts`
- Modify: `test/vscode-e2e/auto-wrap.spec.ts`

**Interfaces:**
- Consumes: existing auto-wrap input/debounce and real editor helpers
- Produces: regression coverage in the browser harness and actual VS Code webview

- [x] **Step 1: Add the reported quote fixture to the focused Chromium spec**

Set the editor value to the literal quote block, place the caret at the end of `proposal`, type one
character, and assert the earlier quote paragraphs and marker-only separators remain byte-identical
while the active line wraps.

- [x] **Step 2: Add the same user path to the focused real-VS-Code spec**

Drive a real fixture through VS Code, type at the final quoted paragraph in at least one rendered
mode, wait for host document sync, and assert the exact expected Markdown.

- [x] **Step 3: Run focused browser and real-VS-Code checks**

Run Chromium under `xvfb-run -a`; run `node build.mjs` before the focused real-VS-Code spec and use
`env -u ELECTRON_RUN_AS_NODE xvfb-run -a`.

### Task 3: Verify and hand off

**Files:**
- Modify: `tasks/523-auto-wrap-quoted-paragraph-boundaries.md`
- Modify: `tasks/README.md`

**Interfaces:**
- Consumes: focused test and gate output
- Produces: honest closed task record and one focused local commit

- [x] **Step 1: Run focused coverage and applicable static gates**

Confirm the changed formatter lines are covered, then run typecheck, lint, diff checks, and one
aggregate quality gate.

- [x] **Step 2: Close the tracker**

Record exact commands/outcomes, move task 523 under `tasks/done/`, and add its completed index entry.

- [x] **Step 3: Review and commit**

Inspect the complete diff and staged manifest, confirm `LOCAL_AGENT_TASK.md` is absent, and create one
local commit without pushing.
