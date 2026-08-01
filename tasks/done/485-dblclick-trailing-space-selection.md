# Task 485 — double-click word selection includes the trailing space (Windows Chromium behaviour)

**Status:** ✅ CLOSED 2026-08-01, by user decision — earliest-hook trim shipped; the flicker is
SHORTER but still visible on the user's real (Windows-hosted, Remote-WSL) editor, and the user
chose to accept that residual rather than pursue the riskier full-reimplementation fix (see "Not
pursued" below) · **Impact:** 🟡 medium — user-reported, affects every editable/read surface (IR,
WYSIWYG, SV, Preview) · **Origin:** user report, 2026-08-01.

## Report

User: "dwuklik myszką w wyraz zaznacza ten wyraz i spację po nim" (double-click on a word selects
that word AND the space after it). Confirmed by the user to happen in all four surfaces (IR,
WYSIWYG, SV, Preview), not tied to a specific word/formatting.

## Investigation

Could NOT reproduce on this dev machine (Linux, xvfb) in either the chromium harness
(`media-src/e2e`) or a real-VS-Code Playwright session — double-click on a plain word, a word
before a comma, the last word in a line, and a WYSIWYG word all select exactly the word, no
trailing space, in both environments.

This matches a documented, Windows-specific Chromium/Blink behaviour: double-click word selection
extends to include trailing whitespace on Windows only (not Mac/Linux/ChromeOS) — see
[Vivaldi forum report](https://forum.vivaldi.net/topic/40496/don-t-select-space-after-the-word-when-double-clicking)
and [slate.js issue #3729](https://github.com/ianstormtaylor/slate/issues/3729) (same symptom,
Chrome AND Firefox, Windows 7). The user's env shows `microsoft-standard-WSL2` — consistent with a
Windows-hosted VS Code (Remote-WSL) whose webview inherits the Windows Blink editing behaviour.
Not proven with certainty (WSLg exists) — asked the user for a same-machine discriminator.
**Confirmed 2026-08-01**: the user reports VS Code's OWN BUILT-IN markdown preview — a webview with
none of this extension's JS — over-selects the same way. That closes the diagnosis: this is the
platform's editing behaviour, not anything this extension introduced.

Since the native trigger cannot be reproduced here, the fix instead corrects any selection that
includes trailing whitespace — a no-op on platforms that were already correct (Linux/Mac), and the
actual fix on Windows.

### Round 2 — visible flicker (user-reported, 2026-08-01)

The first version trimmed on `dblclick`. The user reported it visibly flashes the untrimmed
selection for a moment before the space disappears. Reasoning (not directly observable on this
machine — see the honesty note in Verification): `dblclick` only fires after the full
mousedown → [native word-select applied] → mouseup → click round trip through the browser's input
pipeline; Chromium's compositor can paint the over-inclusive selection during that round trip
before any page JS runs. `selectionchange` fires as soon as the native selection itself mutates —
earlier in that pipeline. Moved the trim to arm on the double-click's own `mousedown`
(`event.detail === 2`) and fire on the next `selectionchange`, disarming immediately after (and on
`mouseup` as a backstop) so an unrelated later selection change is never touched. Triple-click
(`detail === 3`, Vditor's own line/paragraph select) is deliberately excluded from arming.
`dblclick` stays wired as an idempotent fallback for whichever event a given browser fires first.
This narrows the window in which the browser could paint the wrong state; it cannot be proven from
this machine to eliminate it, since the flicker never reproduced here to begin with — that
judgement is the user's on their real editor.

## Scope

- [x] `media-src/src/editing/dblclick-word-select.ts` — document-level `dblclick` listener; if the
      resulting selection's end trails into whitespace, trim it back to the word boundary. Guards:
      same-text-node-only offset floor, bail on non-Text `endContainer`, bail if trimming would
      collapse a pure-whitespace selection, bail if the (possibly Vditor-rebuilt) end node is
      detached before re-applying the range.
- [x] Wire into `finish-init.ts` via `observers` (document-level, not `#app`/`previewEl` — survives
      `previewEl` being replaced wholesale, and covers all 4 reported surfaces with one binding).
- [x] Unit tests (`dblclick-word-select.test.ts`, jsdom): plain trailing-space trim, multi-node
      range (word split across text nodes by an inline marker), pure-whitespace dblclick (no-op),
      non-Text `endContainer` (no-op), detached end node after trim target computed (no-op),
      leading whitespace is never trimmed.
- [x] Real-VS-Code e2e (`test/vscode-e2e/dblclick-word-select.spec.ts`) — this is a **negative
      guard**, not a repro-and-fix test: this environment's native double-click never over-selects,
      so it cannot demonstrate the bug being fixed. What it proves instead: a real `dblclick()` on a
      plain word (IR + WYSIWYG) and on a formatted word (bold, inside IR) still selects exactly the
      word — the fix doesn't over-trim, collapse the selection, or fight Vditor's marker-expand
      rebuild. Plus one synthetic-selection test (construct an over-inclusive "word " range, dispatch
      `dblclick`, assert it trims) — proves the handler's DOM manipulation works inside a real
      Electron/Blink build, not just jsdom, but is NOT evidence the native Windows bug is fixed.
- [x] Discriminator answered: user's real (Windows-hosted, Remote-WSL) VS Code's own built-in
      markdown preview over-selects the same way — platform behaviour confirmed, not this
      extension's doing.
- [x] Round 2: moved the trim to the earliest available hook (`mousedown` detail=2 arms →
      `selectionchange` trims, `dblclick` kept as fallback) to narrow the visible-flicker window the
      user reported. Extended unit tests (arm/no-arm on detail 1/2/3, mouseup disarm, disarm-after-
      trim leaves a later unrelated selectionchange alone) — 17/17 green. Re-verified all real-VS-Code
      specs (dblclick-word-select ×3 repeats, sibling cut/paste specs, chromium mouse-selection incl.
      triple-click) — no regressions.
- [x] User judged the result on their real editor: the flash is still visible (shorter than round 1,
      not gone). Decision: leave it as-is — see "Not pursued" below.

## Not pursued

The remaining flicker can only be fully eliminated by preventing the browser's native double-click
word-select from ever applying (`preventDefault()` on the `mousedown` that has `detail === 2`) and
computing + applying the correct word range ourselves (e.g. via `Intl.Segmenter`). That guarantees
no wrong state is ever painted, but was not attempted: it means owning word-boundary correctness
ourselves — CJK/Unicode segmentation, punctuation clusters, clicks landing on `**`/`` ` `` markers,
whitespace-only clicks — and risks silently breaking Vditor's own marker-expand-on-double-click
behaviour (`mouse-selection.spec.ts:79`, this task's own bold-word spec), which currently reacts to
the *native* selection Chromium produces. The user, told this tradeoff explicitly, chose to keep the
lighter (and now proven-in-production, if imperfect) fix rather than take on that risk. Revisit only
if the residual flicker becomes a live complaint again — start from `Intl.Segmenter`-based word
computation, not a hand-rolled regex, and budget real time for the marker-expand interaction.

## Verification

- Unit: `npx vitest run --config test/vitest.config.ts media-src/src/editing/dblclick-word-select.test.ts`
  — 12/12 green. Full unit suite (`npx vitest run --config test/vitest.config.ts`) — 2622/2622
  green (was 2621; +1 new file broke `module-boundaries.test.ts`'s manifest-is-total check until
  `scripts/module-manifest.mjs` got the new `dblclick-word-select` entry, then green).
- Real-VS-Code: `xvfb-run -a npm --prefix test/vscode-e2e test -- dblclick-word-select.spec.ts
  --repeat-each=3` — 12/12 green (4 tests × 3 repeats, per
  `[[vscode-e2e-focus-tests-are-flaky]]`). Sibling-regression check — `cut-selection.spec.ts`,
  `cut-selection-sv.spec.ts`, `paste-over-selection.spec.ts` (10/10) and the chromium-harness
  `mouse-selection.spec.ts` (5/5) — all green, no regressions from the new document-level listener.
  Full fast tier (`npm run test:vscode:fast`) — 39/39 green.
- `npm run typecheck`, `npm run typecheck:vscode-e2e`, `npm run lint:ci` — all clean.
- `npm run quality` — `knip` FAILs on pre-existing, unrelated debt (none of its findings reference
  `dblclick-word-select`); `check:coverage-modules` flagged 2 unrelated modules
  (`diagram-zoom.ts`, `link-click-fix.ts`) as newly-covered from earlier commits on this branch —
  left as-is, out of scope (same pattern noted in task 484). All other stages PASS. New module's
  own coverage: 96.77% stmts / 92% branch / 100% funcs/lines.
- Simplify pass (code-simplifier subagent): added one missing JSDoc summary on
  `installDblclickWordSelectFix` (sibling modules using the same capture/dispose pattern all
  document it; this one didn't) — no behaviour change. Re-verified unit/typecheck/lint green after.
- **NOT verified**: the actual native-trigger repro/fix on Windows. This dev/CI machine (Linux,
  xvfb) never reproduced the reported over-selection to begin with (see Investigation above), so
  nothing here can prove the fix resolves it — only that it doesn't regress the platforms that were
  already correct. VSIX built (`npx @vscode/vsce package`) and installed via `code
  --install-extension` (confirmed target: "WSL: Ubuntu-24.04", corroborating the Windows-hosted
  Remote-WSL theory) — awaiting the user's confirmation + the Chrome/Edge discriminator answer.
