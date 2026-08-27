# Task 458 — Outline panel keyboard operability

**Status:** ✅ DONE (2026-07-31) · **Impact:** 🟡 medium · **Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem (re-verified before starting)

Outline items are non-focusable spans and the resize splitter is mousedown-only, so the whole panel
is mouse-only. Confirmed by measurement, not assumed: zero `tabindex` anywhere in the vendored
outline markup (`media-src/node_modules/vditor/src/ts/markdown/outlineRender.ts`), and the resize
handle (`outline-resize.ts`) only ever wired `mousedown`/`mousemove`/`mouseup`.

**Scope note, since it matters for how this reads next to [456](456-a11y-escape-the-editor.md):**
this task makes the outline OPERABLE once focus is there — it does NOT make it REACHABLE by a bare
keyboard walk from the editor. Task 456's escape chain currently lands Tab on the toolbar only; it
does not (yet) hop onward into the outline. A user gets here via a mouse click (which now also
focuses, since items carry real tabindex) or via whatever future step extends the escape chain —
out of 458's own scope, flagging it here rather than silently claiming full reachability.

## Measured DOM (chromium harness, `/outline.html`, `vditor@3.11.2`)

```
.vditor-outline > .vditor-outline__title
                 > .vditor-outline__content > ul
                     > li > span[data-target-id]   (icon + label — `li > span` is what the vendor's
                                                      own CSS pads/hovers/cursors, the bare <li> has
                                                      NONE of that, so the SPAN is the treeitem +
                                                      roving-tabindex target, not the li)
                         > ul                       (nested children, only when present — the
                                                      vendor's own collapse toggle sets
                                                      `style.display:none` on exactly this element,
                                                      never removes it)
```

## What shipped

- **`media-src/src/roving-tabindex.ts`** (new, shared) — `nextRovingIndex` (pure, unit-tested),
  `setRovingActive`/`moveRovingFocus`/`focusRovingItem` (DOM). Task 456's toolbar has the exact same
  roving-tabindex shape hand-rolled inline in `escape-toolbar.ts` (still there, untouched — checked
  with team-lead before touching it: that file is mid-diagnosis of a real focus-landing flake in the
  very code this extraction would carve up, `focusToolbar`/`initRoving` — measured 1 pass / 4 runs —
  and refactoring underneath a live investigation risks confounding the measurement). **Built the
  generic module, used it from `outline-keyboard.ts`, and left a comment in the module naming
  `escape-toolbar.ts` as the intended second consumer** — designed so it can adopt this shape without
  changing it (item collection + wrap-around index + tabindex/focus only; no toolbar- or
  tree-specific assumptions baked in). Team-lead is driving that adoption once 456 is green, not
  either agent editing the other's in-flight file. Whoever lands 456 next can drop its inline
  `rovingItems`/`initRoving`/`moveRoving` in favour of this module — the toolbar-specific
  item-discovery (`.vditor-toolbar__item` children) stays theirs, only the
  wrap-around-index + tabindex-loop + focus part moves.
