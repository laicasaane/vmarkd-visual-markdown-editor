# Task: Dirty dot persists after undo-to-start (VS Code version-based) — undo coupling

> **Status:** 🅿️ PARKED (2026-06-30) — analysis + a decisive spike done, no implementation.
> The CONTENT half of the original "dirty after undo" complaint is **already fixed** in
> task 61 v2 (Layer 1: clean baseline + semantic no-op → undo-to-start restores disk bytes
> exactly → git diff clean). What remains is the **tab dirty DOT**: VS Code's `isDirty` is
> **version-based**, not content-based, so the dot stays lit even though the content equals
> disk. Clearing it needs coupling VS Code's undo with Vditor's undo. This task captures
> everything we know so it can resume cold.
> **Value / Risk:** 🟢 medium product value (misleading "unsaved" indicator) / 🔴 high (touches
> the editor's core sync + Vditor's undo engine — see the Vditor-risk section).
> **See also:** `tasks/61-minimal-diff-writeback.md` (Layer 1, the clean-diff fix).

## The complaint & the two-layer split

User: undoing all edits back to the just-opened state still shows the file as **edited** (the
dirty dot on the tab). The probe (`test/vscode-e2e/undo-dirty-probe.spec.ts`) decomposed it into
two **independent** layers:

| layer | what | before Layer-1 fix | after Layer-1 fix |
|---|---|---|---|
| **L1 — content** | do the bytes return to disk after undo? (`textMatchesDisk`) | ❌ false | ✅ **true** (fixed) |
| **L2 — dirty dot** | does the tab go clean? (`isDirty`) | true | **true (still)** |

**Layer 1 (FIXED, task 61 v2):** the write-back minimized against the current (already-reflowed)
document, so the reflow never unwound → bytes never returned to disk. Fixed by minimizing against
a **clean baseline** + a whole-doc **semantic no-op short-circuit** (`isSemanticNoop`,
`src/minimal-diff-writeback.ts`): when the editor's output canonicalizes to the same markdown as
the baseline, restore the baseline bytes verbatim. Works even for loose lists (the IR round-trip
collapses them loose→tight, but BOTH sides collapse identically → still detected). Verified:
`textMatchesDisk` flipped false→true.

**Layer 2 (THIS TASK):** even with content == disk, the tab stays dirty. **Proven** (`textMatchesDisk=true`
+ `finalDirty=true`) that VS Code's `TextDocument.isDirty` is **version/undo-stack-position based**,
not content-based. It is dirty iff the model's current "alternative version id" ≠ the saved version
id. Each `applyEdit` bumps the version forward; only walking VS Code's OWN undo stack back to the
saved position clears it. We never do that, because we **deliberately route Ctrl+Z to Vditor's own
undo engine** (`media-src/src/undo-keybind.ts`, capture-phase) — VS Code's document undo would force
a full `setValue` re-render → editor jump/scroll-reset. So VS Code's stack only grows → the dot
never clears.

## Root cause: two decoupled undo stacks

1. **Vditor's stack** (webview): diff-based DOM undo. Ctrl+Z is captured in the capture phase and
   calls `vditor.undo.undo()` → reverts the DOM **in place, no jump**. This is the visible undo.
2. **VS Code's stack** (host): every webview edit → `syncToEditor` → `applyEdit(WorkspaceEdit)` =
   one forward edit on the `TextDocument` undo history. **Never popped.**

The dot reflects stack #2's position, which never returns to "saved". To clear it natively, stack #2
must traverse back — which today we prevent (jump). Hence: we must **couple** the two stacks.

## Architectural options for coupling VS Code undo ↔ Vditor undo

