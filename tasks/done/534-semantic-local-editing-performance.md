# Task 534 — Semantic-local editing performance program

**Status:** ✅ completed 2026-09-01 · **Impact:** 🔴 high for structurally rich Markdown ·
**Origin:** Project Owner cursor-chunking question plus real-VS-Code investigation, 2026-08-31 ·
**Child tasks:** [535](done/535-mutation-local-editor-helpers.md) ✅ →
[536](done/536-structural-toc-invalidation.md) ✅ →
[537](done/537-complexity-aware-ir-incremental.md) ✅ →
[538](done/538-host-edit-propagation-performance.md) ✅

## Goal

Make recurring editing work proportional to the smallest semantically complete region affected by
an edit, while keeping the full Markdown document and full Vditor DOM authoritative for save,
mode conversion, external replacement, and recovery.

This is a program/status record, not one implementation task. It closes only after every child task
has either shipped or reached and documented its explicit kill condition, and the combined final
candidate passes the end-to-end acceptance below.

## Decision

Do **not** physically divide Markdown into fixed cursor-centred chunks. Cursor location is one input
to impact discovery, not the authority: paste, range deletion, undo/redo, IME, host updates, link
definitions, list tightness, block order, and mode rebuilds can affect content outside the caret.

Use this locality ladder instead:

| Minimum safe scope | Examples |
|---|---|
| current/adjacent inline nodes | IR marker visibility and caret decoration |
| changed top-level block | callout/code decoration, table normalization, diagram controls |
| semantic container | complete list, table, blockquote, or fenced block |
| narrow structural window | split/merge/insert/delete and Task 69 serialization |
| maintained document index | headings/ToC, outline, image references, Git mapping |
| full document | explicit save audit, mode conversion, external replacement, recovery fallback |

Every optimization must fail closed to a wider proven scope when impact is ambiguous. Full-document
work remains valid when it is semantically required; the problem is recurring full-document work
whose result cannot change for the current edit.

## Evidence boundary

The investigation compared the pre-fix baseline `8955198c956e38fc0785aadec649e837a1e14a8f`
with Task 532's completed candidate `84cfe92fed901980bbb3ba83d0b075869344dcab` in isolated
worktrees. The sanitized regression corpus is now tracked at
`test/vscode-e2e/fixtures/large-structured-synthetic.md`, so the aggregate measurements and byte
fidelity checks are reproducible.

The tracked fixture is 94,711 bytes / 2,252 physical lines and renders as:

- 586 top-level IR blocks and 4,789 descendant DOM nodes;
- 129 headings, 123 lists / 336 list items, four tables, and 18 code/diagram blocks; and
- 504 generic inline-format candidates.

Measured mechanisms on the completed Task 532 candidate:

| Journey | Measured result |
|---|---:|
| unchanged exact Markdown snapshot | about 154–170 ms, one full IR serialization |
| eight Backspaces | about 4,176 mutation records |
| eight edited-block spins | about 8–10 ms total |
| post-burst ToC spin | about 42 KB / 24–46 ms |
| host TextDocument propagation | about 1.17–1.38 s |
| editor-wide expanded-marker queries | **0** after Task 532 |

Task 532 proves local semantic reconciliation works: it removed the whole-editor marker scans and
controller-added selection cycle without weakening navigation. It did not materially change the
remaining latency because section/diagram/table helpers, ToC regeneration, serialization admission,
and host writeback are independent owners.

The existing sanitized `largeMixedMarkdown()` fixture crosses Task 69's 700-top-level-block gate;
the tracked structured fixture does not, despite its nested complexity. A temporary 500-block A/B made
unchanged snapshots about 2.4 ms but made initial cache construction about 467 ms and did not reduce
Backspace's mutation-driven blocking. Therefore neither a lower constant nor serialization work
alone is an acceptable program solution.

## Rejected approaches

### Fixed cursor chunks

Rejected. Arbitrary byte/line cuts can split lists, tables, quotes, fences, reference relationships,
or a multi-block selection. Reassembling independent parses would change live structure or bytes.

### Threshold/debounce tuning only