- **`media-src/src/outline-keyboard.ts`** (new) — `role="tree"`/`"treeitem"`/`"group"` (+
  `role="none"` on the `<li>` wrapper so the implicit `listitem` role doesn't break tree→treeitem
  ownership; `aria-labelledby` the panel's own title), roving tabindex, ArrowUp/Down to move,
  ArrowLeft/Right to collapse/expand or step to a parent/child (WAI-ARIA APG treeview pattern — the
  task file's literal scope only named Up/Down/Enter, but a nested tree that only half-implements
  the pattern isn't genuinely operable; team-lead's brief flagged this too), Enter/Space to jump.
  Collapse/expand reuses the VENDOR's own toggle (a synthetic click on `.vditor-outline__action`)
  rather than a second collapse implementation. Re-applies itself via a `MutationObserver`
  (`coalescePerFrame`, same shape as `html-comment.ts`'s `observePreviewComments`) since Vditor
  rebuilds `.vditor-outline__content` wholesale on every edit; restores roving focus to the same
  LOGICAL heading position across a rebuild (by flat index, not element identity — elements don't
  survive a rebuild) and only steals focus back if the outline actually had it, never while the user
  is typing elsewhere.
- **Enter/Space activation reuses `outline.ts`'s `scrollToHeadingIndex`** (task 243's "ONE
  mechanism, two callers" — message-router's `scroll-to-heading` is the same function by index) —
  no third path. **Fixed a real correctness gap in that shared function while wiring this up**: it
  always read headings from `activeModeElement`, never checking whether the full Preview overlay was
  showing — but the vendor's own outline (`Outline.render`) generates ids from
  `preview.previewElement` in that case, and its own click handler branches the same way. Without
  the fix, activating an outline item by keyboard while Preview is open would have scrolled+flashed
  a heading in the hidden edit pane instead of the visible preview — a silent mismatch from what a
  mouse click on the same item does. This also incidentally corrects the same latent gap for the
  pre-existing cross-doc `scroll-to-heading` message and task 243's anchor-link path, not just the
  new keyboard caller.
  **Checked the one case that could have made this a regression instead of a fix for those two
  pre-existing callers**: split-view (`sv`) mode ALSO flips `preview.element.style.display` to
  `'block'` (`setPreviewMode.ts` — vMarkd's sv right pane genuinely IS `preview.previewElement`, per
  the existing `[[sv-preview-is-real-render]]` note), so the new branch is live there too, not just
  behind the Preview-overlay toggle. Traced it through regardless: `EditMode.ts`'s `setEditMode`
  unconditionally resets `preview.element.style.display` to `'none'` on every entry into `ir`/
  `wysiwyg` (the two modes both pre-existing callers actually run in), so the branch is a no-op for
  them there. For the sv case itself, sv's own pane renders headings as `<span data-type=
  "heading-marker">` (`sv/process.ts`) — real semantic `<h1>-<h6>` never exist in `sv.element` — so
  `scrollToHeadingIndex` invoked while `currentMode === 'sv'` was ALREADY a silent no-op for both
  pre-existing callers before this change (`querySelectorAll('h1,...')` on `sv.element` finds
  nothing); the new branch makes it resolve against the rendered preview pane instead, which is
  __more__ correct, not less. **Team-lead independently ran `anchor-links.spec.ts` (untracked, owned
  by task 243) against this change on today's tree, `--repeat-each=2 --retries=0`: 2/2 green.** My
  own earlier run forcing the branch off (isolating whether the change affected that spec at all)
  hit one failed run — that observation is SUPERSEDED, not a baseline finding: the file is untracked
  and was being actively rewritten by 243's owner around the same time, so my run most likely caught
  a mid-edit snapshot, not a stable pre-existing failure. Report the observation, not the conclusion,
  when the file underneath you is someone else's in-flight work — the retest is what settles it.
- **`media-src/src/outline-resize.ts`** — the handle is now `tabIndex=0`, `role="separator"`,
  `aria-orientation="vertical"`, `aria-valuenow/min/max`, with ArrowLeft/Right (10px step) + Home/End
  (min/max) resizing through the SAME `onResize` callback the drag path persists through
  (`save-outline-width`). `clampOutlineWidth`/`keyboardWidthDelta` extracted as pure, unit-tested
  functions. **Found and fixed a compounding-drift bug while writing the harness test**: the
  keyboard path's first draft based each step on `outlineEl.offsetWidth` (border-box — the panel has
  a 1px border on the resize-handle side), which is 1px more than the content-box width the CSS var
  actually sets; re-reading `offsetWidth` on every keypress re-added that 1px EVERY step (the drag
  path only samples it once per gesture, so it never compounds there). Fixed by basing each keyboard
  step on the var this module itself last wrote (`currentWidth()`), falling back to `offsetWidth`
  only before any width has ever been set.
- **Focus-ring CSS is QUEUED, not applied** — same `main.css`/ADR-0003-category-3/task-464 collision
  456 already logged for the toolbar. `main.css` is under task 464's live audit; adding a ring here
  now risks the same reclassify-on-sight/collision problem. Apply once 464 lands:
  ```css
  .vditor-outline li > span[data-target-id]:focus-visible,
  .outline-resize-handle:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
    border-radius: 2px;
  }
  ```
  `:focus-visible` (not `:focus`) so a mouse click stays ring-less, matching 456's own rule. Negative
  `outline-offset` for the same "tight bounds, avoid clipping" reason 456 gave. Until this lands, the
  resize handle in particular is a real tab stop with NO visible indicator (WCAG 2.4.7 not yet met
  for it) — noting it explicitly rather than silently.

## Tests

- **Unit** (`environment: 'node'`, no DOM — the pure pieces only, per this repo's own layering):
  `roving-tabindex.test.ts` (7 cases, `nextRovingIndex`), `outline-resize.test.ts` (9 cases,
  `clampOutlineWidth` + `keyboardWidthDelta`, incl. the sign-convention-matches-the-drag-path check).
  16/16 pass.
- **L2 chromium harness** (`media-src/e2e/outline.spec.ts`, added to the existing outline-cluster
  file rather than a new one): 4 new tests — roving tabindex + ArrowDown, ArrowRight/Left
  expand/collapse/ascend/descend, Enter activation (flash, `getValue()` unchanged), keyboard resize
  (Arrow/Home/End + persisted-width callback). All 10 tests in the file pass; full harness suite
  (428 tests) still green.
- **L3 real-VS-Code** (`test/vscode-e2e/outline-keyboard.spec.ts`, new file — no existing outline
  spec to fold into) — one `test()` covering the full walk: roving tabindex + ArrowDown/Up, the
  WAI-ARIA descend/collapse/ascend sequence, Enter → flash + `getValue()` unchanged (both after the
  traversal alone and after activation), and the resize separator's role + keyboard resize reflected
  in `--me-outline-width`. Per this session's flake lesson from 456 (a same-call-stack
  `document.activeElement` read after `.focus()` is stale in the real webview): every activeElement
  check here is a SEPARATE `evaluate()` from the action that moved focus, and real keys go through
  `workbox.keyboard.press` (outside the frame), not a synthetic same-stack dispatch. **Pass rate: 5/5
  green** (1 initial run + `--repeat-each=4`, zero flakes observed) — better than 456's measured 1/4,
  plausibly because of the same-stack-read avoidance above, though 5 runs isn't proof it can never
  flake.
  - Also found and fixed a REAL race independent of the flake pattern above: calling
    `outline.toggle()` immediately after `.vditor-ir` appears threw `Cannot read properties of
    undefined (reading 'element')` inside Vditor's own `Outline.render` in real VS Code (harness
    never reproduced it — `.vditor-ir` there only appears post-full-init). Fixed by polling for
    `vditor.preview.element` to exist first.
- **Coverage** (`npm --prefix media-src run test:e2e:coverage -- outline.spec.ts`): `outline-keyboard.ts`
  86.24% lines, `outline-resize.ts` 69.49%, `roving-tabindex.ts` 90.91% — all genuinely exercised by
  the new tests, not incidental. Uncovered lines are edge-cases (empty-items guards, the disposer
  path, `focusin`-driven `activeIndex` sync) not exercised by this test's specific walk.

## Gates run

`node build.mjs` clean · `npm test` 2475/2476 pass (the 1 failure, `asset-link-actions.test.ts`, is
pre-existing/another agent's in-flight work — confirmed via `git status`, not touched by this task)
· `./node_modules/.bin/tsc -p media-src/tsconfig.typecheck.json` clean · `./node_modules/.bin/tsc -p
tsconfig.json --noEmit` clean · `npm run lint:ci` clean, 0 warnings (whole tree, 654 files) ·
`test/vscode-e2e/outline-keyboard.spec.ts` 5/5 green (1 run + `--repeat-each=4`). `anchor-links.spec.ts`
(task 243's cross-doc anchor path, sharing `scrollToHeadingIndex`) — team-lead ran it against this
change, `--repeat-each=2 --retries=0`: **2/2 green** (see the sv-mode note above for why the branch
is a no-op for its `ir`/`wysiwyg` path). **All of the above were measured on the PRE-code-simplifier diff.** A code-simplifier pass was launched over this
diff; its gate list (biome, typecheck, the two unit test files, the chromium harness spec) is a
subset of the above and does not by itself re-confirm the real-VS-Code spec on the POST-simplify
build — `node build.mjs` + a fresh `outline-keyboard.spec.ts` run (ideally `--repeat-each=4` again)
is required after it lands and before this line can honestly say the shipped code was re-verified.
**This was not yet done when the paragraph was written.** Later integration evidence closes the gap:
the spec passed in the 2026-08-01 full real-VS-Code run (the only remaining failures were PlantUML
and task 456), then passed again as part of task 512's 2026-08-28 complete current-tree run. No
shipped product code changed after task 512's complete run.

## Left undone

- The `main.css` focus-ring rule (queued above, blocked on task 464).
- Keyboard REACHABILITY into the outline from the editor (see scope note up top) — not this task's
  scope; would be a future extension of 456/459's escape chain.
- `role="none"` on the `<li>` wrapper is only HALF the ARIA-tree-ownership fix: it stops the implicit
  `listitem` role interposing between `tree`/`group` and `treeitem`, but since `treeitem` lives on
  the `<span>` (not the `<li>`), a node's nested `<ul role="group">` is a DOM SIBLING of its
  treeitem, not a descendant it owns — the accessibility tree doesn't reflect parent→child ownership
  correctly without also adding `aria-owns` on the span. Screen-reader semantics are explicitly out
  of 458's scope (task 244 → 265), so left as a known limitation rather than restructuring the DOM
  for it now.
- Collapsing/expanding via ArrowLeft/Right dispatches a synthetic click on the vendor's own chevron
  (`toggleExpand`, reusing its mechanism rather than duplicating it) — `setupOutlineFlash`'s
  capture-phase listener also sees that bubbled click and flashes the corresponding heading. This
  matches what a MOUSE click on the chevron already does today (pre-existing, not a regression from
  this task), but it does mean every keyboard collapse/expand also flashes a heading, which a user
  might not expect from a pure navigation key. Noting it rather than "fixing" it silently, since it's
  consistent with the existing mouse behaviour and changing it would be a scope call, not a bug fix.
- `escape-toolbar.ts` still has its own inline roving-tabindex copy — `roving-tabindex.ts` is ready
  for it to adopt, deliberately not swapped in there by this task (see "What shipped" above: task
  456 was mid-diagnosis of a focus flake in that exact code at the time). Task 456 is now green, but
  the adoption remains a separate refactor rather than task 458 follow-up work.
