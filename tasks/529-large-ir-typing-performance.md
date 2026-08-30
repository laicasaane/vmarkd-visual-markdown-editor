# Task 529 — Remove large-document IR typing stalls from Auto Wrap and Unicode input

> **Status:** 📋 planned · **Impact:** 🔴 high for large documents with Auto Wrap enabled; 🟡 for
> non-ASCII prose input · **Origin:** Project Owner report and real-VS-Code profiling, 2026-08-30 ·
> **Regression of:** [Task 516](done/516-auto-wrap-while-typing.md)

**Goal:** Make sustained IR typing in a realistic ~2,000-line mixed Markdown document perform near
the existing Auto-Wrap-off ASCII baseline. Auto Wrap must do no full-document serialization before
its idle delay, and Markdown-inert Unicode input must use the same deferred-spin path already shipped
for ASCII prose and fenced source.

**Architecture:** Keep the shared formatter, transaction, trailing debounce, incremental IR
serializer, and Vditor/Lute structural spin. Replace Auto Wrap's serialized-Markdown target snapshot
with a lightweight editor/input generation, perform source work once after the trailing delay, and
reuse Task 69's exact incremental IR Markdown authority where safe. Extend Task 180's inert-input
classifier from ASCII code units to conservative Unicode code points; structural input continues
through Vditor's real spin.

**Related:** [Task 69](done/69-incremental-ir-serialize.md) owns exact incremental IR serialization;
[Task 175](done/175-spin-skip-codeblock-body-edit.md) and
[Task 180](done/180-defer-prose-spin-typing.md) own the existing deferred-spin mechanisms;
[Task 177](done/177-cap-list-widening-spin.md) is the negative evidence forbidding unsafe list-spin
narrowing; [Task 524](done/524-rewrap-markdown-syntax-boundaries.md) owns the universal formatter and
soft-break presentation contract. Task 530 may consume the snapshot seam introduced here, but Task
529 must remain independently shippable.

## 1. Confirmed reproduction and root cause

### 1.1 Auto Wrap typing regression

A temporary real-VS-Code probe used a generated 2,024-line, >100 KB Markdown document containing
801 prose paragraphs, 48 bullet lists, four tables, four TypeScript fences, and four Mermaid fences.
All Mermaid diagrams had rendered before timing. A 12-character IR prose burst measured:

| configuration | wall time | main-thread blocking | `getValue()` | full IR serialize |
|---|---:|---:|---:|---:|
| Auto Wrap off, warmed | 270 ms | 10.6 ms | 0 | 0 |
| Auto Wrap on, 5000 ms delay | 1152 ms | 834.0 ms | 12 | 12 / 860.6 ms |
| Auto Wrap on + Preview Reflow | 1159 ms | 791.6 ms | 12 | 12 / 840.1 ms |
| Auto Wrap on + legacy `pre-wrap` CSS | 984 ms | 661.1 ms | 12 | 12 / 707.7 ms |

The regression is in `media-src/src/boot/main.ts`:

- `captureAutoWrapTarget()` stores `markdown: outer.getValue()` on every eligible input;
- `isAutoWrapTargetCurrent()` calls `outer.getValue()` again when the timer fires; and
- `createAutoWrapController().schedule()` captures the target before scheduling the delay.

In IR, `getValue()` calls `VditorIRDOM2Md` over the entire editor DOM. The 5000 ms probe prevented
the formatter from firing during the burst, proving that the per-keystroke snapshot alone causes the
typing stall. This behavior entered with Task 516 (`38683dc`).

`editor.autoWrapDelay` controls when the later transaction fires; it does not defer the current
snapshot. At the normal 500 ms delay, one-character idle processing measured 394.7 ms blocking with
four `getValue()` calls and six full serializer calls. A 100 ms delay measured 517.8 ms blocking with
more repeated activity. The task must reduce delayed duplication too, but the release-blocking
contract is zero full-document work during the burst.

