# Task 392 — pasting a URL should produce a markdown link

**Status: 🔴 OPEN.**

**Impact:** 🟢 low-medium — nothing breaks, but the single most common editing action around links
(copy a URL, paste it) leaves the user to type the `[]()` scaffolding by hand every time ·
**Origin:** user request 2026-07-27

## What is asked for

Pasting a URL should format it as a markdown link immediately, instead of dropping the bare URL in as
plain text.

## The two cases, which behave differently everywhere else

1. **Text is selected.** The pasted URL becomes the DESTINATION and the selection stays as the label:
   `select "the paper"` + paste `https://example.com` → `[the paper](https://example.com)`. This is
   what VS Code, GitHub, Obsidian and Typora all do, and it is the case with no ambiguity.
2. **Nothing is selected.** Here the editors disagree, so this is a product decision, not a lookup:
   - `[https://example.com](https://example.com)` — link with the URL as its own label; what the user
     appears to be describing ("format as a markdown url"), and what shows in the user's own document
     in task 391.
   - `<https://example.com>` — a CommonMark autolink; shorter, renders the same, but is a form most
     users do not recognise.
   - leave it bare — the current behaviour; many renderers autolink it anyway.

   **Pick one and record the decision in this file before implementing.**

## Constraints that must not be broken

- **Only actual URLs.** `http://`, `https://`, `mailto:` at minimum. Never rewrite ordinary pasted
  text; a false positive silently corrupts a paste, which is far worse than the missing convenience.
- **Never inside a code block, inline code, or a link's own destination.** Pasting a URL into
  `](…)` must stay literal.
- **Multi-line clipboard content is not a URL** even if the first line looks like one.
- Pasting must remain undoable in ONE step — the link and the paste are one edit, not two.

## Related

Task 390 (the link toolbar button ignores a selected URL) is the same feature seen from the toolbar
side, and case 1 above shares its URL-detection helper. Implement the helper once, use it in both,
and land 390 first — it is a defect, this is a convenience.

## Scope

- [ ] Record the no-selection decision above.
- [ ] URL detection helper, shared with task 390.
- [ ] Wire into the paste path for **IR** and **WYSIWYG**; decide explicitly what split (sv) does.
- [ ] Respect the code-block / inline-code / existing-link exclusions.
- [ ] Make it a setting if the behaviour is at all opinionated (`vmarkd.editor.*`) — pasting is a
      reflex action, and a user who does not want the rewrite must be able to turn it off.

## Verification

- Unit tests for the detector and the rewrite: URL with and without a selection, multi-line
  clipboard, plain text, a URL pasted inside inline code and inside a fenced block.
- Real-VS-Code e2e using the REAL clipboard (`vscode.env.clipboard.writeText` + a real Ctrl+V), and
  assert the document ON DISK — a synthetic paste event does not exercise the clipboard bridge.
- One undo must take the document back to its pre-paste state.
