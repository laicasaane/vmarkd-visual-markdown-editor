# Task 439 — Place the caret at the start of the first line when an EMPTY document opens

**Status:** ✅ DONE (2026-07-30) — root-caused after **shipping broken once**, fixed, and pinned on
the measurement that was missing. · **Impact:** 🟢 small, high-frequency (every open of a blank file)
· **Origin:** user report — "after opening a file the caret should sit at the very start of the first
line", narrowed by the user mid-build to **empty files only**.

## The root cause: a caret with nowhere to be painted

An empty document's editable has **zero element children**, and keeps them — Vditor creates its
first `<p>` only when you type (measured over 4 s). The first implementation therefore anchored the
Range on the editable itself, `(PRE, 0)`. That is a valid DOM position, and it is **unpaintable**:

| | before | after |
|---|---|---|
| collapsed Range's client rect | **`{w: 0, h: 0}`** — no caret can be drawn | `{w: 0, h: 16}` |
| editable children / innerHTML | `0` / `""` | `1` / `<p data-block="0">​</p>` |
| typing without clicking | **worked** (value became `Zażółć`) | works |
| file on disk | empty | still empty (`getValue()` → `"\n"`, no U+200B) |

Typing working while nothing was visible is the exact signature: the caret existed, it just had no
box to be rendered in. That matches the report — *"it flashed and disappeared"*.

**Fix:** create the block the caret needs (`ensureFirstBlock` in `media-src/src/initial-caret.ts`) —
a `data-block` paragraph seeded with a zero-width space, the same shape Vditor uses for its own
splices and `gap-paragraph.ts` uses for the trailing paragraph, which Lute does not serialise. The
caret goes *after* the seed so the first keystroke lands on the right side of it.

## Why three green test layers did not catch it — the lesson

Every probe measured whether the Range **existed** and **where** it was. None measured whether a
caret could be **drawn**. `caret-on-open.spec.ts` passed against a build where the feature was
invisible in the real editor. It now asserts the range's client-rect **height**, which is the only
thing that fails when this breaks.

Two further method notes worth keeping:
- **The harness never grants a freshly opened editor real OS focus** (`document.hasFocus()` stays
  false), so `placeInitialCaret`'s focus branch went unexercised through three rounds of probing.
  The reliable headless workaround: a donor click in another document, then
  `workbench.action.focusActiveEditorGroup` **as its own host round trip** after the webview mounts
  (issuing it in the same call as `openWith` races the mount and leaves the window unfocused).
- **Run the product's own settings.** The reproduction only became convincing under the reporter's
  configuration (`theme.content: vscode-dark-2026`, full width, heading markers off), because caret
  visibility is a CSS question and every prior measurement used harness defaults.

## Historical: why the first green run did not prove it works

`test/vscode-e2e/caret-on-open.spec.ts` asserts the Range is **created**. It cannot assert the caret
is *usable*, because **this harness never grants a freshly opened editor real OS focus** —
`document.hasFocus()` stays `false` for seconds (measured). So the spec exercised the
selection-without-focus branch and then *simulated* the handover with a synthetic `window` `focus`
event. That synthetic event is exactly where reality diverges: it is not proof of the real
focus handover, and the real one is where this fails.

**Reported alongside it, and probably the same root cause (PRE-EXISTING, not caused by this task):**
> "after the first click into the editor the caret disappears, and only on the second click does it
> stay (it was like that before too)."

If the first real focus/click handover drops the DOM selection, it drops OUR programmatically placed
one too — the placement being correct and the caret being invisible are consistent. Investigate that
mechanism first; do not iterate on the placement code until it is measured. See
[445](445-first-click-drops-the-caret.md).

## Historical: the hypothesis that was WRONG (kept so it is not re-chased)

The suspicion below — that Vditor lazily inserts a placeholder `<p>` and that insertion invalidates
the caret — was **disproved by measurement**: the editable keeps zero children for at least 4 s and
no such insertion happens. The real cause was the zero-height client rect above. The two gap-paragraph
suspects were also cleared, correctly, and that part still stands.


The caret **is** placed and **is** painted (so in their editor `document.hasFocus()` was true and we
did call `focus()`), then something removes it. Measured input: an empty document's editable has
**zero element children** at open — Vditor creates its placeholder `<p>` lazily, on first
focus/edit — so the placement anchors the Range on the **editable itself**, `(PRE, 0)`. When Vditor
then inserts that `<p>`, position `(PRE, 0)` means "before the paragraph", which browsers do not
paint. Flash, then nothing. Fits the report exactly.

