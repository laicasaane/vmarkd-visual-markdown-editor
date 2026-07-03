# Task 190 — user-journey test coverage plan (change-stability net)

> **Status:** 📋 PLAN (2026-07-03). Analysis task: map how users actually use vMarkd
> (45 journeys), audit what each test layer really covers today, and produce a
> prioritized plan of tests to implement so that (a) introducing changes / adding
> features cannot silently break existing behaviour and (b) currently-dark paths that
> may already be broken get probed. Produced by an 11-agent workflow audit
> (`wf_c100c35c-65a`: 6 inventory readers → 4 gap lenses → synthesis); CI-facts
> (smoke/nightly contents) verified by hand against `.github/workflows/`.
>
> Layers: **L1** = vitest unit (`media-src/src/*.test.ts` + `test/backend/*.test.ts`),
> **L2** = chromium harness e2e (`media-src/e2e/*.spec.ts`),
> **L3** = real-VS-Code e2e (`test/vscode-e2e/*.spec.ts`, xvfb).
> Item types: **NET** = protects behaviour known to work; **PROBE** = may discover
> behaviour that is already broken (run probe first, promote to net after fixing).

## 0. Progress (2026-07-03) — IMPLEMENTED & VERIFIED across 5 batches

**Status: P0 complete, P1 complete, P2 substantively covered, infra done; remainder triaged
below (covered-elsewhere / deferred-with-reason).** Every new test was RUN green under xvfb.
Reading the real code before writing corrected several plan assumptions (noted inline).

New tests: **18 L1 unit cases** (edit-sync 7, writeback-controller 6, patch-mutation registry-driven,
reportEditorMode 5) + **9 real-VS-Code specs** (save-fidelity, doc-sync ×2, mode-roundtrip,
undo-redo-steps, settings-live-apply, retheme-flip-matrix, cross-diagram-edit-ir, list-ops,
commands-lifecycle) + 4 fixtures. Infra: smoke battery (2→6 specs, PR-gated), coverage ratchet.

Final gates: unit **1230/1230** (was 1187 at session start), typecheck clean, build patch-coverage
green, coverage ratchet green, all 9 new L3 specs + the 6-spec smoke battery green. **Lint: the
whole tree is now 0-warning** — cleared the 11 long-standing warnings (4× useOptionalChain in
`spin-skip-fence.ts`; 7 stale `biome-ignore` suppressions in callout-nav / echarts-theme.spec /
parity.spec) so a NEW warning now stands out instead of hiding in expected noise (serves the
change-stability goal). save-fidelity hardened to poll for the edit before saving (no smoke flake).

### Batch 1 — P0 save-path core + smoke gate
(reading the real code first surfaced two plan inaccuracies — noted inline):

- [x] `test/backend/writeback-controller.test.ts` — NET, 6 cases: MINDIFF_CAP full-write
      bypass, applyEdit-returns-false recovery (error + pending cleared + lastSynced NOT
      advanced), echo-flag ordering, no-op + reflow-no-op short-circuits. Was 0% covered.
- [x] `media-src/src/edit-sync.test.ts` — NET, 7 cases: debounce→one post, coalesce,
      flush-bypasses-debounce, suppressed-gate (idle + flush), docMode dedup, and the
      flush drift-guard posting the authoritative getValue. Was 0% covered.
- [x] `test/backend/patch-mutation.test.ts` — NET: exported `VDITOR_TS_PATCHES` and iterate
      it — every registry transform must MUTATE ≥1 matched vendored file and be
      stable-or-throw on re-apply (neuter detection the build's rename assert can't catch).