| # | topology | clears dot | jump? | touches Vditor undo | cost |
|---|---|---|---|---|---|
| 1 | **VS Code = truth, Vditor = view** (the "redesign"): undo→VS Code, content→Vditor. Sub-variants: (a) full `setValue` (jumps), (b) **incremental delta patch** + caret restore (no jump, reuses source-map) | ✅ natively | (b) no | disables it | large (b = hard caret-safe sync) |
| 2 | **Lockstep dual-drive**: Vditor still does the visible in-place undo; on Ctrl+Z the host ALSO `executeCommand('undo')` so VS Code's stack pops; the echoed content change is SUPPRESSED (Vditor already updated). Needs 1:1 edit↔undo-step alignment + echo-dedup | ✅ | no (if dedup holds) | **keeps it** | medium — see spike |
| 3 | **`CustomEditorProvider` + own `CustomDocument`**: you own a content-based dirty model; drive Vditor from your edit objects; VS Code calls your undo/redo | ✅ (your model) | no | disables it | very large (host rewrite; loses TextDocument integration: reveal-in-source, SCM gutter, edit-in-VS-Code, plain-text coexistence) |
| 5 | **No coupling — reconcile dirty at the boundary**: when content == disk, clear the dot via `revert` (no mtime, resets redo) or identical-byte `save()` (mtime bump). Sidesteps undo entirely | ✅ (other channel) | no | **no** | small |

