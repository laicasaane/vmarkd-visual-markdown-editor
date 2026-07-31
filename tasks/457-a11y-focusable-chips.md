# Task 457 — Focusable wiki chips (Enter/Space activation)

**Status:** 🟡 **RE-SCOPED (2026-07-31), design decided, implementation pending.** The Tab-based
approach was measured dead — 40 consecutive Tab presses in real VS Code never focus a chip, because
`tab: '\t'` makes Vditor `preventDefault()` every Tab in the editable surface, and
[456](456-a11y-escape-the-editor.md)'s escape gesture targets the toolbar, not in-document tabbables,
so it would not have unblocked this either. Replaced by **caret-targeted activation on
`Ctrl/Cmd+Enter`** — see "DECIDED" below. · **Impact:** 🟡 medium ·
**Origin:** split out of [244](244-keyboard-accessibility.md), 2026-07-30.

## Problem (re-verified 2026-07-30)

Wiki chips are `<span>`s and **ZERO `tabindex` is set anywhere in our source** — the only occurrence
in the tree is a SELECTOR reading them (`focus-restore.ts`). So `.wiki-link-chip:focus-visible`
(`main.css:1164`) is dead CSS: nothing can ever be focused to trigger it. The styling for this
feature already ships; only the focusability is missing.

## ⚠️ MEASURED 2026-07-31 — this task is BLOCKED on task 456, and the blocker is structural

`tabindex="0"` is shipped (`wiki-chip-a11y.ts`) and the chips are focusable. **Tab still never
reaches them**, and no amount of work inside this task can change that.

Measured in real VS Code (`test/vscode-e2e/wiki-chip-focus.spec.ts`, run by the team lead): caret
placed in the editor, then **40 consecutive Tab presses — the chip never becomes
`document.activeElement`**. The reason is the keyboard trap [task 456](456-a11y-escape-the-editor.md)
exists to fix: `tab: '\t'` is set (`vditor-init.ts`), so Vditor's `fixTab` calls `preventDefault()`
on **every** Tab inside the editable surface and inserts a tab character instead. Focus cannot leave
the editing host by Tab, so it can never land on an inline chip inside it.

Two consequences, and the second is the one that matters:

1. This spec cannot pass until 456 ships. It is not flaky and not a harness artifact.
2. **456's own design does not actually unblock this.** 456's gesture is Escape-then-Tab, and it moves
   focus to the **toolbar** — a sibling widget outside the editable surface. It does not make Tab walk
   the tabbable elements *inside* the document. So even with 456 landed, a Tab from the caret still
   will not reach an inline wiki chip.

## DECIDED 2026-07-31 (user) — caret-targeted activation via `Ctrl/Cmd+Enter`

**The reasoning matters as much as the choice, so it is recorded here rather than summarised.**

**In an editor, the caret IS the focus.** A contenteditable surface is one widget; you navigate
*within* it with the caret, not with Tab. No real editor makes inline links Tab stops — not VS Code,
not Word, not Google Docs — because tabbing through prose to reach the fifth link in a paragraph is
worse than not reaching it. `tab: '\t'` is therefore *correct* and in line with every peer; it is not
the thing to work around.

Our nearest neighbours agree on the mechanism:

| editor | gesture |
|---|---|
| Obsidian | "Follow link under cursor" = **Ctrl/Cmd+Enter** |
| Typora | Ctrl+Click, or caret in link + Ctrl+Enter |
| Google Docs | caret in link + Alt+Enter |

**Decisions:**

1. **Chord: `Ctrl+Enter` / `Cmd+Enter`.** Verified free across the whole repo — no collision.
   Bare `Enter` was considered and **rejected**: it inserts a newline, so activating on it would break
   the single most basic editing operation. An earlier draft of this file listed that as an option;
   it was wrong.
2. **Scope: everything link-like under the caret** — wiki chips, plain `[text](url)`, local file
   links, `#fragment` anchors. One mechanism, one activation path. Plain links have exactly the same
   keyboard gap, and it is the *more common* case, so fixing only chips would leave the bigger half of
   the same WCAG failure open. Task [229](229-clickable-code-references.md)'s code references get this
   for free once it exists.
