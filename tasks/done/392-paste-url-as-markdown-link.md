# Task 392 — pasting a URL produces a markdown link

**Status: ✅ DONE (2026-07-27).**

**Impact:** 🟢 low-medium — nothing was broken, but the most common editing action around links (copy
a URL, paste it) left the user to type the `[]()` scaffolding by hand · **Origin:** user request
2026-07-27

## The decision this task was gated on

The no-selection shape, recorded before implementing as the task required: **`[url](url)`** — the URL
becomes both the label and the destination. Chosen to match the shape the user's own documents carry
and the one task 390's link button produces for a selected URL, so the two routes to a link agree.
`<url>` (a CommonMark autolink) was rejected as a form most users do not recognise; leaving the URL
bare was rejected as the behaviour being reported.

## What was already there, and what was missing

Vditor already implemented **half** of this, which the first look at the task did not know:

```ts
// util/fixBrowserBehavior.ts
if (range.toString() !== "" && vditor.lute.IsValidLinkDest(textPlain)) {
    textPlain = `[${range.toString()}](${textPlain})`;
}
```

So pasting a URL **over a selection** already produced `[selection](url)`. The missing case is the one
that was reported: paste a URL with **nothing selected** and you got the bare URL as text. Only that
branch was added, immediately after Vditor's, so the selected-text behaviour is untouched — and it is
pinned by a test, because it is easy to break while adding the other one.

## The fix

- `patchPasteUrlAsLink` (`media-src/esbuild-shared.mjs`) adds the no-selection branch; the detector
  is `link-url.ts`'s, shared with task 390, reached through `__vmarkdPasteUrlMd`.
- **Guards:** the caret must not be inside an existing `<a>` / `[data-type="a"]` (pasting into a
  destination stays literal), and code is excluded upstream — this branch only runs after Vditor's
  fenced/inline-code branch has been ruled out. Both have e2e assertions rather than being claimed.
- **Setting:** `vmarkd.editor.pasteUrlAsLink`, default on. Pasting is a reflex action, so a user who
  wants the bare URL must be able to turn it off rather than undo every time.
- **Explicit edit:** the rewrite marks the edit explicit (task 390's mechanism), because
  `[https://x](https://x)` and the bare URL are the same document under GFM — without it the
  minimal-diff write-back keeps the original bytes and the paste appears to do nothing.
- **All three modes:** the rewrite happens before Vditor branches on the mode, so IR, WYSIWYG and
  split all get it. Split inserts the markdown as text there, which is what a source view should do.

## Scope

- [x] Record the no-selection decision.
- [x] URL detection shared with task 390.
- [x] Wire into the paste path for IR and WYSIWYG; split is covered by the same code and asserted.
- [x] Respect the code-block / inline-code / existing-link exclusions.
- [x] A setting, since pasting is a reflex action.

## Verification

- **Unit** — `media-src/src/link-url.test.ts` (17 total, 6 for the paste hook): the link markdown for
  an `https://` and a bare `www.` paste (the label stays what was pasted; only the destination gains
  the scheme), ordinary text and multi-line text refused, inside-a-link refused, the setting off, and
  the default-on when the host sends no value. 100% coverage of the module.
- **Unit** — `test/backend/vditor-source-patches.test.ts` (5 for this patch): the pre-patch source
  handling only the selected-text case, the new branch added without disturbing it, both link guards,
  the explicit-edit flag, and the anchor-drift throw that fails the build on a Vditor bump.
- **Real-VS-Code e2e** — `test/vscode-e2e/paste-url-link.spec.ts` (8): real clipboard + real Ctrl+V,
  asserted against the document on disk. No selection → `[url](url)`; over a selection →
  `[selection](url)`; a mailto: address over a selection stays text (the data-loss guard below);
  ordinary text unchanged; a URL pasted into a fenced code block stays literal; **one** Ctrl+Z
  returns the document byte-for-byte; and the same paste in WYSIWYG and split.
- **RED-checked:** with the patch stashed out, the no-selection test fails on every retry.

## A bug this shipped with, caught in review

The first cut keyed the new branch off `else` — i.e. "Vditor's condition was false". That condition
is false in **two** ways: nothing selected (what was meant) and something selected while Lute's
`IsValidLinkDest` rejects the clipboard. The two detectors do disagree — measured,
`IsValidLinkDest("mailto:me@example.com")` is `false` where ours accepts it — so pasting a mailto:
address over a selection built a link out of the clipboard and **replaced the selected text**.
Verified against the built extension before the fix: `Read [mailto:me@example.com](mailto:me@…)the
pape today.`

Now `else if (range.toString() === "")`, with the emptiness tested explicitly, and a spec that pins
it shut using the mailto case that discriminates between the two detectors.

**Separately, and NOT from this work:** that verification also surfaced a pre-existing defect —
pasting plain text over a selection inserts it *before* the selection and eats the selection's last
character (`the paper` → `the pape`). It reproduces with no URL involved and with this whole patch
stashed out. Filed as **task 393**, with the note that it looks like the same family as task 387.