**Dead ends (no API — don't re-propose):**
- *Move VS Code's stack pointer back without changing the doc* — only `undo` does it, and it changes the doc.
- *Force an undo-stop per `applyEdit` to guarantee 1:1* — `WorkspaceEdit` has no undo-stop control (only `TextEditor.edit`, which a custom editor lacks). **But see spike — coalescing turned out not to be a problem anyway.**
- *Step-wise `undo` until `!isDirty` to quietly clear* — intermediate states have DIFFERENT content → re-render → jump N times. (`revert` jumps straight to saved in one move → why #5 prefers it.)
- *Override/hide the dirty badge cosmetically* — no public API.
- *Hold the source of truth in the webview, only apply on save* — document never goes dirty / Ctrl+S has nothing to save → collapses into #3.

## Vditor-internal risks of the redesign (#1 / #3 — disabling Vditor's undo + pushing content in)

Vditor is **designed to own its undo** (it only binds Ctrl+Z when its toolbar undo button is absent).
Fighting that has a real blast radius INSIDE the editor:

1. **Caret loss / wrong placement** — Vditor restores the caret via a `<wbr>` marker across its spin;
   host-driven content bypasses it. After a re-parse the IR DOM changes (markers, `data-render=2`
   preview halves, dual-node code blocks) → naive text-offset→DOM mapping lands the caret in a
   preview/void node or loses it (same class as the EOF-caret / code-block-nav / callout-eject bugs).
2. **`setValue` tears down all injected DOM + observers on every undo step** — callouts, code-source,
   smiles, code-highlight spans, gap-paragraph, hr-nav, echarts-fit, **diagram renders** (mermaid/d2/
   echarts re-layout — brings back the stutter we fixed in 172/175), the task-161 stale overlay.
   Flashes, scroll reset, expensive re-render per step.
3. **Two-stack desync → data-loss class** — Vditor keeps recording history internally; any leak to its
   undo (toolbar button, context menu, IME, a missed keybind) reverts against a stale stack → DOM↔doc
   divergence.
4. **IME / composition corruption** — pushing content mid-composition breaks the input buffer.
5. **Race with the spin + typing-path optimization** — 161/172/175 assume input flows webview→host;
   injecting host→webview content on undo can collide with `deferUntilSettle`/`isTyping` gates or
   overwrite the live source text node mid-edit.
6. **Granularity feels wrong** — Vditor coalesces undo by `undoDelay` quiet windows; one VS Code undo
   = one `WorkspaceEdit`, so a Ctrl+Z may revert a whole burst or a single char depending on grouping.
7. **Visible reflow on undo** — undo goes text→re-parse→Vditor, so round-trip drift (loose→tight, table
   padding) can VISIBLY change formatting; in-place Vditor undo avoids this.
8. **Bigger esbuild patch surface** — cleanly disabling Vditor's undo likely needs another anchor-asserted
   `VDITOR_TS_PATCHES` entry (fragile across Vditor bumps).

## Spike findings (2026-06-30) — option #2 is NOT dead

`test/vscode-e2e/lockstep-undo-spike.spec.ts` applied 3 separate `applyEdit`s to the open custom
editor, then drove `executeCommand('undo')` from the host. Measured the three unknowns:

| Q | result | verdict |
|---|---|---|
| **Q1 targeting** — does host `executeCommand('undo')` revert OUR custom-editor doc? | `changedOurDoc: true` | ✅ YES |
| **Q2 coalescing** — does 1 undo revert 1 `applyEdit`? | after 1 undo: `A:true B:true C:false` | ✅ **1:1, NO coalescing** |
| **Q3 count** — undos to `!isDirty` vs 3 edits? | `totalUndoSteps:3, dirty:false, backToInitial:true` | ✅ exactly 3, clean, exact bytes |

Also: `version` went 1→4 over 3 edits (one bump each, **no echo edits from the webview**), then
undo bumps version 4→5→6→7 but **dirty clears at the saved stack position** and content returns to
the initial bytes exactly.

**This reverses the earlier pessimism.** The two things feared to kill #2 are false: VS Code does
**NOT** coalesce separate `applyEdit`s into one undo stop (each is its own step, 1:1), and host
`executeCommand('undo')` **does** target our custom editor and **does** clear the dot at the saved
position. The lockstep FOUNDATION works.

## The one remaining unknown for #2 (the decisive next spike)

The spike applied edits **directly**, bypassing our `syncToEditor`/`minimizeWriteback` pipeline. The
residual risk is **content alignment in the real flow**:

1. **Pipeline alignment** — does every Vditor undo-step have **exactly one** corresponding `applyEdit`?
   Our Layer-1 no-op short-circuit sometimes SKIPS an `applyEdit` → Vditor stack has a step VS Code
   doesn't → divergence.
2. **Echo dedup → no jump** — after host `undo`, `onDidChangeTextDocument` pushes content to the
   webview; if that content **==** Vditor's post-in-place-undo state, `postUpdate` **dedups it →
   no re-render → no jump**. But **reflow drift** (loose→tight) could make VS Code's undo-step content
   ≠ Vditor's state → dedup misses → jump + desync.

**Decisive next spike:** drive a REAL edit through the webview (Ctrl+Z routed to Vditor as today),
then host `executeCommand('undo')`, and measure whether VS Code's undo-step content **==** Vditor's
in-place-undo content (i.e. whether `postUpdate` dedups → no jump) and whether they stay 1:1. If yes,
#2 is safe to implement; if reflow drift breaks the dedup, fall back to #1b or #5.

## Recommendation

- **Cheapest dot fix, zero Vditor risk:** option **#5** (reconcile when content == disk). Start by
  verifying `revert` is jump-free for our custom editor (it likely is — `postUpdate` dedups identical
  content); if `revert` re-inits the webview, fall back to identical-byte `save()`.
- **Cleanest "real" coupling:** option **#2 (lockstep)** — now a viable contender (keeps Vditor as the
  visible undo owner, no caret-safe sync, dot clears natively) **pending the alignment/dedup spike**.
- **#1b** only if #2's dedup fails; **#3** almost never (host rewrite); **accept the dot** is a valid
  hold given Layer 1 already delivers clean diffs (content == disk).

## Artifacts in the tree

- `test/vscode-e2e/undo-dirty-probe.spec.ts` — regression: asserts Layer 1 fixed (`textMatchesDisk`
  true) + records Layer 2 as the known state (`finalDirty` true). Flip the L2 assertion when fixed.
- `test/vscode-e2e/lockstep-undo-spike.spec.ts` — the #2 feasibility spike (Q1/Q2/Q3 above). Keep as
  the documented basis; extend it for the alignment/dedup spike.
- `media-src/src/undo-keybind.ts` — the capture-phase Ctrl+Z→Vditor routing that is the proximate
  cause of L2 (and exists to avoid the re-render jump).
- `src/extension.ts` — `syncToEditor` (the `applyEdit` write path), `onDidChangeTextDocument` (echo
  reconciliation via `pendingWebviewContent` / `applyingWebviewEdit`), `postUpdate` (the identical-
  content dedup that a no-jump reconcile/echo relies on).
