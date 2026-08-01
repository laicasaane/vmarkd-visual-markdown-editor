# Task 390 — the link toolbar button ignored a selected URL and inserted the `https://` placeholder

**Status: ✅ DONE (2026-07-27).**

**Impact:** 🟠 medium — the most common way to make a link (paste a URL, select it, click 🔗) produced
a link that pointed at nothing, and the user had to retype the URL by hand · **Origin:** user report
2026-07-27

## What happened

Select a URL — `https://example.com/page` — and click the link button in the toolbar.

| | |
| --- | --- |
| expected | the selected URL is the link **text** AND its **destination** |
| was | the selection became the link text, the destination stayed the literal `https://` |

So `https://example.com/page` turned into `[https://example.com/page](https://)`. The one thing the
user had already supplied was the one thing the link lacked.

## The fix

`media-src/src/link-url.ts` holds the detector; the two toolbar handlers reach it through the
`__vmarkdSelectedUrl` global (patched Vditor sources cannot import from our bundle):

- **IR** (`ir/process.ts`, `patchIrLinkSelectedUrl`) — a URL-shaped selection builds
  `[url](url)` with both halves HTML-escaped, since IR inserts an HTML string and a `&` in a query
  string would otherwise be read as an entity.
- **WYSIWYG** (`wysiwyg/toolbarEvent.ts`, `patchWysiwygLinkSelectedUrl`) — sets the `<a>`'s href
  before `genAPopover`, so the popover opens with the destination already filled in.
- **Ordinary text is untouched**: it stays the label with the caret in the placeholder destination.
  That is the right behaviour for it, and it is the case a false positive would wreck, so the
  detector is deliberately strict — `http(s)://`, `mailto:`, or a bare `www.` host, single line, no
  whitespace. A `www.` selection keeps its text and gets an `https://` destination.
- **Split (sv)** is a source view: the toolbar link action inserts markdown text there and has no
  DOM link node to reason about. Left as it is.

## The part that was NOT obvious — the file did not change

The fix worked in the editor immediately, and the document on disk stayed byte-identical. That is
not a bug in the patch. `[https://x](https://x)` and a bare `https://x` are the **same document**
under GFM, which autolinks the bare form — measured against our pinned Lute, both round-trip to the
bracketed form:

| selection | canonically equal to the bare form | would the file change |
| --- | --- | --- |
| `https://…` | **yes** | no |
| `www.…` | no | yes |
| `mailto:…` | no | yes |

So the host's minimal-diff write-back (task 61 v2) correctly classified the edit as a no-op and kept
the original bytes. That layer is what stops an edit reflowing blocks the user never touched, so it
was not weakened. **Decision (user, 2026-07-27): the button must force its result into the file** — a
button that visibly does nothing reads as broken.

Implemented as narrowly as it can be:

1. The patched handler calls `__vmarkdExplicitEdit()` when, and only when, it used a detected URL.
2. `edit-sync` reads that flag **once** and adds `explicitBlock` — the markdown of the single
   top-level block the caret is in — to the `edit` message. Mode-aware (`VditorDOM2Md` in WYSIWYG),
   and it falls back to `editor-caret`'s tracked caret because WYSIWYG's link popover steals focus
   into its own input before the debounced post runs.
3. The host (`applyExplicitBlock`) replaces **that one block's bytes** in the already-minimized
   output, by offset, leaving every other byte — blank lines included — exactly as it was.

Nothing changes for any other edit: with no `explicitBlock`, `syncToEditor` behaves exactly as before.

## Verification

- **Unit** — `media-src/src/link-url.test.ts` (11): every accepted URL shape, and the refusals that
  matter (plain text, a sentence containing a URL, a multi-line selection, `www.example` with no
  dotted host), plus the explicit-edit flag being read exactly once (a stale flag would make the next
  ordinary edit force a rewrite).
- **Unit** — `test/backend/vditor-source-patches.test.ts` (7): the pre-patch shape of both Vditor
  sources, both patched shapes, the WYSIWYG href being set before `genAPopover`, and both patches
  throwing on anchor drift so a Vditor bump fails the build loudly.
- **Unit** — `test/backend/minimal-diff-writeback.test.ts` (6 for `applyExplicitBlock`): forces the
  explicit form, leaves every other byte alone, is a no-op when already explicit, replaces only the
  FIRST canonical match, does nothing without a match, does nothing when Lute is cold.
- **Real-VS-Code e2e** — `test/vscode-e2e/link-button-url.spec.ts` (3): IR and WYSIWYG assert the
  URL reaches **the document on disk** in both halves; a third pins the plain-text behaviour, because
  the fix is a branch and a branch can be got backwards.

## Related

Task 392 (pasting a URL should produce a markdown link) shares the detector and the explicit-edit
mechanism — the same "semantically a no-op, but the user meant it" problem applies there.
