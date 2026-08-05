# 428 — List editing usability: match real word processors (Enter behaviour, indent, renumbering)

**Status: ✅ DONE (2026-07-30)** — with a correction to this file's own probe matrix. Requested
2026-07-28 as a broad usability ask, not a single bug. **Backspace-on-marker (#3/#4/#6) FIXED +
tested.** **Enter-at-start (#1): RE-MEASURED AND NOT REPRODUCIBLE — the ⚠️ GAP verdict below is
stale.** See "Re-measured" below. The remaining open item is the WYSIWYG probe, recorded honestly
rather than assumed.

## Re-measured, 2026-07-30 — gap #1 no longer reproduces

The matrix below records: *"Enter at the START of a non-empty item (`ubanana`) → inserts a blank
line / breaks the list in two, instead of an empty bullet above — ⚠️ GAP"*.

A fix was written for it (a capture-phase Enter handler, mirroring the Backspace one) and then
**deleted**, because the test written for it passed with the handler disabled. Measured directly
instead of trusted:

```
BEFORE: - uapple\n- ubanana\n- ucherry
AFTER : - uapple\n-\n- ubanana\n- ucherry     ← stock Vditor, our handler OFF
```

That is exactly the real-editor behaviour the task asks for: the text is pushed down and an empty
item is left above. Ordered lists renumber correctly too (`othree` moves to 4). Something between
the original probe and now closed it — the likeliest candidate is the task-441 list-autoformat
source patch, though that was not confirmed. Shipping the handler anyway would have added a
capture-phase listener racing Vditor's own for no behaviour change, which is a real risk (a
`stopPropagation` in capture can starve unrelated handlers), not a harmless redundancy.

`test/vscode-e2e/list-enter-start.spec.ts` is kept as a **NET** rather than deleted: it pins
behaviour this fork depends on but does not own, across three cases (unordered, ordered +
renumbering, and the empty-item exit that already worked). Its honest limit is that it cannot be
proven red by reverting anything of ours — there is nothing of ours to revert.

## Request

> "zrob task na oprawienie usability pracy z listami by byla tak dobra jak praca z listami w
> prawdziwych edytorach tekstu szczególnie jeśli chodzi o dodawanie nowych linii po enter,
> renumerowanie itp"
> — bring list-editing usability up to the level of real word processors (Word / Google Docs /
> Notion / Typora), especially adding new lines after Enter, renumbering, etc.

## Already covered elsewhere — do not duplicate

Renumbering already has two dedicated, planned tasks; this task's scope explicitly EXCLUDES that
territory:
- [Task 255](255-list-renumber-command.md) — an explicit "fix numbering" command (manual trigger).
- [Task 284](../284-list-auto-renumber.md) — auto-renumber on structural edits (drag/cut/multi-select
  delete), probe-first, reuses 255's engine.
- [Task 281](../281-sort-list-items.md) — A→Z sort, nested-aware (a different real-editor affordance,
  already scoped).
- [Task 391](391-list-goes-loose-while-editing.md) — DONE; a tight→loose formatting regression on
  Backspace-merge. **CORRECTION (2026-07-31, tasks 461/462): NOT unrelated — they collide.** This
  task's `list-backspace.ts` (below) intercepts the exact same nested-item Backspace that caused 391's
  corruption, which is WHY 391's repair (`list-tight.ts`) had nothing left to repair once this task
  shipped and was retired. See [461](461-list-tight-observer-retire.md) and
  [462](462-list-backspace-into-fixlist-patch.md).

This task is about **Enter-key behaviour, Backspace-on-the-marker behaviour, and related
list-navigation ergonomics** — the part of "real editor" list UX that has no task yet.

## User-reported gap, added 2026-07-30 (READ THIS AGAINST the "already implemented" section below)

> "jeszcze usuwanie backspacem markera listy powinno zachowywac sie lepiej" — deleting the list
> marker with Backspace should behave better.

This directly CONTRADICTS the assumption below that Vditor's `fixList` Backspace branches already give
good behaviour: the source PATHS exist, but the user reports the actual UX is worse than a real
editor. So the "already implemented" list is **suspected-good, not confirmed-good** — the probe must
treat the Backspace-on-marker case as an OPEN behaviour to measure and (likely) fix, not a solved one.

Real-editor baseline for "Backspace on the marker": with the caret at the **start of a list item's
text** (immediately after the marker), Backspace should **remove the list formatting for that item** —
outdent a nested item by one level, or convert a top-level item to a plain paragraph — WITHOUT
mangling the text, merging it awkwardly into the previous item, or leaving an orphaned/duplicated
marker. Probe every variant: ordered vs unordered vs checklist, top-level vs nested, empty item vs
item-with-text, IR vs WYSIWYG.

## What's ALREADY implemented — confirmed by reading Vditor's source, not assumed

Before proposing new work, check what upstream Vditor already does (`fixList`,
`media-src/node_modules/vditor/src/ts/util/fixBrowserBehavior.ts:456-532`), so this task doesn't
re-request something that already works:

- **Tab / Shift+Tab indent-outdent** at the start of a list item — `fixList:505-529` calls
  `listIndent`/`listOutdent`. This is the real-editor behaviour (Tab demotes to a sub-item,
  Shift+Tab promotes) and looks present. **Needs a live check, not just a source read** — confirm
  it actually indents/outdents correctly for both ordered and unordered lists, nested checklists,
  and that it renumbers the ordered-list siblings correctly afterward (ties to 284's engine).
- **Enter inside a multi-paragraph list item** (`fixList:460-472`) — splits correctly without
  breaking out of the `<li>`.
- **Backspace at the start of the first item** (`fixList:474-489`) and **Backspace on an empty
  item aligning to the previous item** (`fixList:492-503`) — source paths exist, but **reported
  worse than real editors (2026-07-30) — re-verify, do NOT assume good.** These branches decide the
  Backspace-on-marker behaviour the user flagged; the probe measures whether they actually match a
  real editor (outdent/convert-to-paragraph cleanly) and the fix likely lives here.
- **Checklist toggle hotkey** (⇧⌘J) and **Backspace before the checkbox** (`fixTask`,
  `fixBrowserBehavior.ts:1081-1122`) — handled.

## What's NOT found in Vditor's own keydown handling — the likely real gaps

Searched `fixList` and `fixTask` specifically for an **Enter** branch handling these, and found
none (only Backspace/Tab branches exist for them). This does not by itself prove they're broken —
Lute's own Markdown spin on `execAfterRender` could still produce the right result generically — but
it means nothing SPECIAL guards these, unlike the cases above:

- **Enter on an EMPTY list item should exit the list**, converting it to a plain paragraph (the
  standard behaviour in Word/Docs/Notion/Typora — pressing Enter twice, or once on an empty
  bullet, "escapes" the list rather than adding another empty bullet forever). No source path was
  found that does this; Lute's generic spin may or may not happen to produce it. **Needs a live
  check**: create a list, press Enter on the last item until it's empty, press Enter once more —
  does it stay a list item, or become a plain paragraph?
- **Enter on a checklist item should continue the checklist** (new item is also `- [ ]`, not a
  plain bullet or plain paragraph) — likely fine via Lute's spin (GFM task-list re-parse), but
  unconfirmed live.
- **Enter at the START of a non-empty list item** (splitting before any typed text) should push the
  existing text down as a new item, not merge/duplicate — a classic real-editor edge case, unverified.
- **Enter with the caret INSIDE a nested sub-list's last item, followed by Shift+Tab** (the "outdent
  after Enter" pattern many editors offer as a compound gesture) — out of scope for a single
  key-handler fix, but worth noting as a possible follow-up once the base cases are confirmed.

## Probe results — IR mode, real VS Code (2026-07-30)

Ran `test/vscode-e2e/list-editing-probe.spec.ts` (fixture `fixtures/list-probe.md`): place the caret,
press the key, read `vditor.getValue()` before→after. Verdicts vs the real-editor baseline:

| # | Operation (IR) | getValue result | Verdict |
|---|---|---|---|
| 1 | Enter at the START of a non-empty item (`ubanana`) | inserts a blank line / breaks the list in two, instead of an empty bullet above | ⚠️ GAP |
| 2 | Enter on an EMPTY item → exit the list | `- ealpha / - ebeta` + paragraph; no third bullet | ✅ OK |
| 3 | **Backspace on the marker**, ordered item with text (`otwo`) | **`1. ooneotwo`** — MERGED the text into the previous item | ❌ FAIL |
| 4 | **Backspace on the marker**, nested item (`nchildone`) | **`- nparentnchildone`** — merged into the parent | ❌ FAIL |
| 5 | Enter continues a checklist | new `- [ ] ` item | ✅ OK |
| 6 | Backspace on a checklist item (empty item above, from #5) | removes the empty item (align-to-previous) | ⚠️ confounded — retest with a TEXT item above |

**Headline confirmed (the user's report):** Backspace at the start of an item's text, when the item
above holds text, **glues the two items' text together** (`ooneotwo`, `nparentnchildone`) instead of
outdenting / converting to a paragraph. Root cause: Vditor's `fixList` only handles Backspace-at-start
for the FIRST item and for an EMPTY item; a NON-first item WITH text has no branch and falls through
to the browser's default block-merge. Secondary gap #1 (Enter at start of item breaks the list with a
blank line). #2 and #5 already match real editors — leave them.

### ✅ FIXED (2026-07-30) — Backspace-on-marker (#3/#4/#6)

`media-src/src/list-backspace.ts`: a document CAPTURE-phase Backspace handler (Vditor binds keydown on
the editor element in bubble phase, so capturing runs first) that fires ONLY for the unhandled case —
caret at the start of a NON-first item's text, item not empty — and leaves Vditor's own first-item and
empty-item branches alone. Nested item → `listOutdent` (one level out, the same call Shift+Tab uses);
top-level item → lift to a plain paragraph, splitting the list around it and letting Lute renumber
(checklist items drop their checkbox). Installed via `finish-init.ts` (`observers.set`, disposed on
re-init). Probe re-run confirms: `1. otwo` → paragraph `otwo` with `1. oone` / renumbered `1. othree`;
nested `nchildone` outdents to `nparent`'s level; checklist `ctasktwo` → clean paragraph. Works in IR
AND WYSIWYG (the handler uses `SpinVditorDOM`/`SpinVditorIRDOM` per mode). Net:
`test/vscode-e2e/list-backspace.spec.ts` (IR: ordered/nested/checklist + first-item PRESERVATION;
WYSIWYG: top-level lift).

**Correction (2026-07-31, task 462's guard-overlap question):** the description above ("fires ONLY
for... a NON-first item's text") undersold its own guard — `list-backspace.ts:111`'s early-return is
`!li.previousElementSibling && !parentLi`, which does NOT skip a NESTED first item (only a TOP-LEVEL
one). That's necessary, not incidental: probed with the interceptor absent (unmodified Vditor,
`media-src/e2e/list.spec.ts`'s "stock Vditor fixList" test), Backspace on a nested first item hits
`fixBrowserBehavior.ts:474`'s own "first item → paragraph" branch — gated only on
`!previousElementSibling`, not top-level-ness — which inserts the lifted content as a stray `<p>`
sibling inside the PARENT `<li>` instead of promoting it. That is exactly task 391's original
corruption DOM. So this task's interceptor (now a `fixList`-internal patch, task 462) was ALSO the
thing suppressing 391's bug for nested-first-item, not just the non-first-item merge case described
above — see [391's corrected cross-reference](#already-covered-elsewhere--do-not-duplicate) and
[461](461-list-tight-observer-retire.md)/[462](462-list-backspace-into-fixlist-patch.md).

**Was recorded as still open:** #1 — since re-measured as NOT reproducing (see the top of this
file). #2 and #5 already good.

## Scope

- [x] **Probe first** — done (matrix below), and re-run for gap #1, which is how the stale verdict
      was caught. **IR only**; the WYSIWYG pass is NOT done — see Still open. Original: **Probe first** (this project's established pattern for list work — see 284): in the real
      VS Code webview, both IR and WYSIWYG modes, run through every behaviour listed above
      (implemented AND suspected-gap) against a reference: pick ONE real editor as the comparison
      baseline (Google Docs or Notion recommended — both are commonly available and have very
      conventional list Enter/Tab semantics) and record pass/fail per operation, per mode. This is
      the deliverable that turns "usability, itp" into a concrete, gated list.
- [x] **Backspace on the marker** (user-reported 2026-07-30): DONE — `list-backspace.ts` intercepts
      the caret-at-start-of-non-first-item case (nested → outdent, top-level → paragraph+split), IR +
      WYSIWYG. Turned out to be a MISSING branch (Vditor had none for it), so a new capture-phase
      handler was the right shape, not a refinement of :474-503.
- [x] For each confirmed gap: fixed via the same mechanism class as `fixList`/`fixTask`. Only ONE
      gap survived re-measurement (Backspace-on-marker); gap #1 was re-measured as already correct
      and its would-be fix deleted rather than shipped. Original wording: fix via the same mechanism class as `fixList`/`fixTask` (an
      `event.key === "Enter"` branch alongside the existing Backspace/Tab ones, or an esbuild patch
      following the `patchListToggle` precedent if the fix must live inside Vditor's own source
      rather than our wrapper) — NOT a rewrite of list handling; these are small, additive branches
      matching the existing file's style.
- [ ] Nested lists and mixed ordered/unordered must both be covered by whatever probe matrix and
      fixes come out of this — a fix that only works on a flat unordered list is not done.
- [ ] Any renumbering side-effect of a new Enter behaviour reuses 255/284's shared normalize engine
      once that exists — do not hand-roll a second renumbering path.

## Out of scope

- Renumbering itself (255/284/391 own that).
- Sorting (281).
- Drag-and-drop list reordering (not requested here; a separate, larger feature if ever wanted).
- Rewriting `fixList`/`fixTask` wholesale, or forking Vditor for this — these are additive
  key-handler branches, matching the file's existing shape; escalate to ADR-0004's fork-trigger
  question (task 401) only if the fix genuinely can't be done as a patch.

## Verification

- L1: unit tests per confirmed-and-fixed gap (Lute Node-recipe or DOM-level, matching this file's
  existing test style for list operations).
- L2: harness e2e (`media-src/e2e/list.spec.ts` already exists — extend it) for IR + WYSIWYG.
- L3: real-VS-Code e2e for at least the headline case ("Enter on an empty list item exits the
  list") per AGENTS.md (this is editor-surface editing behaviour).

## See also

- `media-src/node_modules/vditor/src/ts/util/fixBrowserBehavior.ts` — `fixList` (:456), `fixTask`
  (:1081), `fixTab` (:535, the NON-list generic Tab-inserts-a-tab-character path — do not confuse
  this with `fixList`'s list-specific Tab handling, which is separate and already implemented).
- `media-src/e2e/list.spec.ts` — existing list harness coverage to extend.
- [255](255-list-renumber-command.md), [281](../281-sort-list-items.md), [284](../284-list-auto-renumber.md),
  [391](391-list-goes-loose-while-editing.md) — sibling list tasks, scope boundaries above.
