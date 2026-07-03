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

- [ ] `media-src/src/edit-sync.test.ts` — **L1, NET, M**. Fake vditor + postMessage spy:
      input event → one debounced `{command:'edit'}` with serialized content; rapid edits
      coalesce; flush-on-save bypasses debounce; undoDelay/busy branches. The
      corruption-critical keystroke→host core, currently 0% unit-covered.
- [ ] `test/backend/writeback-controller.test.ts` — **L1, NET, S**. MINDIFF_CAP exceeded →
      full-write fallback bytes correct; applyEdit rejection → showError, baseline
      uncorrupted; echo-flag set/clear ordering.
- [ ] `media-src/src/toolbar-actions.test.ts` — **L1, NET, S**. Saved-options persistence
      writes ONLY `mode` (allow-list); >700KB streamed open forces ir session-only, never
      persisted; mode reported to host. Pins the exact surface task 188 will churn.
- [ ] `test/backend/patch-mutation.test.ts` — **L1, NET, S**. Every exported `patch*` in
      `esbuild-shared.mjs`: `patch(source) !== source` against the real vendored file
      (neuter detection) + re-application stable-or-throws.
- [ ] `test/vscode-e2e/save-fidelity.spec.ts` — **L3, NET, M** (→ smoke tier). Type into
      fixture, `workbench.action.files.save`, read disk via evaluateInVSCode: typed text
      present, rest byte-identical (minimal-diff proof on the real wire).
- [ ] `test/vscode-e2e/two-tab-sync.spec.ts` — **L3, NET, L**. vMarkd + `openSourceToSide`
      on same file; webview edit → text editor updates; text-editor edit → webview updates,
      caret not yanked; edit counter stable 2 s (no echo loop).
- [ ] `test/vscode-e2e/external-modify.spec.ts` — **L3, PROBE, M**. Caret mid-doc +
      scrolled; rewrite file via fs in extension host → content refreshes, caret block +
      scrollTop within tolerance (`caret-preserve.ts` first-ever exercise); second case
      while dirty → no content loss; plus `files.revert` after webview edit.
- [ ] `media-src/e2e/mode-roundtrip.spec.ts` — **L2, NET, M**. Torture fixture (§5);
      ir→wysiwyg→sv→ir via toolbar; `getValue()` byte-identical at each hop; caret block
      preserved ir↔wysiwyg; only `mode` in saved options.

### P1 — next

- [ ] `test/vscode-e2e/undo-redo-steps.spec.ts` — **L3, PROBE, M**. 3 separated edits,
      Ctrl+Z ×3 → original bytes, Ctrl+Y ×3 → final; dirty flag correct each step; save
      mid-stack then undo past save.
- [ ] `test/vscode-e2e/settings-live-apply.spec.ts` — **L3, NET+PROBE, M**. One session on
      all-renderers.md; `getConfiguration().update()` cycles `theme.mermaid`,
      `editor.codeLineNumbers`, toolbar visibility, outline default, `css.custom`; each
      applies without reopen; also write the external CSS file on disk → live style reload.
- [ ] `test/vscode-e2e/retheme-flip-matrix.spec.ts` — **L3, NET+PROBE, M**. Snapshot
      per-family SVG fill/stroke on all-renderers.md, flip `workbench.colorTheme`;
      plantuml/graphviz/abc/markmap/smiles/mindmap colours actually change; node count
      stays 1 (no duplicate render). Plantuml sticky-engine history = risk hotspot.
- [ ] `media-src/src/render-cache-client.test.ts` (extend) — **L1, PROBE, S**. Cache key
      includes resolved theme/palette token per family; same source + different theme ⇒
      different key. If false, that is a live stale-theme-paint bug.
- [ ] `test/vscode-e2e/diagram-cache-flip.spec.ts` — **L3, PROBE, M**. Warm cache dark,
      reopen light → fresh render or light colours; then edit a cache-painted mermaid →
      correct re-render, other cached families fingerprint-stable (cache-hit-then-edit).
- [ ] `test/vscode-e2e/cross-diagram-edit-ir.spec.ts` — **L3, NET, M**. Same fixture/
      fingerprints as the sv spec (task 189), but ir: click-expand mermaid + echarts,
      type, caret-leave collapse; other families stable, edited family re-renders once.
- [ ] `media-src/e2e/table-list-ops.spec.ts` — **L2, NET, M**. Table panel insert-row/col,
      delete, align-center → exact markdown from `getValue()`; list Tab/Shift+Tab indent,
      checkbox `[x]` round-trip, Enter-split renumber.
