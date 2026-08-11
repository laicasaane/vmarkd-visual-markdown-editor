# 506 — Bold/italic/strike must cover the word the caret is in (collapsed selection)

Status: **DONE 2026-08-11 — verified (unit 23/23, chromium-free path, real-VS-Code spec 5/5)**.
Pending user manual verification of the installed VSIX (same reload+check flow as task 505).

Found during user verification of task 505 (hotkeys in the live editor): pressing Ctrl+B / Ctrl+I /
Ctrl+D with the caret inside a word and nothing selected inserted markers AT THE CARET instead of
wrapping the word.

## The defect

With a collapsed selection, Vditor's own format handlers do the "type after pressing the key" thing:

- IR (`ir/process.ts` `processToolbar`): `**<wbr>**` at the caret.
- WYSIWYG (`wysiwyg/toolbarEvent.ts`): an empty `<strong>/<em>/<s>` at the caret.

The user asked for Word/Word-processor behaviour: **the word the caret is standing in gets wrapped**
(`Hello **world**.`), not open markers.

## Design (chosen)

**A capture-phase `document` click listener** that, when a `bold`/`italic`/`strike` toolbar button is
the click target (real click OR the synthetic click `message-router.ts` dispatches for the
`trigger-toolbar-hotkey` path — both converge on Vditor's `MenuItem` bubble-phase listener), expands
a collapsed selection to the enclosing word BEFORE Vditor's handler reads it. Vditor's
`getEditorRange` reads `getSelection().getRangeAt(0)` LIVE, and both modes' non-collapsed branches
already do the right thing with a real range (IR wraps `**word**`; WYSIWYG `execCommand`s the word;
toggle-off removes the strong/em/s from the word). So zero vendored Vditor changes.

Deliberately NOT a Vditor TS patch: the expansion is purely a selection tweak in front of a
read-only-once handler, and the capture-click shape matches `escape-toolbar.ts` / `gap-paragraph.ts`.

### Word boundary rule

Maximal run of non-whitespace touching the caret (`wordRangeInText`). The caret may sit at either
edge of the word (inside, at start, at end) — only a caret parked between whitespace chars (or in an
empty text node) stays collapsed. Expansion stays WITHIN the caret's text node; element-container
carets (marker/boundary positions) are left alone.

## Scope decisions

- **Formats**: only bold / italic / strike — exactly the three the user named. `inline-code`
  (Ctrl+G) keeps its current collapsed-caret behaviour (opens a code run at the caret) — not
  declined, just out of scope; revisit if asked.
- **Uniform across activation paths**: the document-capture listener covers the hotkey path AND
  real toolbar clicks (when a live collapsed selection survives the click) AND all three modes
  (ir/wysiwyg/sv all route through the same MenuItem listener + `activeModeElement`).

## Where

- NEW `media-src/src/editing/format-word-expand.ts` — `wordRangeInText` (pure),
  `expandCollapsedSelectionToWord` (DOM), `installFormatWordExpand` (capture click).
- `media-src/src/boot/finish-init.ts` — register `installFormatWordExpand()` in the `observers` map
  (idempotent cleanup, same as `installEscapeToolbar`).

## Tests (per AGENTS.md)

- Unit `media-src/src/editing/format-word-expand.test.ts` (`@vitest-environment jsdom`):
  `wordRangeInText` boundary cases + `expandCollapsedSelectionToWord` + the capture-click installer
  (real and synthetic clicks on bold/italic/strike expand; a `quote` click and a non-collapsed
  selection do not).
- Real-VS-Code `test/vscode-e2e/format-hotkeys.spec.ts` — new test: caret placed INSIDE a word
  (collapsed), real Ctrl+B / Ctrl+I / Ctrl+D wrap the word; pressing the same key again with the
  caret inside the formatted word unwraps it (toggle both ways).

## Verified in the real webview (task 506 — the two measurements that shaped the implementation)

1. **"No selection" is NOT `sel.isCollapsed`.** Vditor's caret restoration leaves the caret as a
   NON-collapsed empty range (`start === end`, no `collapse()`). The expansion therefore tests
   `range.toString() === ''` — the same semantics Vditor's own handlers use.
2. **A mid-word caret sits on a text-node boundary.** Vditor splits the containing text node at the
   caret ("world" → adjacent nodes "wo" | "rld"). The word is re-joined across DIRECT text siblings
   only (never across elements — IR `**` markers are spans, so a marker can never be swallowed).
3. **Toggle-off needs the 200ms highlight debounce.** Vditor's `highlightToolbarIR` is debounced
   200ms; the `vditor-menu--current` class that selects the remove-branch is only set once it runs.
   In the real editor the caret settles >200ms before a keypress, so toggle-off works normally; a
   keypress within 200ms of placing the caret double-wraps instead (same gap the old marker
   behaviour had — not a regression).

## Implementation status

- NEW `media-src/src/editing/format-word-expand.ts` — `wordRangeInText` (pure), the cross-node
  word walk (`extendLeft`/`extendRight`/`trimTrailingPunct`), `expandCollapsedSelectionToWord`,
  `caretTextOffset` / `isInsideInlineFormat` + `scheduleCaretRestore` (caret preservation),
  `installFormatWordExpand`.
- **Caret preservation (user follow-up after first install):** Vditor's wrap leaves the caret past
  the closing marker. The click handler captures the caret's absolute char offset BEFORE expanding,
  then `setTimeout(0)`-defers `requestCaret({ textOffset: caretOffset ± markerLength })`
  (ADR-0007, re-asserts on rAF) to shift the caret back to its original position within the word —
  +opening-marker-length on wrap, −on unwrap (detected via `isInsideInlineFormat`).
- `media-src/src/boot/finish-init.ts` — registered `installFormatWordExpand()` in the observers map.
- `scripts/module-manifest.mjs` — `format-word-expand` added to the webview `editing` module.
- Unit `format-word-expand.test.ts` (29 tests) + real-VS-Code test added to
  `test/vscode-e2e/format-hotkeys.spec.ts` — wraps + toggles off for B/I/D AND asserts the caret
  stays at the same relative position (relative textOffset deltas: +2/+1/+2, back on toggle). Both
  green (5/5 spec).
- Quality gate: lint/knip/jscpd/depcruise/coverage PASS. `audit` FAIL is PRE-EXISTING
  (nanoid <3.3.17, a transitive dep — no packages were added by this task).
- Confirmed the `toolbar-overflow` "responsive toolbar" failure is the KNOWN task-504 flake, NOT
  this change: it reproduces with the format-word-expand listener disabled.

## Follow-up during user verification: Ctrl+]/[ (indent/outdent) no-op inside a list

User report: "byłem w liście i nie działało". Reproduced + isolated in a probe spec:

- **Immediately** after placing a collapsed caret in a list item, Ctrl+] does NOTHING.
- **After ~400ms settle**, Ctrl+] nests the item.