3. **Remove the shipped `tabindex="0"`** from chips. It is harmless today only because Tab never
   reaches them; if Tab is ever freed it becomes mid-paragraph Tab stops, which is actively worse.
   Replace the focus ring with a **caret-inside decoration**, driven from the live selection via
   `selectionchange` + an attribute — the exact pattern `callouts.ts` already uses (`:focus-within`
   does not work on this surface; see [179](179-callout-editing.md)). That satisfies WCAG 2.4.7
   without a focusable element.
4. **Register it as a VS Code command**, not only a webview key handler, so the binding is
   discoverable in the Keyboard Shortcuts UI and rebindable. A shortcut nobody can find is halfway to
   not existing.

**456 stays orthogonal**, and that is a point in favour: escaping to the toolbar and opening a link
under the caret are different problems. Option (b) from the earlier draft — overloading 456's one-shot
arm to also walk in-document tabbables — was rejected for that reason: it makes Tab's behaviour depend
on hidden state.

## Measured 2026-07-31 — word-wise caret motion already gets INTO a chip, which is what makes this work

Before committing to caret targeting, the lead measured whether the caret can actually be placed
inside a chip by keyboard (chromium harness, `wiki.html`, throwaway probe — deleted after; the real
assertion belongs with the implementation). Walking `Ctrl+ArrowRight` across
`Inline with text before [[Page A]] and after.`:

| step | caret lands |
|---|---|
| 1-4 | `P`, offsets 6 / 11 / 16 / 23 — ordinary word steps through "Inline with text before" |
| **5-6** | **`SPAN.wiki-link-chip`, offsets 4 then 6** — the caret steps INTO the chip and walks its inner words ("Page", then "A") |
| 7-9 | back out to `P` (" and after.") |

`Ctrl+ArrowLeft` mirrors it (1 stop inside the chip). **Zero stalls** — the caret never repeats a
position — and `getValue()` is unchanged by the whole walk, so word motion neither corrupts the
document nor traps the caret.

Two conclusions:

1. **Nothing to fix in word motion.** Chromium's native `contenteditable` word stepping works, and
   nothing in `media-src/src` intercepts `Ctrl+Arrow` in the editor text (only `escape-toolbar.ts`,
   `outline-keyboard.ts` and `roving-tabindex.ts` touch arrows, all scoped to the toolbar or the
   outline panel, and `escape-toolbar.ts` explicitly bails when ctrl/meta/alt is held).
2. **This is the enabler for the decision above, not a curiosity.** The chip is not traversed as an
   opaque atom — the caret can genuinely sit inside it. Had the browser skipped chips atomically,
   "put the caret in a chip and press Ctrl+Enter" would have been unreachable by keyboard and the
   whole caret-targeting design would have needed custom motion handling. It doesn't.

## Rewrite the spec accordingly

`test/vscode-e2e/wiki-chip-focus.spec.ts` currently asserts Tab-reachability and is red for a
structural reason, not a flaky one. It must be rewritten to assert the decided contract: place the
caret inside a chip, confirm the caret-inside decoration paints, press `Ctrl+Enter`, confirm the
target opens through the SAME `activateWikiLink` → `open-wikilink` path the click handler uses, and
confirm `getValue()` is unchanged throughout (a "fix" that inserts a newline while proving activation
is a regression). Keep the Lute-readiness poll already added — `getValue()` goes through
`window.vditor.vditor.lute` (double `.vditor`), which lands asynchronously well after `.vditor-ir` and
the chip are both present.

## Scope

- [x] `tabindex="0"` on wiki chips + Enter/Space activation (same action as the click path — reuse
      it, do not duplicate the open logic). **Shipped** (`media-src/src/wiki-chip-a11y.ts`); the
      focus ring and Enter activation work when the chip is focused programmatically. What does NOT
      work is *reaching* it by keyboard — see the blocker above.
- [ ] Apply the same treatment to future chip classes as they land (205/228/229/234) — or, better,
      put it in whatever shared chip decoration exists so they inherit it.

## Out of scope

Screen-reader semantics/labels (task 265).

## Verification

L2 harness: Tab reaches a chip, Enter activates it, `getValue()` unchanged.
L3 real-VS-Code: the same walk, and the focus ring actually paints (that is the dead CSS coming
alive, and the only way to prove it).