`preview.reflowLineBreaks` is not causal: current `effectivePreviewReflow()` depends only on that
Preview setting, and toggling it did not change the 12 full serializations. Task 524's always-on
`white-space: normal` rule is also not the sustained cause: warmed current and legacy whitespace
measured 10.6 ms versus 9.0 ms blocking with Auto Wrap off.

### 1.2 Unicode fast-path gap

A second temporary real-VS-Code probe used the existing 54.6 KB / 403-block large-prose fixture with
Auto Wrap disabled. It inserted one code point at a time into the same IR paragraph:

| input burst | Vditor spins | measured blocking |
|---|---:|---:|
| 12 ASCII letters | 0 | 0 ms |
| 12 Thai characters | 12 | 44.8 ms |
| 10 CJK characters | 10 | 12.6 ms |
| 10 accented Latin characters | 10 | 24.6 ms |
| 6 emoji | 6 | 18.2 ms |

`shouldSkipProseSpin()` currently accepts only `data.length === 1` plus `[A-Za-z]`; its mid-token
space/digit check also recognizes only `[A-Za-z0-9]`. `shouldSkipFenceSpin()` uses the same UTF-16
code-unit length test. CJK, Thai, composed accented characters, and surrogate-pair emoji are
Markdown-inert but pay the real block spin and synchronous layout on every input.

The temporary probes and generated fixtures were removed after recording the results.

## 2. Product and performance contract

- With Auto Wrap enabled, each eligible input may reset a timer and update O(1) state only. It must
  not call `getValue()`, `VditorIRDOM2Md`, the shared formatter, or any full-document walker.
- The configured trailing delay remains 100–5000 ms, default 500 ms. Every eligible burst produces
  at most one delayed Auto Wrap attempt; changing delay/column/enabled state cancels pending work.
- A delayed attempt applies only to the editor, mode, input generation, connected selection, and
  caret position that remain current. Mode switches, external updates, undo/redo, navigation,
  pointer moves, configuration changes, reinitialization, and composition transitions invalidate
  stale work without serializing Markdown.
- IR delayed work uses the exact current Markdown. Prefer Task 69's incremental cache for large IR
  documents; fall back to the authoritative existing serializer when the cache is unavailable,
  invalid, or the mode is not IR. A fallback may be slower after the delay, never incorrect.
- The delayed path must not serialize the full document twice merely to compare identical snapshots.
  A no-op wrap creates no DOM rebuild, host edit, or undo entry. A changed wrap retains the existing
  separate typing/format undo steps.
- Unicode letters and combining marks that are structurally inert in prose use Task 180's deferred
  spin. A conservative single-code-point emoji/symbol set may join only when tests prove it cannot
  complete Markdown syntax.
- Inside a fenced code/diagram body, any single Unicode code point other than the fence delimiter
  follows Task 175's existing opaque-body rule. A real spin still runs once after the quiet period.
- Markdown-active ASCII punctuation, Enter, deletion, paste/drop, selection replacement, history,
  formatting commands, fence backticks, unresolved multi-code-point input, and IME composition stay
  on the current correctness-first path unless independently proven safe.
- Preserve exact Markdown bytes, explicit hard breaks, formatter syntax boundaries, caret/selection,
  focus, scroll, undo/redo, host sync, save/reopen, live configuration, and all three edit modes.
- Add no setting, command, dependency, Lute fork, worker, compatibility path, or source-normalization
  behavior.

## 3. Implementation constraints

Expected implementation surface:

- `media-src/src/editing/auto-wrap.ts` and `.test.ts` — trailing scheduler and stale-generation
  contract;
- `media-src/src/boot/main.ts` — lightweight live target/generation wiring and lifecycle cancellation;
- `media-src/src/bridge/edit-sync.ts` and tests — read-only exact Markdown snapshot seam backed by the
  existing incremental IR cache, with the current serializer fallback;
- `media-src/src/editing/rewrap-command.ts` and tests — consume an already-authoritative snapshot
  without repeating a full equality serialization;
- `media-src/src/editing/spin-skip-fence.ts` and `.test.ts` — Unicode code-point classification;
- `media-src/e2e/auto-wrap.spec.ts` / harness — browser-level controller and Vditor behavior; and
- create `test/vscode-e2e/large-mixed-markdown.ts` as the shared runtime fixture generator, then
  extend `test/vscode-e2e/auto-wrap.spec.ts` with the mandatory real-webview regression and
  performance net.

