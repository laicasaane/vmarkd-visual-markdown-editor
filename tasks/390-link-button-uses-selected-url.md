# Task 390 — the link toolbar button ignores a selected URL and inserts the `https://` placeholder

**Status: 🔴 OPEN.**

**Impact:** 🟠 medium — the most common way to make a link (paste a URL, select it, click 🔗) produces a
link that points at nothing, and the user has to retype or re-paste the URL by hand ·
**Origin:** user report 2026-07-27

## What happens

Select a URL in the editor — `https://example.com/page` — and click the link button in the toolbar.

| | |
| --- | --- |
| expected | the selected URL becomes the link **destination** |
| actual | the selection becomes the link **text** and the destination is the literal placeholder `https://` |

So `https://example.com/page` turns into `[https://example.com/page](https://)` — a link whose target
is the placeholder. The URL the user selected is thrown away as far as the destination is concerned.

## Where it comes from

Vditor's toolbar handler treats the selection as label text unconditionally, with no look at what was
selected:

- `media-src/node_modules/vditor/src/ts/ir/process.ts` (~line 172, the `commandName === "link"` branch
  of the "add" path) — builds `` `${prefix}${range.toString()}${suffix…}` ``, where the prefix/suffix pair
  is `[` / `](https://)`.
- `media-src/node_modules/vditor/src/ts/wysiwyg/toolbarEvent.ts` (~line 212) — the WYSIWYG twin of the
  same branch.

Both modes need the fix; sv is a source view and has its own path, so check it separately rather than
assuming it behaves like either of them.

## What the fix has to decide

The selection is one of two things, and the button should tell them apart:

1. **The selection looks like a URL** (`https://`, `http://`, `mailto:`, a bare `www.`, or a relative
   path to a file that exists — decide how far to go). Then it is the DESTINATION: emit
   `[<wbr>](https://example.com/page)`, caret in the empty label so the user types the text.
   Whether to instead default the label to the URL (`[url](url)`, the GitHub/Obsidian autolink shape)
   is a product call — pick one and state it in the task before implementing.
2. **The selection is ordinary text.** Current behaviour is right: it becomes the label and the caret
   goes inside `(…)` on the placeholder, ready for the URL.

A third case worth handling because it is common: **the clipboard holds a URL and the selection is
text** — VS Code and most editors then paste the URL as the destination. Out of scope unless the user
asks; note it here so it isn't rediscovered.

## Scope

- [ ] Decide the URL-selected shape (`[](url)` vs `[url](url)`) and record the decision here.
- [ ] Detect a URL-shaped selection and route it to the destination, in **IR** and **WYSIWYG**.
- [ ] Check what the button does in **split (sv)** and make it consistent or explicitly document why not.
- [ ] Leave the plain-text-selection and empty-selection behaviour exactly as it is.
- [ ] Implement as an esbuild patch in `media-src/esbuild-shared.mjs` (anchor-asserted, one registry
      entry per file — the existing entries for these two files must be composed, not duplicated).

## Verification

- Unit tests for the URL-detection helper: `https://`, `http://`, `mailto:`, `www.`, a bare word, a
  string with spaces, an empty selection.
- Real-VS-Code e2e in `test/vscode-e2e/`: select a URL, click the toolbar link button, and assert the
  **document on disk** — the markdown must carry the URL as the destination, not `https://`. Assert the
  plain-text case in the same spec so the fix cannot silently swap the two behaviours.
