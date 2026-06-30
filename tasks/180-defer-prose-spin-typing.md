# Task 180 — Defer the per-keystroke block rebuild for prose typing (the prose-side lever 175 left open)

**Status:** ✅ DONE 2026-06-30 — shipped DEFAULT ON (opt-out `vmarkd.advanced.fastProseEdit`). Conservative
predicate: skip only LETTERS (always inert in prose) + mid-token SPACE/DIGIT; EVERY markdown-active char
(`#*_`~[]()!<>|\&$=-`, marker-position space/digit, Enter/paste/IME/delete) falls through to the real
spin. Measured 104→0 ms typing-phase blocking on a 202-para doc; byte-correct save; structure intact;
headings/emphasis/lists still form. See *Implemented* below.
**Source:** user report 2026-06-29 — "jak piszę szybko w paragrafie, litery pojawiają się po kilka
sztuk" (fast prose typing → letters appear in batches). Measured the same day in real VS Code.
**Value / Risk:** 🟥 high *for prose typing on large docs* (near-native typing; the residual nobody
has touched) / 🟡 **re-rated from 🔴** after the 175 ship: the SAVE is structurally safe (getMarkdown
reads the live source text node), so a too-aggressive skip degrades to a ≤220 ms visual lag (the settle
reconciles), NOT a save corruption. The remaining risk is purely VISUAL/structural-reconcile + the wide
prose escape-hatch matrix.

## Prototype SPIKE measured 2026-06-30 (`test/vscode-e2e/prose-180spike.spec.ts`)
Reused the 175 mechanism: a flag-gated (`window.__vmarkdSpikeProseSkip`, default OFF, production-inert)
prose branch in `trySkipFenceSpin` (edit-activity.ts) + the spike predicate `shouldSkipProseSpin`
(spin-skip-fence.ts — for the measurement, skips only a plain LETTER typed mid-text). Same settle re-spin.

**Measured, large prose doc (202 paragraphs), real VS Code:**
- typing-phase blocking **OFF=160 ms → ON=4 ms** (worst freeze 45→21) — **~40× less blocking**, near-native.
- paragraphs **202→202** (structure intact after the settle re-spin); both bursts' chars **round-trip
  byte-correct** to the host TextDocument.

⇒ The user's original prose-batching complaint is fixable with the 175 mechanism. **Ceiling confirmed.**

## Implemented 2026-06-30
- `shouldSkipProseSpin` (`spin-skip-fence.ts`): skip a single LETTER (inert in prose — can't start a
  block marker; content inside any inline token) or a mid-token SPACE/DIGIT (preceded by alphanumeric,
  so it can't commit `## `/`- `/`1. ` or start a leading marker). All other chars fall through.
- Reuses the task-175 machinery: the prose branch in `trySkipFenceSpin` (edit-activity.ts) gated on
  `window.__vmarkdFastProseEdit !== false`, same settle re-spin; the esbuild `patchIrFenceSpinSkip`
  early-return; config `vmarkd.advanced.fastProseEdit` → protocol → collectConfigOptions → window flag.
- Tests: unit matrix in `spin-skip-fence.test.ts` (letters/heading/li skip; `#*_`~[]()!|>` + space@marker
  + digit@0 fall through; not-in-fence; Enter/paste/multi-char) + manifest. Real-VS-Code
  `prose-180spike.spec.ts`: 104→0 ms perf + byte-correct save + intact paragraph count, AND a heading
  (`## Heading`) still forms with the skip ON (structural chars fall through). Gates: typecheck · unit · lint.
- **Caveat (cosmetic, self-healing):** while typing continuously, an inline construct being formed by
  letters (e.g. the inner letters of `*bold*` before the closing `*`) renders ≤220 ms late (on the
  settle). Non-corrupting (save reads the text node); the closing delimiter is a non-letter → spins.
- **Follow-up (not blocking):** widen the safe set (e.g. more in-word punctuation) if profiling shows
  spaces/digits still hitch; deep undo/redo round-trip across many skips.

## Earlier-spike notes (what the letters-only prototype did NOT yet handle — now resolved by falling through)
The spike skips only mid-text LETTERS. Production 180 needs the **full prose escape-hatch matrix** — far
wider than a fenced body, because nearly any char can be structural in prose:
- line-start / block-start markers: `#`→heading, `-`/`*`/`+`→bullet, digit+`.`→ordered list, `>`→quote,
  `---`→hr, `    `→indent code; the SPACE that commits `## `/`- `/`1. ` (Vditor's space fast-path);
- inline tokens that COMPLETE a construct: the 2nd `*`/`_` of emphasis, `` ` `` code, `]`/`)` of a link,
  `~`/`=`/`|` (table), `\\` escape, `&`…`;` entity, `<` html, `!` image;
- Enter/insertParagraph, paste, IME, delete*, non-collapsed range (already fall through via inputType).
Plus: caret position sensitivity (skip only when NOT adjacent to a marker the char would extend), and
the deep undo/redo round-trip across many skips. Ship behind `vmarkd.advanced.fastProseEdit` (consider
default OFF until the matrix is green, unlike 175 which is narrow enough to default ON).
**Engines:** none — this is the plain-paragraph / prose editing path (distinct from task 172's
diagram-block embedded-SVG spin and task 175's fenced-body skip).

## Measured evidence (2026-06-29, real VS Code, `test/vscode-e2e/perf-prose-typing.spec.ts`)

A/B: one fast burst (30 chars, 15 ms apart) into a plain paragraph, on a SMALL vs LARGE prose-only doc
(no diagrams). Wrapped `SpinVditorIRDOM` (input length + wall-ms) + an rAF-gap blocking sampler +
direct timing of the 3 sync before-paint observer walks.

| doc | DOM nodes | headings | spin median | spin input | sync observers | **blocking / burst** | worst freeze |
|---|--:|--:|--:|--:|--:|--:|--:|
| small | 19 | 6 | 2.0 ms | 74 chars | 0.02 ms | **137 ms** | 38 ms |
| large | 605 | 201 | 1.5 ms | 74 chars | 0.05 ms | **633 ms** | 73 ms |

- **Spin is cheap and FLAT** (~1.5 ms, input 74 chars — block-scoped regardless of doc size). NOT the cause.
- **Our sync observers are negligible** (~0.05 ms). NOT the cause.
- **Blocking scales with document size** (137 → 633 ms, ×4.6) while spin/observers stay flat ⇒ a
  **doc-scoped per-keystroke cost that is neither the spin nor our code**. On the large doc that's
  ~20 ms/keystroke ≈ **one dropped frame per letter** → fast keys queue → the browser paints them in
  batches (the reported symptom).
- **Mechanism:** the ~20 ms "other" is Vditor's intrinsic per-keystroke pipeline AROUND the spin —
  chiefly `blockElement.outerHTML = html` (tear down + rebuild the edited block) + `setRangeByWbr`
  caret restore (`ir/input.ts`), which forces a **synchronous whole-document reflow**, O(doc size).

## Premise (why deferring is safe for the save path)

The spin/rebuild is **serialization-independent**: `processAfterRender` (`ir/process.ts`) debounces
`getMarkdown` (serializes `ir.element.innerHTML` → the typed char already lives in the live text node)
+ undo on `undoDelay`, **independent of the spin**. So if we skip the per-keystroke rebuild, the saved
markdown stays byte-correct (native contenteditable already inserted the char into the DOM that
`getMarkdown` reads) — exactly the property task 175 relies on for fenced bodies. The only thing the
spin produces that we'd defer is the **re-render of completed markdown tokens** (`**bold**` → bold,
`## ` → heading) and text-node normalization.

## Two approaches — spike A first (lower risk), fall back to B only if A's latency is unacceptable

### A. Debounce the spin/rebuild through the existing edit-activity gate (RECOMMENDED)
Treat prose like task 161 treats diagrams: while a burst is in flight (`isTyping()`, the 220 ms
`QUIET_MS` quiet-timer in `edit-activity.ts`), **skip** Vditor's spin + `outerHTML` rebuild and let the
native contenteditable carry the visual; run **exactly one** real `SpinVditorIRDOM` on the settle
(pause) to reconcile structure + render tokens, restoring the caret (`caret-preserve.ts`).
- **Always reconciles** on the pause → no per-char correctness predicate to get exhaustively right
  (the big advantage over B). Structure can only be wrong *during* a continuous burst, and is fixed
  within `QUIET_MS` of you stopping.
- **UX trade-off (must judge with the user):** during a long continuous burst, just-completed
  formatting (bold/italic/heading) won't render until you pause — same trade task 161 made for
  diagrams ("updates shortly after you stop typing"). For plain prose (typing words) this is invisible;
  it only shows if you type a whole formatted span without pausing.
- **Escape hatches that force an IMMEDIATE spin (no defer)** — block-structure events where deferring
  would misplace the caret or corrupt the view: `insertParagraph`/Enter, paste/drop, IME composition
  (`composingLock`, `ir/index.ts`), Backspace/Delete at a block boundary, the space-path block
  transforms (`ir/input.ts` startSpace/endSpace), Tab/list operations.
- **Mechanism = an esbuild patch in `input()` early-returning to `processAfterRender`** when
  `isTyping()` and not an escape hatch — NOT a capture-phase cancel (which would orphan the
  serialize/undo timer). Mirror `patchIrDeferDiagramRender`'s anchor-asserted style.

### B. Per-char structurally-inert skip (175's mechanism, extended to prose) — only if A lags
Skip the spin only for a single keystroke proven structurally inert, render-on-pause as in A, but
WITHOUT the burst-wide formatting delay (completed tokens still render promptly because non-inert
chars fall through to a real spin).
- **The hard part = the escape-hatch predicate for PROSE** (far wider than 175's fenced-body set):
  ANY markdown-significant char must fall through to a real spin — `# * _ ` ` ` ~ [ ] ( ) ! < > | \\
  - + = : & "` , a leading digit (`1.` ordered list), a space (block transforms / setext / `- `),
  plus position sensitivity (start-of-block, adjacent to an existing marker that the char would extend
  into a token). Realistically only a mid-word letter qualifies; the predicate is the deliverable and
  the risk.
- Higher correctness risk than A for a smaller marginal latency win → **do A first**.

## Constraints (exhaustive — a miss = the DOM diverges from the markdown)
- **Save stays byte-identical** — verify `getValue()`/`serializeForHost()` reflect every typed char
  with the spin deferred (it should: native insert lands in the live text node `getMarkdown` reads).
- **Caret survives the single settle rebuild** (`caret-preserve.ts`) — the spin reassigns the block's
  `outerHTML`; restore the collapsed caret to the same text offset.
- **Undo/redo round-trips** — `addToUndoStack` snapshots a possibly-un-normalized DOM between skips.
- **One real spin on the settle** to normalize browser-split text nodes (typing splits text nodes).
- **`sv` mode is out of scope** (raw textContent, no Lute). WYSIWYG (`wysiwyg/input.ts`) is a separate,
  parallel patch site if we extend there — scope to IR first.
- Does **not** touch task 172 (diagram blocks) or 175 (fenced bodies) — orthogonal levers; this is the
  prose path. Stacks cleanly with both.

## Verification (per AGENTS — real-VS-Code MANDATORY, heavy)
- **Before/after the measurement spec** `test/vscode-e2e/perf-prose-typing.spec.ts` (large doc
  `blockingMs` must drop sharply; assert the drop).
- **Correctness matrix in real VS Code:** type prose that COMPLETES tokens mid-paragraph
  (`**bold**`, `*i*`, `[a](b)`, `` `c` ``, `~~s~~`), start-of-line `## `/`- `/`1. `/`> `/`---`, Enter,
  paste, IME, Backspace at boundary, an emoji/Unicode char — each must end with the SAME rendered DOM
  and SAME saved markdown as today (defer must be invisible once settled).
- **Byte-identical save** + **undo/redo** on a prose fixture.
- Anchor-guarded esbuild patch (drift-throw) + unit test for the gate/predicate; **ship behind a flag**
  (e.g. `vmarkd.advanced.fastProseEdit`, default off until the matrix is green).
- `tsc` + `biome` + vitest + Playwright headless. Verify coverage.

## See also
- **Sibling:** task 175 (fenced-body spin-skip — explicitly excludes prose), task 172 (strip the
  embedded preview SVG from the diagram-block spin — the diagram path), task 161 (the 220 ms
  edit-activity debounce gate this reuses), task 171 (the §1 prose lever that was deferred to here).
- `ir/input.ts` (`SpinVditorIRDOM`, `blockElement.outerHTML`, `setRangeByWbr`, space-path),
  `ir/index.ts` (`composingLock`), `ir/process.ts` (`processAfterRender`), `media-src/src/edit-activity.ts`
  (`isTyping`/`deferUntilSettle`/`QUIET_MS`), `caret-preserve.ts`, `media-src/esbuild-shared.mjs`
  (`patchIrDeferDiagramRender` for the patch style), `test/vscode-e2e/perf-prose-typing.spec.ts`
  (+ fixtures `perf-prose.md`, `perf-prose-small.md`).
- Memory `prose-typing-lag-vditor-rebuild-reflow` (the measurement), `diagram-edit-debounce`,
  the `vmarkd-lute-features` skill (`SpinVditorIRDOM`, serialize independence, the Node-Lute probe).