### 3.1 Auto Wrap scheduler

Do not merely move the existing serialized `captureTarget()` from input time to timer time while
leaving duplicate full comparisons behind. The scheduler should capture or increment a cheap token
on input and resolve the live target only after the delay. The controller remains generic and
unit-testable: tests must prove target/source acquisition count, not infer it from wall time.

Stale detection must use identity and monotonic state: outer/inner Vditor instance, mode, connected
editor, input generation, selection nodes/offsets, and explicit lifecycle invalidation. JavaScript's
single-threaded timer/microtask ordering may be used, but do not depend on a Markdown string equality
check to prove freshness.

### 3.2 Exact delayed snapshot

Task 69's `createIncrementalMd()` cache is already byte-equivalent to a full IR serialize and already
self-heals by falling back on inconsistency. Expose the smallest read-only `EditSync` operation that
updates/returns this authority for the current IR DOM. Do not create a second incremental cache or
make Auto Wrap reach into `incremental-md.ts` internals.

The selection-to-source marker mapper may still require a Lute serialization. Reuse the supplied
authoritative snapshot for the equality guard so one delayed attempt does not immediately perform a
second equivalent full `getValue()`. If exact source mapping cannot be proven for a DOM shape, fail
closed exactly as today.

### 3.3 Unicode classifier

Classify Unicode by code point, not UTF-16 string length. Use supported Unicode property escapes or
a small pure helper, and keep a table-driven distinction between:

- inert prose content: Latin with diacritics, Thai, CJK, other letters, combining marks where safe;
- single-code-point emoji/symbols proven inert;
- mid-token spaces/digits after Unicode alphanumeric content;
- Markdown-active ASCII punctuation and marker-committing positions;
- fence delimiters; and
- multi-code-point grapheme/IME sequences that retain the real-spin fallback.

Do not change list spin scope. Task 177 proved that an immediate-list candidate can leave a parent
list tight/bare where the stock outer-list spin makes it correctly loose/paragraph-wrapped even when
serialized Markdown remains equal.

## 4. Test-first acceptance

