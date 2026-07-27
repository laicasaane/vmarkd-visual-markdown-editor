# Task 393 — pasting plain text over a selection inserts before it and eats a character

**Status: 🔴 OPEN — measured, not fixed.**

**Impact:** 🔴 high — silent partial data loss on one of the most ordinary editing actions there is ·
**Origin:** found while verifying task 392 (2026-07-27)

## What was measured

Real VS Code, real clipboard, real `Ctrl+V`, IR mode. Document `Read the paper today.`, select
`the paper` (the live selection reports exactly `"the paper"`), clipboard holds `WORDS`:

| | |
| --- | --- |
| expected | `Read WORDS today.` — the selection is replaced |
| actual | **`Read WORDSthe pape today.`** |

Two things go wrong at once: the pasted text is inserted **before** the selection instead of
replacing it, and the selection loses its **last character** (`the paper` → `the pape`).

**Not task 392's doing.** No URL is involved, so the paste-as-link branch never runs; it reproduces
with the whole 392 patch stashed out, and with plain text that no detector would ever accept.

## The shape it does NOT happen in

Pasting a **URL** over a selection is fine: Vditor's own branch rewrites the clipboard to
`[selection](url)` before inserting, and that path replaces the selection correctly —
`[the paper](https://example.com/a-paper)`, label intact. So the defect is in the **plain insert over
a non-collapsed selection**, not in paste generally.

## Where to look

- `util/fixBrowserBehavior.ts` — the `textPlain.trim() !== ""` branch, which ends in `insertHTML(...)`
  for IR/WYSIWYG. Whether the selection is deleted first, and whether that delete lands before or
  after the insert, is the question.
- Strong prior from task 387 (cutting a selected multi-line paragraph leaves its last line): the cut
  path defers `execCommand("delete")` into a `setTimeout` and it lands a macrotask late, against a
  selection that has already collapsed. The off-by-one-character signature here is the same family,
  and the two should be investigated together — a fix for one may well be the fix for both.
- VS Code's webview clipboard bridge answers `Ctrl+V` from a host-message handler (see task 385), so
  the selection state inside the handler is not what a naive reading assumes. Measure it; do not
  reason about it.

## Scope

- [ ] Reproduce in WYSIWYG and split as well as IR — the insert path differs per mode.
- [ ] Establish whether this is the same root cause as task 387 before fixing either.
- [ ] Fix so a paste over a selection replaces exactly the selection, no more and no less.

## Verification

Real-VS-Code e2e: select a known run of text, paste plain text over it, assert the document on disk
is `before + clipboard + after` **exactly** — a `toContain` assertion would pass on the mangled
result, which is how this survived unnoticed until a task-392 guard test happened to print the whole
document.