Two suspects were considered and **cleared by reading the code**, so nobody re-chases them:
`ensureTrailingParagraph` no-ops on a zero-children editable (`lastContentChild` → null,
`gap-paragraph.ts:206-234`), and `cleanupGapParagraphs` no-ops on a lone empty `<p>` with no siblings
(the `!next` branch with `prev === null`, `gap-paragraph.ts:88-96`).

**The fix must therefore not anchor on the container.** The clean form is a *leading-block invariant*
(the mirror of the trailing one, owned by `gap-paragraph.ts`) so a first block always exists and the
caret code has no empty-document special case at all — see
[446](446-caret-authority-and-shape-invariants.md) Part 1. The `firstElementChild ?? editor` fallback
currently in `initial-caret.ts` is the patch shape, and it is what produced this bug.

## Scope as SHIPPED — empty documents only (user decision, 2026-07-30)

The report started as "every document", and that is what the first cut implemented. **Mid-build the
user narrowed it deliberately: place the caret ONLY when the file is empty.** A document with any
content is left exactly at its measured baseline — no selection, no focus, nothing touched.

That is not a scope cut for convenience; it removes three real hazards at once:

1. **No focus stealing in a real document.** A blank file is unambiguously "opened to type into";
   a document with content is not.
2. **Nothing to scroll.** An empty document has no scroll range, so the module carries **no**
   scroll-correction logic — and with it goes the whole ordering hazard against
   `bridgePrepaintScroll` (see [Ordering](#ordering-facts-established-by-reading-the-code)).
3. **No chance of revealing raw syntax.** Placing the caret in a first block that happens to be a
   heading was the one thing that could have shipped a visible regression (raw `# ` where a rendered
   heading used to be). Measured as a non-issue anyway — see
   [Negative findings](#negative-findings-worth-keeping).

The with-text e2e case was therefore **inverted into a guard**: it now asserts that opening a
document with content leaves `rangeCount === 0` and the editor unfocused. Anyone widening this back
to real documents has to delete a passing test that says not to.

## Measured baseline — the fix CREATES a selection, it does not move one

Real VS Code, IR mode, `test/vscode-e2e/caret-on-open-probe.spec.ts` (kept as the committed baseline
record). Empty and with-text fixtures were **bit-identical** on every field, at T0 / +500 ms / +2.5 s:

| | empty.md | text.md (heading + paras + list) |
|---|---|---|
| `document.activeElement` | `BODY` | `BODY` |
| editor focused | **no** | **no** |
| `getSelection().rangeCount` | **0** | **0** |
| `editorScrollTop` | 0 | 0 |

So there was never a stray Range in the wrong place — there was **no Range at all**. That is why the
fix is a create-and-focus, and why "move the caret to the start" would have been the wrong shape.
(It also means Vditor leaves nothing at EOF either, so no pre-existing placement was overridden.)

Second measured surprise: a genuinely empty document's editable has **zero element children** right
after open — Vditor creates its placeholder `<p>` lazily, on the first click/edit. The placement
therefore falls back to collapsing onto the editable itself, which is the real first block in that
state, not a defensive edge case.

## Fix

`media-src/src/initial-caret.ts` (new) — `placeInitialCaret(vditor)`:

- **Emptiness is a content question**, not a DOM-shape guess: `getValue().trim() !== ''` → bail.
  Lute always serialises a trailing newline, so a blank file's value is `'\n'`; trimming also makes a
  whitespace-only file count as empty.
- Collapses to offset 0 of the editable's first block (first text node, else the block itself), via
  `activeModeElement(vditor)` so it works in whichever mode the document opened in.
- **Focus only when `document.hasFocus()`**, with `{preventScroll: true}`. If the webview does not
  have focus (a restored-but-inactive tab), the selection alone is enough:
  `focus-restore.ts:58-65` bails today *because* no Range exists for it to restore — now that one
  does, it focuses the editable the moment the webview gains focus. The two mechanisms compose
  instead of fighting.
- **One-shot per webview.** `config-changed` re-inits Vditor and re-runs `runFinishInit`; a live
  re-init must preserve the user's caret, not yank them to the top mid-edit.
- Defensive guard: an existing collapsed selection inside the editable is left alone.

Wired into `runFinishInit` (`media-src/src/finish-init.ts`) **after** the `observeTrailingParagraph`
registration, per the ordering below.

### Ordering facts (established by reading the code)

- `observeTrailingParagraph` mutates the DOM **synchronously** at install (`gap-paragraph.ts`
  `run()` on install) — so the placement runs after it, never racing that mutation.
- The prepaint teaser's wheel/key capture is torn down by `cap.stop()` inside
  `bridgePrepaintScroll(false)`, which runs **after** `finishInit()` returns
  (`vditor-init.ts:404`) — i.e. the capture is still live while `runFinishInit` executes. Irrelevant
  to a Selection write, but it is exactly why a blind `scrollTop = 0` inside `finishInit` would have
  been silently stomped. Moot now that there is no scroll logic; recorded so it is not rediscovered.
- The streaming (large-doc) path orders these the other way round (`bridgePrepaintScroll(true)` in
  `onFirstChunk`, before `finishInit()` in `onDone`) — so "the safe seam" is not even the same on
  both paths. Another reason the shipped version writes no scroll.

## Verification

- [x] **Unit** — `media-src/src/initial-caret.test.ts`, **9 passed**: empty-doc placement; the
      zero-children editable fallback; whitespace-only counts as empty; **a document with content is
      a no-op** (no Range, focus not called); the one-shot gate; the existing-selection guard;
      `focus` called with `{preventScroll: true}`; `focus` NOT called when `document.hasFocus()` is
      false while the selection IS still set; no-editable no-op.
- [x] **Real-VS-Code e2e (mandatory — caret/focus only reproduces in the real webview)** —
      `test/vscode-e2e/caret-on-open.spec.ts`, **2 passed** (re-run independently by the reviewing
      session, green both times):
      1. empty document → caret at (block 0, offset 0), collapsed, survives a simulated webview
         focus handoff, and a character typed with the **real keyboard** lands at the very start
         (`'Q\n'`);
      2. document with content → `rangeCount === 0` and the editor unfocused, before AND after the
         focus handoff (the do-not-touch guard).
      The harness never grants a freshly opened editor real OS focus (`document.hasFocus()` stays
      false — the reason every real-keyboard spec here clicks first), so the spec dispatches the
      `window` `focus` event `focus-restore.ts` listens for instead of clicking: a click would have
      moved the very caret under test.
- [x] **Coverage** — `initial-caret.ts` at **100% lines / 100% functions / 95% branches**.
- [x] `npm test` 2015 passed · `npm run typecheck` clean · `npm run lint:ci` 0 warnings.
- Note: `npm run check:coverage-modules` fails on `media-src/src/list-backspace.ts` (0%) —
      **pre-existing on this branch** (confirmed with the change stashed out), unrelated to this task.

## Negative findings worth keeping

- **Placing the caret in a heading does NOT expand the block / reveal raw `# `.** Measured
  before/after in the real webview: first block `className` stays `vditor-ir__node` (never gains
  `--expand`), the `.vditor-ir__marker` span stays clipped at `width: 0` (Vditor collapses markers by
  zero-width clip, *not* `display: none`), and the H1's rect is identical (38.97 × 528, font-size
  24.5px). Vditor only expands on a real interaction path, not on a programmatic Range + focus. Moot
  for the shipped scope, but this is the answer if the feature is ever widened.
- Programmatic `Range.setStart(textNode, 0)` + `focus()` leaves an extra **zero-length empty text
  node** ahead of the marker text (`["", "# "]` vs `["# "]`). No layout, render or `getValue()`
  effect (Lute concatenates to the same string) — recorded because it is the kind of artifact that
  later looks like a serialisation bug.

## Deliberately NOT done

1. **Documents with content are untouched** — the user's decision, pinned by the inverted e2e above.
2. **No scroll handling at all** (an empty document cannot be scrolled). If this is ever widened to
   real documents, scroll becomes a genuine problem again, and the ordering notes above are the
   starting point — do not add a blind `scrollTop = 0`.
3. **Not added to the SMOKE/FAST e2e tiers.** The spec is cheap (~10 s including VS Code boot), so
   promoting it is defensible; left out because tier membership is a suite-cost decision of its own
   (`test/vscode-e2e/playwright.config.ts`).

## See also

- `media-src/src/initial-caret.ts`, `media-src/src/finish-init.ts` (the wiring),
  `media-src/src/focus-restore.ts` (task 389 — the window-focus handler this composes with),
  `media-src/src/prerender-overlay.ts` (`bridgePrepaintScroll`, the ordering hazard),
  `media-src/src/gap-paragraph.ts` (`observeTrailingParagraph`, the EOF invariant),
  `media-src/src/source-map.ts` (`activeModeElement`).
- Fixtures + specs: `test/vscode-e2e/fixtures/caret-on-open-{empty,text}.md`,
  `test/vscode-e2e/caret-on-open-probe.spec.ts` (baseline), `test/vscode-e2e/caret-on-open.spec.ts`.