> **For implementation agents:** use `superpowers:test-driven-development` before production
> changes, `superpowers:systematic-debugging` for unexpected behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-lute-features` and `vmde-testing` skills.

### 4.1 Unit coverage

Write RED tests before production edits. Cover:

- N eligible inputs reset one trailing timer while target/source acquisition remains at zero;
- the delay fires exactly once and acquires the current target/source once;
- disable, delay/column change, non-text input, pointer/keyboard navigation, disposal, mode/instance
  change, external invalidation, and stale selection prevent apply;
- composition defers work and schedules at most once after composition end;
- recursive input from the formatter does not schedule another wrap;
- an apply rejection reports once and releases suppression;
- incremental IR snapshot, fallback, invalidation, self-heal, and exact equality with `getValue()`;
- delayed no-op versus changed rewrap without redundant snapshot calls;
- ASCII, accented Latin, Thai, CJK, combining marks, Unicode digits, single-code-point emoji/symbols,
  surrogate pairs, ZWJ/multi-code-point sequences, IME, fence backticks, marker punctuation, spaces at
  structural and mid-token positions, selection replacement, Enter, delete, paste, undo, and redo;
- prose, headings, list items, table-cell descendants, blockquotes/callouts, and fenced code/diagram
  source; and
- existing Task 175/180 escape-hatch and Task 516 controller cases remain green.

Inspect changed-line coverage for every scheduler, fallback, invalidation, Unicode, and error branch.

### 4.2 Chromium regression

Use a generated mixed fixture large enough to exercise incremental IR serialization. The focused
harness must prove:

- Auto Wrap off/on and Preview Reflow off/on produce identical typing-phase serialization counts;
- a 12-character eligible burst performs zero full-document `getValue()` / `VditorIRDOM2Md` calls
  before the configured delay;
- the delay fires one formatter attempt and wraps the current logical unit correctly;
- disabling/changing mode or moving the caret before the delay prevents stale application;
- Unicode prose and fenced-source bursts skip per-character spins and perform one settle spin;
- structural ASCII and list-boundary inputs still take the real spin; and
- exact `getValue()`, hard breaks, protected syntax, caret, scroll, and undo remain correct.

Prefer deterministic call counters and DOM/source assertions over tight absolute timing thresholds.

### 4.3 Real-VS-Code acceptance

Extend the existing single-test `test/vscode-e2e/auto-wrap.spec.ts`; do not add one VS Code boot per
configuration. Generate the large fixture under `baseDir` at runtime—do not commit a 100+ KB fixture.
It must contain at least 2,000 lines, 800 prose paragraphs, 40 lists, four tables, four ordinary code
fences, and four Mermaid fences. Wait for the four Mermaid renders before timing.

Within one boot:

1. establish an Auto-Wrap-off warmed ASCII baseline;
2. enable Auto Wrap with a long delay and prove a 12-character burst makes zero full serializer
   calls before the delay;
3. repeat with Preview Reflow enabled and prove the same;
4. exercise the default 500 ms delay, assert one changed wrap, separate undo, host bytes, scroll,
   save, close, and reopen;
5. compare ASCII, Thai, CJK, accented Latin, and emoji bursts by spin count, requiring zero
   per-character spins only for the classifier's explicitly supported inert set; and
6. verify structural punctuation, fenced backticks, list boundaries, and IME keep their fallback.

Run the final candidate with `--retries=0`. Record call counts and timings, but gate primarily on
mechanism: zero typing-phase full serialization, one delayed apply, and byte/interaction fidelity.

## 5. Completion and verification

Use current `DEVELOPMENT.md` as command authority and avoid redundant broad reruns while iterating.

```bash
npx vitest run --config test/vitest.config.ts \
  media-src/src/editing/auto-wrap.test.ts \
  media-src/src/editing/spin-skip-fence.test.ts \
  media-src/src/bridge/edit-sync.test.ts \
  media-src/src/editing/rewrap-command.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
xvfb-run -a npm --prefix media-src run test:e2e -- auto-wrap.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- auto-wrap.spec.ts --retries=0
npm run quality
git diff --check
```

- [ ] Auto Wrap performs no full-document work during an eligible typing burst.
- [ ] One trailing delayed attempt uses exact current Markdown and applies at most one transaction.
- [ ] Stale targets cancel without serialization or mutation.
- [ ] Supported Unicode prose/fence input skips per-character spins and settles once.
- [ ] Structural/ambiguous input retains Vditor's correctness-first spin.
- [ ] Exact bytes, syntax boundaries, hard breaks, caret, scroll, focus, undo/redo, save/reopen, and
      configuration behavior remain correct across SV/IR/WYSIWYG.
- [ ] Changed-line coverage, typechecks, build, budgets, focused Chromium, no-retry real VS Code,
      quality, and diff checks pass with retries/residuals recorded honestly.
- [ ] The final diff excludes generated output, `LOCAL_AGENT_TASK.md`, and unrelated user work.
- [ ] Only after all acceptance items pass: mark this task done, move it to `tasks/done/`, add its
      completed entry to `tasks/README.md`, and create focused local implementation commit(s). Do not
      push.

## 6. Out of scope and rejected approaches

- Changing `preview.reflowLineBreaks`, soft-break CSS, wrap width/default delay, or formatter syntax.
- A Lute fork, GopherJS-to-WASM rewrite, Worker spin, asynchronous caret rebuild, or parallel editor.
- Narrowing list spins or spinning one `<li>`; Task 177 rejected this on structural evidence.
- Treating arbitrary multi-character/IME input as inert without a separate real-IME proof.
- WYSIWYG incremental serialization (parked Task 167), Preview entry optimization (Task 530), or
  unrelated open/render/cache work.
- Absolute microbenchmark claims as the primary gate; machine load varies, while serializer/spin
  call counts directly pin the regression mechanism.