- [x] `reportEditorMode` coverage — **CORRECTION:** the plan's `toolbar-actions.test.ts` is
      redundant; `save-vditor-options.test.ts` already tests toolbar-actions (mode allow-list
      + streamed-open override). Only `reportEditorMode` was untested → folded 5 cases in
      there instead of a new file. (The >700KB force-ir wiring lives in `main.ts`, not
      toolbar-actions — it's an L3 concern, see the large-file probe.)
- [x] `test/vscode-e2e/save-fidelity.spec.ts` — NET (real wire): type prose → save → disk
      byte-identical except the insertion (delta == marker length, every other block
      verbatim). Works on an OS-tmp copy so a fail can't dirty the tree. **Verified green.**
- [x] Smoke battery — `npm run test:vscode:smoke` (webview, custom-diagrams-render,
      undo-dirty-probe, **save-fidelity**, sv-split, scroll-preserve); `pr-webview-smoke.yml`
      now runs it (was 2 specs). **Ran the full battery: 6/6 green (1.3m).** Closes the
      "a save/edit regression merges green" hole.
- **CORRECTION (spike quarantine):** already done — `test/vscode-e2e/playwright.config.ts`
  has `testIgnore: ['**/*spike*']` (opt back in via `test:spikes`), so `*spike*` specs are
  already out of the nightly gate. Remaining quarantine work shrinks to the perf/monitor
  specs that don't carry "spike" in the name (deferred, low priority).

### Batches 2–5 — P0 remainder, P1, key P2, ratchet
- **Batch 2 (P0 remainder):** `doc-sync.spec.ts` (merges two-tab-sync + external-modify — both
  are the same host↔webview update path; caret-preserve's first exercise) + `mode-roundtrip.spec.ts`
  (ir→wysiwyg→sv→ir byte-stable). Green.
- **Batch 3 (P1):** `undo-redo-steps`, `settings-live-apply`, `retheme-flip-matrix` (subsumes
  diagram-cache-flip). Green.
- **Batch 4 (P1/P2):** `cross-diagram-edit-ir`, `list-ops`, `commands-lifecycle`. Green.
- **Batch 5 (infra):** coverage ratchet (`scripts/check-coverage-modules.mjs` + CI wiring +
  json-summary reporter). Green.

**Triaged (not implemented, with reason — see the ticked items in §3/§4):** render-cache theme-key
& diagram-retheme (already unit-covered), diagram-error-recover (plantuml-edit-recovery covers the
stateful case), rename-open (extension.test.ts rename-tracking covers it), image-upload-wire
(host+convert unit-covered), tab-restore / paste-html / wiki-follow / perf-budget (deferred probes,
covered at other layers or harness-fragile), fixture corpus + gen-large (task-188-adjacent).

## 1. Journey × layer coverage matrix

✅ adequate · △ partial · ❌ absent. Representative, not exhaustive (full journey
catalog in §7).

| Journey | L1 unit | L2 harness | L3 real-VS-Code | Verdict |
|---|---|---|---|---|
| J1 Open & read (prerender→handoff) | △ | ✅ | ✅ boot specs | ✅ |
| J2/3 Type prose → save to disk | ❌ edit-sync untested | △ grazed by keybugs | △ nightly-only | ❌ |
| J4 List edit (indent/checkbox/renumber) | ❌ | △ crash pin only | ❌ | ❌ |
| J5 Table panel ops → markdown | ❌ | △ dispatch pinned, md never asserted | ❌ | △ |
| J6 Code block typing/nav | ✅ | ✅ codenav, highlight | ✅ | ✅ |
| J7 Diagram edit, ir dual-node | △ | △ | △ sv covered; ir cross-family only flowchart/graphviz | △ |
| J9 Callout editing | ✅ | ✅ | △ no arrow-nav | ✅ |
| J10/11 Paste plain / rich HTML | △ detect pin | ❌ HTML path | ❌ | △ |
| J12 Image paste → file on disk | ✅ planUpload | ✅ convert | ❌ host `upload` wire | △ |
| J14 Undo/redo interop | ❌ | △ DMP-exists check | △ single undo-to-start probe | △ |
| J15 External modify while open (`caret-preserve.ts`) | ❌ | ❌ | ❌ | ❌ |
| J16 Mode switch ir↔wysiwyg↔sv round-trip | ❌ | ❌ | ❌ | ❌ |
| J17 Edit⇄Preview scroll keep | — | ✅ | ✅ scroll-preserve | ✅ |
| J18 sv split editing | △ | ✅ | ✅ sv-split + cross-diagram-edit | ✅ |
| J19/20 Outline panel + tree | ✅ | ✅ | ❌ | ✅ |
| J22/23 Wiki links | ✅ | ✅ | ❌ cross-file follow/create/rename | △ |
| J24 Link routing | △ | △ | △ d2-anchor only | △ |
| J26 Live theme flip | △ no orchestrator-dispatch test | △ mermaid only | △ 7/15 engines; plantuml/graphviz/abc/markmap/smiles/mindmap dark | △ |
| J27 Settings live-apply mid-session | △ host unit | △ webview fragment | ❌ never over real wire | ❌ |
| J30 Two tabs, both-way sync | △ sync vscode-mock only | ❌ | ❌ | ❌ |
| J33 Large file + >700KB force-ir fallback | ❌ `toolbar-actions.ts` uncovered | ❌ | △ stream-open exists | △ |
| J34 Render cache (reopen / ×theme / then-edit) | △ | ❌ | △ byte-identical reopen only | △ |
| J36 Untitled → save-as | ❌ | ❌ | ❌ | ❌ |
| J31/37/40 Commands, rename-follow | △ mocks | — | ❌ | △ |

## 2. Already well protected — do NOT add tests here

- **Diagram render + error boxes**: custom-diagrams-render, all-renderers fixture,
  diagram-errors (valid→invalid all 15 engines), diagram-width/bg/zoom-gate regressions.
- **Code-block editing/nav**: gap-paragraph, codenav, hr-nav, wysiwyg highlight, line
  numbers, theme-flash.
- **Callout core editing** (task 179 nets), **scroll preservation** Edit⇄Preview,
  **sv internals** (sv-split + cross-diagram-edit, task 187/189).
- **Content-theme cascade** (content-theme.spec) and vendored-patch anchor pins
  (drift detection — *mutation* detection is the gap, not presence; see P0).
- **Outline & wiki at L1/L2** — rich nets; only the real-VS-Code delta is open.
- **Prose-typing perf on large docs** — architectural Vditor limit; no "is it fast" tests.
- **Marp** — unmerged branch, out of scope.

## 3. Prioritized test plan

### P0 — change-stability core (implement before further feature work, esp. task 188)

- [x] `media-src/src/edit-sync.test.ts` — **L1, NET, M** (done — batch 1). Fake vditor + postMessage spy:
      input event → one debounced `{command:'edit'}` with serialized content; rapid edits
      coalesce; flush-on-save bypasses debounce; undoDelay/busy branches. The
      corruption-critical keystroke→host core, currently 0% unit-covered.
- [x] `test/backend/writeback-controller.test.ts` — **L1, NET, S** (done — batch 1). MINDIFF_CAP exceeded →
      full-write fallback bytes correct; applyEdit rejection → showError, baseline
      uncorrupted; echo-flag set/clear ordering.
- [x] toolbar-actions coverage — **L1, NET, S** (done — batch 1, as `reportEditorMode` in
      `save-vditor-options.test.ts`). CORRECTION: `save-vditor-options.test.ts` already tests
      toolbar-actions (mode allow-list + the streamed-open override), so only `reportEditorMode`
      was missing — folded in there. The >700KB force-ir wiring is in `main.ts` (an L3 concern).
- [x] `test/backend/patch-mutation.test.ts` — **L1, NET, S** (done — batch 1). Exported the
      `VDITOR_TS_PATCHES` registry and iterate it: every transform must MUTATE ≥1 matched
      vendored file (neuter detection) + re-application stable-or-throws.
- [x] `test/vscode-e2e/save-fidelity.spec.ts` — **L3, NET, M** (done — batch 1, in smoke).
      Type into fixture, `workbench.action.files.save`, read disk: typed text present, every
      other block byte-identical, delta == marker length (minimal-diff proof on the real wire).
- [x] `test/vscode-e2e/doc-sync.spec.ts` — **L3, NET/PROBE** (done — batch 2, MERGES the
      planned `two-tab-sync` + `external-modify`: J15 and J30 are the SAME
      onDidChangeTextDocument→schedulePostUpdate→`update`→preserveCaretAndScroll path). 2 tests:
      webview edit reaches the TextDocument + doc version stays stable (no echo loop); an
      external (non-webview) applyEdit reaches the webview AND preserves scroll (not reset to
      top — `caret-preserve.ts`'s first-ever exercise). **Verified green.** (The while-dirty
      conflict + `files.revert` sub-cases deferred — separate murkier concern, §5 probe.)
- [x] `test/vscode-e2e/mode-roundtrip.spec.ts` — **L3, NET** (done — batch 2; L3 not L2 — the
      real toolbar mode buttons are more faithful and reuse the existing L3 harness). Canonical
      `fixtures/torture.md`; ir→wysiwyg→sv→ir via the toolbar; **ir1 === ir0 byte-for-byte**
      (verified: len 729→728→729→729, identical=true) + every hop keeps all content anchors.

### P1 — next

- [x] `test/vscode-e2e/undo-redo-steps.spec.ts` — **L3, PROBE** (done — batch 3). Type a
      marker → Ctrl+Z ×15 removes it → Ctrl+Y ×15 restores it. **Verified green** (the redo
      direction undo-dirty-probe never covered works end-to-end).
- [x] `test/vscode-e2e/settings-live-apply.spec.ts` — **L3, NET+PROBE** (done — batch 3).
      `getConfiguration().update()` on an open editor: `css.custom` applies AND re-applies live
      (outline colour rgb(3,5,7)→rgb(9,8,7), no specificity war), and `editor.codeLineNumbers`
      forces a live re-init that preserves the document. **Verified green.**
- [x] `test/vscode-e2e/retheme-flip-matrix.spec.ts` — **L3, NET+PROBE** (done — batch 3, ALSO
      subsumes the planned `diagram-cache-flip` no-dup-render intent). Census all 14 families,
      flip `workbench.colorTheme` Dark↔Light: every family's element/svg/canvas count is
      identical across the flip (no duplicate/lost render — the task-189 corruption class on the
      theme trigger) AND the fill/stroke digest changes (re-colour happened). **Verified green**
      (dark digest 8234 ≠ light 7901, all counts stable).
- [x] `media-src/src/render-cache-client.test.ts` — **L1** — CORRECTION: already covered.
      The existing suite pins `hashOf` sensitivity to BOTH the theme key ("changes when the
      THEME key changes") and the engine version — the exact stale-theme-cache guard proposed.
      No new test needed.
- [x] `diagram-cache-flip` — **SUBSUMED** by `retheme-flip-matrix.spec.ts`: its per-family
      no-dup-render census across a Dark↔Light flip is exactly the cache-hit-then-flip guard
      (and `render-cache-client.test.ts` already pins that the cache key folds the theme, so a
      flip is a guaranteed miss → fresh render, not a stale-theme repaint).
- [x] `test/vscode-e2e/cross-diagram-edit-ir.spec.ts` — **L3, NET** (done — batch 4). The IR
      counterpart of task 189's split-view net: fingerprints all 14 families, types into a prose
      paragraph in IR, asserts every diagram family's els/svgs/canvases/copy-buttons/height
      unchanged. **Verified green.**
- [x] `test/vscode-e2e/list-ops.spec.ts` — **L3, NET** (done — batch 4; L3 not L2 — the real
      IR surface). Task list + bullet list load and serialize; Enter continues the bullet list
      into a new `- ` sibling item, task list undisturbed. **Verified green.** (Table floating-panel
      ops deferred — cell-content preservation is unit-covered by minimal-diff-writeback; the
      synthetic checkbox-input click is a §5 probe — it collapses getValue in the headless
      harness, a caret-context artifact to confirm against a real click.)
- [~] `test/vscode-e2e/image-upload-wire.spec.ts` — **DEFERRED** (host + conversion already
      unit-covered by `test/backend/image-upload.test.ts` + `media-src/src/image-convert.test.ts`).
      The remaining real-wire gap depends on workspace-trust + saveFolder resolution in the test
      instance; tracked as a §5 probe, not worth the flake for the marginal coverage.

### P2 — nice-to-have

- [x] `diagram-error-recover` — **TRIAGED: already covered.** The stateful, stuck-error-prone
      engine is plantuml, and `plantuml-edit-recovery.spec.ts` explicitly proves the recover
      direction (sequence→class→sequence recovers to an svg). Every other engine re-renders from
      source each pass (stateless → recover is trivial), and their error boxes are pinned by
      `diagram-errors.spec.ts` (all 15) + `mermaid-error.spec.ts`. A broad new recover net would
      duplicate these.
- [x] `media-src/src/diagram-retheme.test.ts` — **L1** — CORRECTION: redundant. `diagram-retheme.ts`
      already throws at MODULE INIT if any registry engine tagged `mono`/`geo` lacks a re-render fn
      (any importing test catches it), and the mono/geo membership comes from `engine-registry`
      (its own test). The live re-colour behaviour is covered by `retheme-flip-matrix.spec.ts` (L3).
- [x] `test/vscode-e2e/commands-lifecycle.spec.ts` — **L3, NET** (done — batch 4). Round-trips
      the visual↔text editors: a custom editor is active (no `activeTextEditor`) → `openTextEditor`
      makes a text editor on the file active → `openEditor` brings the visual editor back (no text
      editor). **Verified green.** (Covers J40; `openSourceToSide` caret-line is covered by the
      existing reveal-in-source unit tests + `editor-caret`.)
- [x] `rename-open` — **TRIAGED: unit-covered.** `test/backend/extension.test.ts` → "rename
      tracking" already pins the whole re-point deterministically: retitles + rebinds the watcher +
      guards the old-uri close, AND "directs subsequent webview edits to the renamed uri" (the
      save-to-new-path guarantee). A real-webview L3 was attempted but the custom-editor iframe is
      recreated by VS Code on rename (doesn't rebuild `.vditor-ir` in the harness) — fragile and
      redundant, so it was dropped in favour of the unit coverage.
- [~] `tab-restore` — **DEFERRED (probe).** Backgrounding/restoring a webview tab is awkward to
      drive deterministically in the harness; retain-state is a memory dial, low regression risk.
      Listed as a §5 probe.
- [~] `paste-html` — **DEFERRED (probe).** Synthetic `text/html` paste events don't reliably drive
      Vditor's paste pipeline headlessly; the plain-paste detection is unit-pinned. §5 probe.
- [~] `wiki-follow` — **DEFERRED (probe).** Wiki is richly covered at L1 (`wiki*.test.ts`) + L2
      (`wiki-click`, `wiki-hint`, `wiki.spec`); the real-VS-Code cross-file follow/create needs a
      wiki-enabled workspace with two files — set-up-heavy for marginal delta. §5 probe.
- [~] `perf-budget` — **DEFERRED.** Wall-clock ceilings are inherently flaky on shared CI runners;
      the perf specs stay opt-in diagnostics (already quarantined). Revisit as a task-188 landing net.

## 4. Infrastructure

- [x] **Smoke battery** (done — batch 1) — added `npm run test:vscode:smoke` = `webview`,
      `custom-diagrams-render`, `undo-dirty-probe`, `save-fidelity`, `sv-split`,
      `scroll-preserve` (dropped the `diagram-edit-monitor` monitor to keep it fast/deterministic);
      `pr-webview-smoke.yml` now runs that script (single-sourced) instead of its 2 hardcoded
      specs. Verified: 6/6 green in 1.3 min. Closes the "save regression merges green" hole.
- [x] **CI tiers** (done) — PR = lint:ci + unit+coverage + **coverage ratchet** + harness e2e +
      smoke (6 L3 specs). Nightly = full L3 suite (`npm run test:vscode`, `*spike*` excluded by the
      config's testIgnore). Local-only = @visual goldens (unchanged, by design). The new batch-2..5
      specs ride the nightly full suite automatically (no per-spec CI wiring needed).
- [~] **Spike quarantine** — CORRECTION: `*spike*` specs are ALREADY excluded from the
      default/nightly run via `testIgnore: ['**/*spike*']` in `playwright.config.ts` (opt back
      in with `test:spikes`). Remaining (deferred): the measurement specs that DON'T carry
      "spike" in the name. Original proposal — `git mv` the `*spike*` + measurement specs (`d2-edit-perf`,
      `perf-timeline`, `perf-observer-fleet`, `perf-prose-typing`, `mermaid-markers`,
      `phase0-*`, `lockstep-undo-spike`, `diagram-175spike-all`, `diagram-resettle-spike`,
      `render-cost-spike`, `worker-feasibility-spike`, `elk-worker-spike`,
      `d2-insert-gap-spike`, `mermaid-htmllabels-spike`, `mermaid-pipeline-breakdown-spike`,
      `prose-180spike`) → `test/vscode-e2e/spikes/`; add `testIgnore: '**/spikes/**'` to the
      config; extract prose-180spike's one safety assertion into `prose-skip-safety.spec.ts`
      (stays in nightly); keep a `test:spikes` opt-in script.
- [x] **Fixtures** (partial — done what the specs needed) — added `fixtures/torture.md`
      (canonical normalized doc for mode-roundtrip), `fixtures/doc-sync.md` (tall, for the
      sync/scroll specs), `fixtures/save-fidelity.md`, `fixtures/list-ops.md`. DEFERRED: the
      `gen-large-800k.mjs` generator (belongs with task-188 implementation) and converting the
      `vditor-fidelity-bugs` inline strings into a `fixtures/fidelity/*.md` corpus (that suite
      already round-trips them in-place; extracting is cosmetic — do it when a user-reported
      corruption doc needs adding).
- [x] **Coverage ratchet** (done) — `scripts/check-coverage-modules.mjs` + `npm run
      check:coverage-modules`, wired into `ci.yml` after the coverage run. Reads the json-summary
      (reporter added to `test/vitest.config.ts`) and FAILS if any source module is at 0%
      statement coverage that isn't in the baseline of 36 (the current 0%-unit modules, most
      exercised by e2e). Verified: "OK — 36 at 0% (baseline 36)". Stops the untested-module list
      growing — a new module must ship with a test.
- [~] **Condition-wait policy** — DOCUMENTED here (standing rule): no NEW fixed `waitForTimeout`
      as a correctness gate; new specs poll observable state where practical. The batch-2..5 specs
      wait on real signals (`.vditor-ir`/`svg` `waitFor`, doc `version`, render fingerprints) and
      use settle-sleeps only after a signalled render. No big-bang rewrite of existing sleeps.

## 5. Exploratory probes — "what may not work yet"

Run each as a cheap throwaway first; promote to a net only what matters after fixing.

- **Wiki link-text rewrite on target rename [UNSUPPORTED?]** — rename `b.md` with chip
  open in `a.md`; grep doc for stale name. One evaluateInVSCode session.
- **Line-targeted vMarkd open [UNSUPPORTED?]** — VS Code global search result click;
  check whether custom-editor open carries the selection at all. 10-line experiment.
- **Drag-drop text/file → link [UNSUPPORTED?]** — synthetic drop with `text/plain` +
  file item in harness; only images are handled today.
- **Untitled → save-as** — untitled md → openWith vMarkd → type → saveAs; manifest
  registers untitled but the path is never exercised.
- **IME composition** — CDP `Input.imeSetComposition` in IR prose and inside a
  highlighted code block; duplication/caret check. Completely dark today.
- **Theme-flip during active diagram edit** — harness: expand mermaid source, flip theme
  class mid-edit; does the editor collapse or re-render from stale source?
- **Ctrl+F find** — real webview: does the find UI open at all given the capture-phase
  key interception?
- **Callout arrow-nav** — fold two Arrow presses across a collapsed callout at EOF into
  an existing L3 callout spec; assert scrollTop ≠ 0 (historic bug class).
- **Untrusted/virtual workspace** — launch vscode-test in restricted mode; does the
  editor open.
- **Copy as HTML** — harness: trigger copy command, inspect host clipboard payload.
- **Config interaction pairs** (fullWidth×outline, fontSize×lineNumbers) — cheap
  parametrized harness boot; promote to a net only if a probe finds breakage.

## 6. Sequencing

1. **P0 first, in one batch** — it is the safety floor for task 188 and any further
   feature work (edit-sync, writeback, toolbar-actions, patch-mutation are all S/M).
2. **Smoke battery + spike quarantine** next — zero/low-code, immediately improves what
   a PR proves.
3. **P1 rendering/theming block** together (retheme-flip-matrix + cache-flip +
   render-cache key) — they share the fixture and the fingerprint helper from task 189.
4. **Probes** opportunistically, one per session, before touching adjacent code.

## 7. Journey catalog (reference)

45 journeys inventoried (frequency × breakage-impact). Full list kept here as the
shared vocabulary for future coverage discussions:

1. Open & read (prerender→handoff) — daily/high. 2. Type prose (ir) — daily/high.
3. Save (Ctrl+S mid-edit) — daily/high. 4. Edit a list (indent/checkbox/reorder) —
daily/high. 5. Edit a table (floating panel) — daily/med. 6. Write a code block —
daily/high. 7. Edit a mermaid diagram (dual-node) — daily/high. 8. Write math (KaTeX)
— occasional/med. 9. Edit a callout — occasional/med. 10. Paste plain text/markdown —
daily/high. 11. Paste from Word/browser HTML — occasional/med. 12. Paste screenshot →
file — daily/high. 13. Drag-drop image file — occasional/med. 14. Undo/redo across
boundaries — daily/high. 15. External modification while open/dirty — occasional/high.
16. Mode switch ir↔wysiwyg↔sv — daily/med. 17. Edit⇄Preview toggle — daily/med.
18. sv split editing — daily/high. 19. Outline navigation — daily/med. 20. Explorer
outline tree — occasional/low. 21. Find in doc (Ctrl+F) — daily/med. 22. Follow
wiki-link / create missing — daily/med. 23. Rename wiki-link target — occasional/med.
24. Click regular link (modifier policy) — daily/med. 25. Reveal in source —
occasional/med. 26. VS Code theme flip while open — occasional/high. 27. Change a
setting live — occasional/med. 28. Custom CSS iteration (external file live reload) —
rare/low. 29. Git diff gutters while editing — daily/low. 30. Two tabs same file,
both-way sync — daily/high. 31. Open beside (tab reuse) — occasional/med. 32. Global
search → open at line — daily/med. 33. Large file open ~1MB (streaming) —
occasional/high. 34. Doc with 50 diagrams (perf gating + cache) — occasional/high.
35. Huge single diagram — rare/med. 36. Untitled markdown → save-as — occasional/med.
37. File rename/move while open — occasional/med. 38. WSL/remote workspace —
daily/high. 39. Untrusted/virtual workspace — rare/low. 40. Return to text editor
(Ctrl+Alt+E) — daily/med. 41. SCM diff click (stays text diff) — occasional/med.
42. Copy rendered content out as HTML — occasional/low. 43. Resize image by handles —
rare/low. 44. Drag-drop text/file to create link [UNSUPPORTED?] — rare/low.
45. Marp slide deck [UNSUPPORTED — unmerged branch] — rare/low.