Rejected as the architecture. Lowering Task 69's gate can trade recurring cost for a first-edit
freeze; increasing debounce only moves work and can fire mid-burst once blocking delays input events.

### One shared observer dispatcher

Rejected as a prerequisite, consistent with Task 176. Consolidating observer instances does not
localize their disjoint scans or attribute writes and risks their synchronous/rAF ordering. Task 535
shares classification, not dispatch ownership.

## Child ownership and order

1. **Task 535 — mutation-local editor helpers.** Remove the largest recurring main-thread amplifier
   first. It establishes the reusable impact classifier and localizes section/table/diagram helpers.
2. **Task 536 — structural-only ToC invalidation.** Consume Task 535's structural impact so ordinary
   text edits do not run the document-wide heading spin.
3. **Task 537 — complexity-aware IR incremental admission.** Admit structurally rich sub-700-block
   documents without moving a blocking baseline onto the first edit.
4. **Task 538 — host propagation profiling and optimization.** Instrument only after webview-side
   recurring work is isolated, then fix the measured dominant host stage rather than guessing.

Task 535 shipped the neutral mutation-impact classifier and localized section/table/diagram helper
work. Its final real-VS-Code journey reduced the pinned ordinary-edit mutation count from about
4,176 to 298 records while preserving exact host and disk Markdown. Task 536 then made ordinary
non-heading edits run zero ToC spins; the structured-fixture comparison reduced the extra approximately 42 KB
settle spin to a 199-byte maximum ordinary block spin. Task 537 then shipped complexity-aware,
host-canonical atomic IR seeding, and Task 538 moved cold host block canonicalization off the first
edit. Final umbrella verification resolved the release-impacting cross-feature regressions and
classified the remaining retry/environment evidence below.

Do not run these children concurrently when their source surfaces overlap. Task 536 depends on Task
535. Task 538 depends on Task 537 so its profile is not confounded by avoidable webview
serialization. Task 537 may be investigated while 535/536 are conceptually reviewed, but its final
real-VS-Code comparison must use their shipped candidate.

## Shared correctness constraints

- Preserve exact Markdown bytes, source-map behavior, focus, caret/selection, scroll, undo/redo,
  host sync, save/reopen, and all three edit modes.
- Do not narrow Vditor/Lute to one `<li>`. Task 177 proved live loose/tight structure can diverge even
  when Markdown serialization still compares equal.
- Keep Task 69's authoritative full-save drift audit and self-healing fallback.
- Do not add a Lute fork, Worker spin, setting, command, dependency, compatibility path, or automatic
  mode switch.
- Preserve synchronous no-flash decorators and every observer's current lifecycle/disposer.
- Ambiguous, detached, large-batch, mode-switch, streaming, undo/redo, or external-replacement impact
  widens conservatively.
- Durable tests use `test/vscode-e2e/fixtures/large-structured-synthetic.md`,
  `test/vscode-e2e/large-mixed-markdown.ts`, and purpose-built synthetic controls.

## Combined acceptance

Use deterministic counters as primary gates and timing medians as secondary evidence. Timing claims
must use at least three no-retry runs on the same built candidate/machine with no concurrent
real-VS-Code run.

The final combined journey must prove:

- ordinary one-block insertion/deletion performs no named helper full-root scan;
- ordinary non-heading text bursts perform zero ToC spins;
- the sanitized complex document uses exact incremental IR snapshots without a first-edit cache
  construction pause;
- the host propagation stages are attributable and the measured dominant stage is improved or the
  child task records its kill decision;
- split/merge/paste/list/table/heading/ToC/IME/undo/mode/external-update fallbacks preserve bytes and
  live structure; and
- Task 532's exact cut and Backspace mechanism/caret regressions stay green.

At final closure run the focused child unit/Chromium/real-VS-Code specs, build, bundle/startup budgets,
all typechecks, changed-line coverage, `npm run quality`, and one routine real-VS-Code tier selected
from current `DEVELOPMENT.md`. Do not repeat broad suites after each child; use one final combined
candidate and record retries/omissions honestly.

