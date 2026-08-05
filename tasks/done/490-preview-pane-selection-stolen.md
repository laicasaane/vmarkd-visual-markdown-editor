# 490 — a selection made in the split-view PREVIEW pane is collapsed ~4 ms later

**Status:** ✅ FIXED 2026-08-01 (`media-src/src/editing/focus-restore.ts`). Found while investigating
why [`clipboard-preview.spec.ts`](../test/vscode-e2e/clipboard-preview.spec.ts) was flaky; it was a
REAL product defect, not a test problem — the same user-visible symptom as
[386](done/386-clipboard-preview-copy.md), from a second, independent cause.

## The cause (measured, not inferred)

Two probes — one at `caret.ts`'s `requestCaret` (ADR-0007's single choke point for programmatic
caret WRITES, logging a stack per call), one at `focus-restore.ts`'s entry (which trigger fired,
what `activeElement` was, where the selection was anchored) — plus one inside `caret.ts`'s per-frame
`tick()`. One run, absolute clock:

```
t=5836  focus-restore  trigger=focusout  active=BODY  anchor=H1 INSIDE .vditor-preview
        → restores focus+caret to the editor → requestCaret({SPAN, 0}) ARMS the re-assert loop
t=6411  the test selects 97 chars in the preview pane
t=6418  caret.ts tick #35 fires, sees the non-collapsed selection, and writes over it
t=6420  selectionchange: len 0, collapsed, anchor SPAN   ← the "4 ms collapse"
```

So the writer was **not** `requestCaret` itself (it is never called at t≈6418) but its per-frame
re-assert loop, armed 570 ms earlier and still live: `MAX_TOTAL_TICKS` keeps an intent re-writing
its position on EVERY animation frame for up to **5 seconds**, and `if (painted) misses = 0` means a
SUCCESSFUL placement stays armed rather than retiring.

What armed it: clicking the preview pane blurs the editable → `focus-restore.ts`'s `focusout`
listener → one frame later `restoreEditorFocus` sees `activeElement === BODY` and reads that as task
389's "focus went nowhere", even though the selection is anchored in the preview pane.

## The fix

`restoreEditorFocus` now bails when the live selection is anchored inside the document but OUTSIDE
the editor. This module repairs focus that went NOWHERE; anchored elsewhere is somewhere.

Deliberately **not** gated on the selection being non-collapsed: a plain click in the preview leaves
a COLLAPSED anchor there (measured above), and it is that click's restore that arms the loop which
then eats the drag-selection the user makes next. Gating on non-collapsed would look right and fix
nothing.

Scoped to the **focusout** trigger, which is the only one 490 was measured on. The window-`focus`
path is task 389's original case — the user left the webview and came back — and there an anchor
outside the editor is stale rather than a statement of intent; bailing on it would hand the user
back a webview with nothing focused, i.e. 389's own symptom reached by a new route.

Deliberately NOT fixed in `caret.ts` instead. Making the re-assert loop refuse to overwrite an
out-of-editor selection is defensible and was considered, but every real GESTURE path already
invalidates the intent (`installCaretInvalidation`: keydown/pointerdown/beforeinput), so there is no
measured case it would fix on its own — and a change to the caret authority without a red test
behind it is exactly the kind of speculative edit ADR-0007's own history warns about. If a case
turns up that the focus-restore guard misses, that is where to look.

### Verified

- `clipboard-preview.spec.ts` — **red before, green after** (the same spec failed 3/3 that morning,
  and the probes confirm the mechanism is gone: no restore at the click, `tick` never sees the
  selection, the `selectionchange` log has ONE entry instead of two)
- `focus-restore.test.ts` — new unit case on the focusout path, proven discriminating (it fails with
  the guard disabled; two earlier versions of it passed either way — the first left the tracker
  empty, the second drove the window-`focus` path the guard no longer covers)
- regression nets named in `focus-restore.ts`'s own header: `caret-on-open.spec.ts` 2/2,
  `caret-empty-typing.spec.ts` 1/1
