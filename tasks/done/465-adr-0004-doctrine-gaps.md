# Task 465 — Close the ADR-0004 doctrine gaps that let patch-vs-runtime drift

**Status:** ✅ DONE (2026-07-31) — ADR-0004 amended with the four-mechanism decision funnel;
ADR-0003 and ADR-0005 cross-amended; `code-source.ts`'s header corrected (Gap 2).
**Impact:** 🟢 documentation, but it is the *cause* of tasks 461-464 ·
**Origin:** patch-vs-runtime audit 2026-07-30 (confirmed by an independent Fable review).
**Related:** ADR-0004, ADR-0005, tasks [461](461-list-tight-observer-retire.md),
[462](462-list-backspace-into-fixlist-patch.md), [463](463-undo-keybind-patch-experiment.md),
[464](464-main-css-specificity-overrides-audit.md).

## What shipped (2026-07-31)

- `docs/adr/0004-patching-vditor.md` — new "Amendment 2026-07-31" section: mechanisms 3 (seam patch +
  runtime implementation) and 4 (runtime observer / capture-phase interceptor, split a/b), the
  two-gate decision funnel (JS call site exists? / must reach outside Vditor's bound element?) placed
  BEFORE the correctness table, the retirement rule generalized from 461, the drift-detection
  asymmetry (seam patches are only half-guarded), and the CSS "every source" rule.
- `docs/adr/0003-css-theming-architecture.md` — short "Amendment 2026-07-31" cross-referencing
  ADR-0004 for the content-theme "every source" lesson (keeps the detail in one place).
- `docs/adr/0005-architecture-overview.md` — Patterns bullet split from 3 mechanisms into 4, `Related`
  line updated.
- `media-src/src/code-source.ts` — header corrected to the real reason (Lute WASM templating, no JS
  call site), not "highlight.js themes are swappable" (Gap 2's second checklist item).

## Contradictions found between the four source tasks — reported, not smoothed over

1. **461 and 462 disagree on whether the paired real-VS-Code run is required, and 462's own text is
   stale.** 461's header declares itself DONE/retired, arguing the "observer still wired" baseline leg
   is uninformative and the green-with-the-module-gone run is the one that discriminates (sound
   reasoning — matches this ADR's own retirement rule, written from 461). 462's Status line and its
   final "Steps" item still describe the paired run as a blocking gate before *either* task can be
   marked DONE, and its final checkbox is unticked. 461 is the one applying the correct methodology;
   462's text needs the same update 461 already got, but that's 462's file to fix, not this task's —
   left as found, flagged here so it doesn't get missed.
2. **464 is not fully landed** — its own Status line says 🟡 IN PROGRESS, with `test:visual` and
   `test:vscode:fast` unchecked and explicitly owned by team-lead. The doctrine drawn from it (the
   two conversions + the content-theme lesson) is sound regardless — both are backed by a measured
   red-then-green — but "all four have now landed" (this task's own briefing) overstates 464's actual
   status; the *evidence* used here is solid, the *task* isn't closed.
3. **463 overturned its own module's stated justification, and with it Gap 4's original framing.**
   `undo-keybind.ts`'s old header claimed it was racing VS Code's bubble-phase forwarding listener — a
   claim that doesn't match standard event ordering and was never verifiable from this repo. The
   experiment measured a different, verifiable reason (Gate 2: reach outside the element Vditor binds
   its own handler to) and the module's header was rewritten to that measured reason. This task's own
   Gap 4 anticipated the second capture-phase competitor as "VS Code's host forwarding (mechanism
   unverified — do not assert it until 463 has run)" — now that 463 has run, that framing is
   superseded, not confirmed: doctrine states reach, not a forwarding race (see ADR-0004's
   "Correction" subsection).

## Why this exists

ADR-0004 documents **two** patch mechanisms (esbuild TS source patch; `build.mjs` CSS source patch).
ADR-0005 mentions a third in passing (runtime MutationObserver decorators on `#app`). Nothing
documents **when runtime is the correct choice**, and nothing documents the mechanism that is in fact
the dominant one.

Without a written rule the default path becomes runtime — it is faster to write — which is how two
independent workarounds (`list-backspace.ts` + `list-tight.ts`) ended up compensating for one
function in a file we already patch four times over.

## Gap 1 — the seam mechanism is undocumented, and it is the dominant pattern

**Measured: 20 `window.__vmarkd*` hooks are injected by patches in `media-src/esbuild-shared.mjs`.**
A patch inserts a *seam* at the point where Vditor makes a decision; the implementation lives in a
normal, testable webview module; the patch falls back to stock behaviour when the hook is absent.

```
__vmarkdDeferIrDiagramRender  __vmarkdDeferRenderToc      __vmarkdEchartsResolve
__vmarkdExpandToLine          __vmarkdExplicitEdit        __vmarkdFlowchartAfterDraw
__vmarkdFlowchartOpts         __vmarkdMindmapStyle        __vmarkdMm
__vmarkdMorphPreview          __vmarkdPasteTransform      __vmarkdPasteUrlEnabled
__vmarkdPasteUrlMd            __vmarkdPatchLute           __vmarkdRequestCaret
__vmarkdSelectedUrl           __vmarkdShouldOpenLink      __vmarkdStripPreviewForSpin
__vmarkdTakeCutIntent         __vmarkdTrySkipFenceSpin
```

It spans perf (tasks 161/171/172/175), theming (89/90), caret (445/446), paste, and links.

- [x] Document it in ADR-0004 **by name**, as mechanism 3, not a footnote. — done, ADR-0004
      amendment. (Re-grepped the hook list while writing this: `__vmarkdListBackspaceOutdent`, task
      462, is a new one since this count was taken — the count is stated as "20+, growing" rather than
      re-quoted as an exact frozen number.)
- [x] State the consequence explicitly: **"runtime module" vs "patch" is a false dichotomy.** The
      question is not *where does the code live* but *does Vditor need to be told where to call it*.
      A patch is often one anchor, not a rewrite. — done, same amendment, mechanism-3 paragraph.

## Gap 2 — no test for "is this even patchable?"

The sharper discriminator (better than "is the file already patched"):

> **Is the surface generated by Lute's WASM HTML-string templating (`SpinVditorIRDOM` et al. — there
> is no JS call site to attach to), or by Vditor's own TS DOM-construction code (patchable)?**

This is the *real* reason `code-source.ts` must stay a runtime observer: the IR marker DOM is
regenerated by a Go-compiled template on every keystroke, so no patch could attach — not (as its
header currently implies) merely because highlight.js themes are swappable.

- [x] Add the test to ADR-0004. — done, as "Gate 1" of the decision funnel (placed before, not beside,
      the correctness table — this is a structural gate, not a table row).
- [x] Correct `code-source.ts`'s header to give the real reason. — done.

## Gap 3 — CSS: custom-property redefinition is a distinct patch shape

ADR-0004 documents the literal-rewrite shape (`varifyVditorPalette`, `patchVditorIndexCss`). A third
shape exists: **redefining a Vditor CSS custom property**.

- [x] Document it — **with the trap task 464 measured**: redefining a var hits *every* consumer of
      that var, so it is usually **broader** than the specificity override it replaces. Check the
      consumer list before reaching for it. (`--ir-bracket-color` has three.) — done, ADR-0004's CSS
      subsection.
- [x] Note that the routing rule applies to specificity-based overrides too, not just `!important` —
      the gap that made task 464 necessary. — done, same subsection; also added the "every source"
      rule task 464's own regression surfaced, which this gap didn't originally ask for but the
      evidence demanded (ADR-0004 + ADR-0003 amendments).

## Gap 4 — name the capture-phase technique as deliberate architecture

Measured — five modules use `stopImmediatePropagation`: `callout-nav.ts`, `hr-nav.ts`,
`gap-paragraph.ts`, `diagram-zoom-gate.ts`, `undo-keybind.ts`. (A wider set — `caret.ts`,
`edit-activity.ts`, `list-backspace.ts`, `preview-scroll-preserve.ts` — uses capture-phase listeners
*without* it; that is a different, weaker technique and the doctrine should say so.) It reads as
ad-hoc duplication; it is a deliberate technique — but for **two different competitors**, which the
doctrine must distinguish:

- beating **Vditor's own** bubble-phase handler on the editor element;
- ~~beating **VS Code's host forwarding**~~ — **463 has now run, and it measured a different
  competitor than this gap anticipated: not a race against VS Code's forwarding, but *reach* — acting
  outside the element Vditor binds its own handler to at all. See the "Correction" subsection in
  ADR-0004's amendment; that supersedes this bullet rather than confirming it.**

- [x] Document both, and mark the second as unverified until 463 lands. — done, but the second turned
      out to need correcting rather than confirming; see the "Correction" subsection and the
      contradictions list above.

## Gap 5 — write the rule that was missing

- [x] Add an explicit decision table to ADR-0004. — done, but not as a flat table: task 463 proved a
      flat table with "Vditor's condition is wrong → patch" as a peer row reproduces the exact mistake
      the audit exists to prevent (the patch was correct AND insufficient — reach, not correctness,
      decided it). Shipped as a two-gate funnel (JS call site? / must reach outside Vditor's bound
      element?) that runs BEFORE the table, with the table demoted to "gates already cleared." Gap 5's
      literal table above is preserved inside ADR-0004 as the post-gate table, with "surface comes from
      Lute's WASM templating" promoted out of the table into Gate 1 (it's a gate, not a peer situation).

## Worked examples to cite (once the sibling tasks land)

- [x] `hr-nav.ts` vs `patchCalloutArrowNav` — the pair that shows the rule is *already* applied
      correctly: the patch fixes Vditor's own editable-text check and splice set; the runtime module
      handles caret geometry Vditor knows nothing about. **Complementary, not duplicated.** — cited,
      ADR-0004 worked-examples list.
- [x] Whatever task 463 measures about undo. — cited (Gate 2's worked example, plus the "Correction"
      subsection for what it overturned).

## Verification

- [x] ADR-0004 updated. ADR-0003 and ADR-0005 cross-amended where the routing rule / observer
      mechanism belonged (per team-lead's brief).
- [ ] Mirrored into the codebase-memory knowledge graph (`manage_adr`), as ADR-0005 already is — **NOT
      done.** Attempted: `list_projects` on the `codebase-memory-mcp` server has no entry for this
      repo's actual root (`/home/piochu/projects/vscode-markdown-editor-extanded-settings`); the only
      match under this repo's name is a stale worktree slug
      (`...-.worktrees-task-412-viewport-gating`, task 412, a different checkout at a different path).
      Writing the ADR-0004 amendment into that stale worktree's graph would mirror it to the wrong
      tree, not fix the gap — left undone rather than done wrong. Whoever indexed ADR-0005 originally
      either used a project name this session doesn't have visibility into, or indexed a path this
      session's `codebase-memory-mcp` instance doesn't see. Flagging for team-lead: either point me at
      the right project name/index, or this needs `index_repository` run against the actual root first.
- [x] `npm run lint:ci` — run at the end of this task (documentation-only change; no e2e, no full
      suite, per team-lead's constraints).

A doctrine that isn't loaded into sessions is a doctrine that drifts again.