Root cause (not the 506 word-expand — indent/outdent aren't in WORD_FORMAT_BUTTONS): Vditor's
`highlightToolbarIR` is debounced 200ms and DISABLES the indent/outdent buttons whenever the caret
isn't settled in a list. The 505 hotkey path dispatches a synthetic click, which respects the
button's disabled state — so a hotkey pressed within the debounce window no-ops even though the
caret IS in a list. The 505 spec's remapped test masked this: its `selectWord` IPC round-trip
outlasts the debounce.

Fix: `handleTriggerToolbarHotkey` (message-router.ts) drops the `vditor-menu--disabled` class from
the indent/outdent button before dispatching. Safe because Indent.ts/Outdent.ts carry their own real
semantic gate (`hasClosestByMatchTag(LI)`) — the action still only ever happens in a list — and the
next highlightToolbarIR run re-asserts the visual state.

Regression coverage: unit tests in message-router.test.ts (class dropped for indent/outdent, left
alone for bold) + a real-VS-Code test in format-hotkeys.spec.ts (collapsed caret in a list, Ctrl+]
immediately nests, Ctrl+[ immediately un-nests — no settle). All green: spec 6/6, unit 2858/2858,
lint clean.

## Known limitations (deliberate, not hidden)

- `inline-code` (Ctrl+G) keeps its collapsed-caret behaviour — only bold/italic/strike were asked
  for; see Scope decisions above.
- Trailing punctuation is trimmed (Word-style), but LEADING punctuation is not: a caret in "world"
  of "(world)" bolds the whole "(world)". Rare; left for a follow-up if ever reported.
- Toggle-off within 200ms of placing the caret (Vditor's highlight debounce) still double-wraps —
  see measurement 3 above.

## Not done yet

- User manual verification of the installed VSIX (awaiting reload + check).