- all investigation probes stripped from `caret.ts`, `focus-restore.ts` and the spec
- `test:vscode:fast` 40/40 (`clipboard-preview.spec.ts` was already on that tier, so this fix is
  covered by the routine run from here on)

## What was measured (2/2 identical runs)

A `selectionchange` recorder installed in the webview immediately before the test selects a
paragraph in the `.vditor-preview` pane (sv/split mode), then read back:

```
[386-sel] [{"t":11,"len":97,"collapsed":false,"anchor":"DIV"},
           {"t":15,"len":0, "collapsed":true, "anchor":"SPAN"}]
[386-sel] [{"t":13,"len":97,"collapsed":false,"anchor":"DIV"},
           {"t":17,"len":0, "collapsed":true, "anchor":"SPAN"}]
```

- the selection IS established correctly (97 chars, not collapsed)
- **~4 ms later it is collapsed to zero length and its anchor has moved into a `SPAN`**
- 4 ms rules out a diagram/preview re-render settling; this is an immediate reaction to the
  `selectionchange` itself, by something that then puts the caret somewhere else

## Why this is a product bug, not a test bug

This is exactly the user-visible symptom [386](done/386-clipboard-preview-copy.md) was about:
select text in the rendered right-hand pane, press Ctrl+C, and the clipboard gets the WRONG text.
Before this measurement the spec failed intermittently with the clipboard holding the document's
FIRST LINE instead of the selected paragraph — consistent with the caret having been moved into the
editor pane and the copy serializing from there.

386 fixed a different mechanism (the copy handler's re-entrant `execCommand("copy")`), and its fix
holds. This is a second, independent cause layered on top.

## Candidates that were on the list before the measurement (kept as a record — the answer was none of them)

Ten modules in `media-src/src` listen to `selectionchange`:

`links/caret-link.ts`, `links/caret-link-decorate.ts`, `links/code-ref-decorate.ts`,
`editing/wysiwyg-code-highlight.ts`, `editing/focus-restore.ts`, `editing/editor-caret.ts`,
`editing/escape-toolbar.ts`, `editing/gap-paragraph.ts`, `editing/trailing-paragraph.ts`,
`editing/callouts.ts`, plus `editing/dblclick-word-select.ts` (task 485).

The `anchor: "SPAN"` in the trace is the strongest clue — the syntax-highlighted editor source is
built from spans, so the caret plausibly lands in the EDIT pane. That points at whichever module
restores/tracks the editor caret, but **nothing here isolates one**: the obvious next step is to
disable them one at a time (or log a stack from inside each handler) and re-run the probe.

## How to reproduce in one command

```bash
node build.mjs
xvfb-run -a npm --prefix test/vscode-e2e test -- clipboard-preview.spec.ts \
  --repeat-each=2 --retries=0 -g "split PREVIEW pane"
```

The spec carries a live `[386-sel]` probe (log-only) that prints the timeline above on every run.

## State of the spec (user decision, 2026-08-01 — the precondition assertion STAYS)

`clipboard-preview.spec.ts`'s "split PREVIEW pane" test now asserts the precondition **honestly**:
it re-reads the selection immediately before Ctrl+C and fails there if it did not survive, instead
of failing later at the clipboard assertion where a collapsed selection is indistinguishable from
the copy-handler defect 386 fixed. The user chose this over reverting to the previous
flaky-but-green-on-retry state. It was deliberately red until the fix above landed; it is green now,
and the assertion stays as the regression net.

The copy itself is deliberately NOT retried — retrying the keystroke until the clipboard agreed
would mask 386's defect, which is the thing this spec exists to catch.

## Do not

- Do not "fix" this by re-establishing the selection right before the copy. That hides the defect
  the user would still hit by hand.
- Do not assume the diagram/preview re-render is responsible — 4 ms is far too fast, and the
  quiescence poll added to the spec (which waits for `.vditor-preview`'s innerHTML to stop changing)
  does not prevent it.
