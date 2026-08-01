# Task 393 — pasting plain text over a selection inserts before it and eats a character

**Status: ✅ DONE (2026-07-27)** — root cause measured (re-entrant `execCommand`), fixed, RED-checked.

**Impact:** 🔴 high — silent partial data loss on one of the most ordinary editing actions there is ·
**Origin:** found while verifying task 392 (2026-07-27)

## What was measured

Real VS Code, real clipboard, real `Ctrl+V`, IR mode. Document `Read the paper today.`, select
`the paper` (the live selection reports exactly `"the paper"`), clipboard holds `WORDS`:

| | |
| --- | --- |
| expected | `Read WORDS today.` — the selection is replaced |
| actual | **`Read WORDSthe pape today.`** |

Two things went wrong at once: the pasted text was inserted **before** the selection instead of
replacing it, and the selection lost its **last character** (`the paper` → `the pape`).

## Root cause — measured, not reasoned about

`insertHTML` (`util/selection.ts`) deletes the current selection before inserting:

```ts
const range = getEditorRange(vditor);
if (range.toString() !== "") {
    vditor[vditor.currentMode].preventInput = true;
    document.execCommand("delete", false, "");
}
```

Instrumented `document.execCommand` in a real VS Code (depth counter + stack trace on every
`'delete'` call):

```
[vmarkd-debug] delete depth= 1
    at Ca.document.execCommand …
    at HostMessaging.channel.port1.onmessage …
```

**`depth=1`.** VS Code's webview clipboard bridge answers `Ctrl+V` by calling
`document.execCommand("paste")` from a host-message handler — so `insertHTML`'s own
`execCommand("delete")` runs **while `execCommand` is already on the call stack**: genuinely
re-entrant. Forcing it synchronous and diffing the DOM before/after proved what that does:

```
[vmarkd-debug] delete depth= 1 trying SYNC delete
[vmarkd-debug] sync delete result= false changed= false
```

Chromium **silently refuses** a re-entrant `execCommand` — no throw, `execCommand` returns
`false`, nothing is deleted. (This is the exact "called recursively" case the vendored
`fixCut()` comment in `media-src/src/utils.ts` references, filed originally for the CUT path —
see task 387.)

The old workaround — `fixCut()`, applied **globally** to `document.execCommand` — deferred
*every* `'delete'` call into a `setTimeout` to dodge that refusal. For paste, that let the delete
eventually run, but a macrotask later, against whatever the selection had already collapsed to:

```
[vmarkd-debug] deferred delete firing, sel=
```

An **empty** selection — a stealth backspace, one character short. That is exactly the
`"the paper"` → `"the pape"` signature measured above, and exactly why `WORDS` landed *before*
the still-undeleted selection (`insertHTML`'s `range.insertNode(...)` ran first, since the delete
hadn't happened yet).

## The fix

`patchInsertHtmlDelete` (`media-src/esbuild-shared.mjs`, applied to vendored
`util/selection.ts`) replaces the `execCommand("delete")` step with `range.deleteContents()` — a
plain DOM mutation, not an editing command, so Chromium's recursion guard never applies to it and
it can never race a later selection state: it runs at the exact moment `range` still describes
the selection.

It fires no native `"input"` event (unlike `execCommand("delete")`), so the patch also drops
`preventInput = true` — that flag exists only so the IR/WYSIWYG `input` listener can swallow the
delete's own `"input"` event once (see `ir/index.ts` / `wysiwyg/index.ts`); left set with nothing
to swallow, it would wrongly intercept the very next real keystroke.

**Not a scoped defer.** The tempting narrower fix — leave `fixCut()`'s global monkeypatch alone
and just skip deferring at this one call site — was tried first (instrumented, not assumed) and
rejected: at `depth=1` a *synchronous* `execCommand("delete")` is **refused outright** (see the
measurement above), so removing only the `setTimeout` would leave the selection undeleted
entirely, worse than today's one-character loss. `execCommand` is the wrong tool for this delete
regardless of timing; `range.deleteContents()` replaces it outright.

**Same mechanism as task 387, different fix — 387 fixed separately, same day.** Cut needed the
clipboard-write ordering preserved, undo driven by hand (`IRInput`/`input`, since `deleteContents()`
fires no native `"input"` event to trigger Vditor's own pipeline the way `execCommand("delete")`
did), and the task-385 collapsed-caret guard intact; sv turned out to need explicit exclusion (its
`execCommand("delete")` was never broken, and routing it through `deleteContents()` anyway broke it
— caught by a regression test). `fixCut()` is left in place: after both fixes it only ever
intercepts sv's cut delete (the only remaining `execCommand("delete")` caller in the tree), so its
blast radius is now naturally what it was always meant to cover.

## Scope

- [x] Reproduce in WYSIWYG and split as well as IR — the insert path differs per mode. sv never
      had the bug (`processPaste` uses `range.extractContents()` directly, no `execCommand`);
      pinned by an e2e so a future refactor toward `insertHTML` doesn't reopen it silently.
- [x] Establish whether this is the same root cause as task 387 before fixing either — same
      mechanism (`fixCut()`'s global `execCommand("delete")` deferral racing a re-entrant call),
      different required fix; both fixed, see `387-cut-leaves-last-line.md`.
- [x] Fix so a paste over a selection replaces exactly the selection, no more and no less.

## Verification

- **Unit** — `test/backend/vditor-source-patches.test.ts` (5): shipped source deletes via
  `execCommand` (pre-patch guard), patch replaces it with `range.deleteContents()`, patch drops
  `preventInput = true`, the block-insert branch is untouched, anchor-drift throws.
- **Real-VS-Code e2e** — `test/vscode-e2e/paste-over-selection.spec.ts` (5): IR and WYSIWYG plain
  text paste over a selection, a two-paragraph block paste over a selection (the OTHER
  `insertHTML` branch), sv (was never broken, pinned), typing right after the paste (the
  `preventInput` poisoning guard). All assert the document **on disk** with exact equality, not
  `toContain` — a `toContain` check passes on the mangled result too, which is how this survived
  unnoticed until a task-392 guard test happened to print the whole document.
- **RED-checked:** with the patch stashed out, 4 of the 5 new e2e tests fail on every retry (sv
  passes either way, as expected); rebuilt with the patch restored, all 5 pass.
- No regressions: `list-tight.spec.ts` (391, includes the real-clipboard multi-paragraph paste
  race) and `paste-url-link.spec.ts` (392, includes the mailto-over-selection guard) both green
  after this change — both go through the SAME `insertHTML` delete step.