## Out of scope

- WYSIWYG incremental serialization; parked Task 167 keeps its separate fidelity-fuzz gate.
- Large-file open streaming; Task 188 already owns and ships that path.
- Initial cold diagram rendering/off-thread engines; Tasks 168/182 own those decisions.
- A general reactive framework, observer rewrite, persistent AST, rope/piece-table document model,
  or SiYuan BlockDOM migration.
- Changing Markdown semantics, normalizing source, weakening explicit-save authority, or trading
  correctness for a timing threshold.

## Completion checklist

- [x] Tasks 535–538 are each shipped or closed by their explicit evidence-based kill condition.
- [x] The locality ladder and fallback rules are implemented without a central observer dispatcher.
- [x] Exact bytes, live list/heading/table/diagram structure, caret, undo, and save/reopen pass.
- [x] The sanitized combined real-VS-Code journey passes with final `--retries=0` evidence.
- [x] The tracked structured-fixture comparison preserves its bytes and records aggregate mechanism/timing deltas.
- [x] Applicable final gates pass and the task/index record all residuals honestly.

## Completion evidence

- The final candidate keeps the four child mechanisms intact and fixes the release-impacting
  interactions their deferred routine tier exposed: a real cut now revokes a still-pending
  host-owned incremental seed; VS Code-bridged format hotkeys preserve the keydown selection and
  own one undo boundary; word expansion skips Vditor's zero-length caret leftovers; Escape captures
  the pre-structural-selection caret; and repeated Enter follows the transferred trailing paragraph.
- Test defects were corrected without weakening their behavior gates: the structured-seed journey
  waits for its actual undo checkpoint; Task 532 excludes an unrelated delayed Vditor addCaret cycle
  through an explicit quiescence window; the Ctrl+K chord polls for its positive editor result; the
  document-sync fixture again has real scroll range; image revalidation reads the current PNG IHDR;
  and the multi-block cut still proves exact cut/clipboard bytes while accepting Chromium 1.129's
  native coalescing of two visually indistinguishable spaces on the following typed edit.
- Focused unit coverage passed 372 tests. The full permitted coverage run passed 251 files / 3,647
  tests at 76.79% statements, 69.11% branches, 79.79% functions, and 78.82% lines; the 13-module
  zero-coverage ratchet passed. Focused Chromium acceptance passed 9/9.
- The no-retry real-VS-Code child set passed on one unchanged build: Task 532 cut/Backspace 1/1,
  Task 535 mutation-local 1/1 (287 raw records in the final combined sample), Task 536 ToC 1/1,
  Task 537 incremental seed 1/1, and Task 538 propagation 2/2. The final Task 538 structured sample
  recorded about 410 ms end-to-end, 14 ms host time, 585 cache hits / zero misses, and exact bytes.
  One all-in-one batch saw the Auto Wrap external-reseed state cancel under load; the same
  `--retries=0` incremental journey passed immediately in isolation on the unchanged candidate.
- The final routine FAST tier exited green with 57 passed and two retry-recovered tests. Escape's
  final Ctrl+Tab control mutated only on its first load-sensitive attempt and passed its retry; the
  immediate-save test wrote exact bytes but observed VS Code's dirty flag before it cleared, then
  passed its retry and also passed 3/3 isolated no-retry runs. Both are recorded as environment/test
  timing residuals, not hidden as pristine first-attempt results.
- `node build.mjs`, all three typechecks, lint, module boundaries, and the 597 KB / 288-module /
  29.5 KB bundle-startup budgets passed. The registry-backed audit initially hit sandbox DNS and
  then passed outside the sandbox with zero package advisories and no mapped vendor advisories.
  `npm run quality` ran once: brand, lint, duplication, dependency rules, audits after permitted
  retry, coverage after permitted child-process retry, and the coverage ratchet pass. Its sole
  remaining product-independent residual is the pre-existing Knip unlisted transitive `yazl` import
  in `test/backend/package-local-preview-core.test.ts`; Task 541 owns the final release-wide gate
  cleanup rather than expanding this performance umbrella.