- [ ] `test/vscode-e2e/image-upload-wire.spec.ts` — **L3, NET, M**. Set `image.saveFolder`
      + webp; post real `upload` message (base64 PNG, bypasses clipboard flake) → .webp
      written under folder, markdown link inserted.

### P2 — nice-to-have

- [ ] `test/vscode-e2e/diagram-error-recover.spec.ts` — **L3, PROBE, M**. Loop engines:
      break (pinned) → **fix → SVG returns**, error box gone; catches d2/vega/geojson
      stuck-error states.
- [ ] `media-src/src/diagram-retheme.test.ts` — **L1, NET, S**. Flip entrypoint dispatch
      set === engine-registry families; mindmap preview-pane-only scoping.
- [ ] `test/vscode-e2e/commands-lifecycle.spec.ts` — **L3, NET, M**. `openInSplit` ×2 (tab
      count stable), `openTextEditor` swap, `openSourceToSide` from mid-doc caret → text
      selection line matches (`editor-caret.ts`).
- [ ] `test/vscode-e2e/tab-restore.spec.ts` — **L3, PROBE, M**. Edit+scroll, background the
      tab, return: content/scroll/dirty intact, both retain-hidden values.
- [ ] `media-src/e2e/paste-html.spec.ts` — **L2, PROBE, S**. Synthetic paste with
      Word-style `text/html` → headings/bold/table markdown, no raw HTML leak.
- [ ] `test/vscode-e2e/wiki-follow.spec.ts` — **L3, PROBE, L**. Chip click opens target;
      missing chip → file created + opened; rename target → chip state flips.
- [ ] `test/vscode-e2e/rename-open.spec.ts` — **L3, NET, S**. `workspace.fs.rename` open
      file → tab alive, type, save lands at NEW path.
- [ ] `test/vscode-e2e/perf-budget.spec.ts` — **L3, NET, M**. Convert perf-timeline prints
      into assertions with generous ceilings (700 KB stream-open interactive < N s;
      keystroke→host post < M ms) — regression signal for task 188.

## 4. Infrastructure

- [ ] **Smoke battery** — expand `pr-webview-smoke.yml` (verified: today exactly 2 specs,
      `webview` + `custom-diagrams-render`) to: `webview`, `custom-diagrams-render`,
      `undo-dirty-probe`, `sv-split`, `diagram-edit-monitor`, `scroll-preserve` + new
      `save-fidelity` (P0). Serial, VS Code cached, target ≤10 min. Closes the
      "save regression merges green" hole with zero new code (plus one P0 spec).
      Add `npm run test:vscode:smoke` mirroring the list for local use.
- [ ] **CI tiers** — PR = lint:ci + unit+coverage + harness e2e + smoke (7 L3 specs).
      Nightly = full L3 suite (verified: today runs `npm run test:vscode` INCLUDING all
      spikes — see quarantine below). Local-only = @visual goldens (unchanged, by design).
- [ ] **Spike quarantine** — `git mv` the `*spike*` + measurement specs (`d2-edit-perf`,
      `perf-timeline`, `perf-observer-fleet`, `perf-prose-typing`, `mermaid-markers`,
      `phase0-*`, `lockstep-undo-spike`, `diagram-175spike-all`, `diagram-resettle-spike`,
      `render-cost-spike`, `worker-feasibility-spike`, `elk-worker-spike`,
      `d2-insert-gap-spike`, `mermaid-htmllabels-spike`, `mermaid-pipeline-breakdown-spike`,
      `prose-180spike`) → `test/vscode-e2e/spikes/`; add `testIgnore: '**/spikes/**'` to the
      config; extract prose-180spike's one safety assertion into `prose-skip-safety.spec.ts`
      (stays in nightly); keep a `test:spikes` opt-in script.
- [ ] **Fixtures** — add `fixtures/torture.md` (nested lists + table-in-callout + math +
      code + 3 diagrams + wiki-link + HTML comment + hr) as the canonical doc for
      mode-roundtrip and future round-trip specs; add `fixtures/gen-large-800k.mjs`
      generator (task-188 landing net); convert the grep-opaque vditor-fidelity-bugs
      inline strings into `fixtures/fidelity/*.md` + one index test asserting per-file
      round-trip byte-stability (a growing fidelity corpus — drop any user-reported
      corruption doc in as a file).
- [ ] **Condition-wait policy** — no new fixed `waitForTimeout` in specs: new specs must
      poll observable state (`expect.poll`/`waitForFunction` on render fingerprint or
      message counter). Refactor existing sleeps opportunistically when a spec is touched;
      no big-bang rewrite.
- [ ] **Coverage ratchet** — script diffs `coverage-summary.json` against a committed
      baseline; PR fails if it adds a media-src module at 0% coverage (stops the
      ~40-module untested-module list growing).

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
