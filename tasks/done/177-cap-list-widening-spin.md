# Task 177 — Cap the list-widening that turns a one-char list edit into a whole-list spin (needs-spike, deprioritized)

**Status:** CLOSED 2026-08-29 — **REJECTED / ABANDONED after negative spike evidence** (no optimization shipped).
**Source:** vMark edit-responsiveness analysis (2026-06-28, workflow `wf_2c64003e-264`).
**Value / Risk:** 🟦 low (only "typing inside a long/nested list" benefits) / 🔴 high (loose/tight + ordinal correctness; can drift the task-69 save round-trip).
**Engines:** none.

## Problem

`ir/input.ts:118-122` (`getTopList`) + `:136-147` widen the spin input to the **entire top-level
list plus adjacent UL/OL siblings** on ANY edit inside a list item (`getTopList` →
`hasClosest.ts:48-56` walks to the **outermost** UL/OL). So on a long/nested list `SpinVditorIRDOM`
re-parses the **whole list every keystroke** — the same cost class as a whole-document spin,
triggered by ordinary typing.

## ⚠️ Why the obvious fix is WRONG (do NOT ship "spin only the edited `<li>`")

The widening is Vditor's **deliberate correctness mechanism**, not waste. `ListData.Tight`
(loose/tight, blob `@1523759`, 34 `Tight` occurrences) and ordered-list `Start`/`Num`/`Delimiter` are
**whole-list AST properties** that Lute re-derives on every cold `Parse`:
- a lone-`<li>` spin re-derives `Tight` from that item alone → the edited item **flips to tight while
  siblings stay loose**;
- it re-derives ordinals from a one-item list → **wrong `Start`/`Num`**.

Because task 69's save-path incremental serialize **also** re-spins blocks, that divergence can leak
into the **byte round-trip**, not just the visual DOM. Also: inline-formatting triggers (`*`, `` ` ``,
`[`, `_`) are `insertText` too and **must still spin to render live**, so narrowing must spin the
`<li>` (not skip) — and spinning a lone `<li>` hits the loose/tight + ordinal divergence.

**Crucially, this misses both stated targets:** a diagram source is a `code-block`
(`getTopList` returns nothing) and prose isn't a list — so only "typing in a long/nested list"
benefits.

## Plan (IF spiked at all — narrow subset only)

1. For non-boundary `insertText`/`deleteContent`, skip **only** the adjacent-UL/OL sibling merge
   (`:136-147`) — that merge only matters for ops that can fuse/split lists. Bounded, low-risk, but
   it does **not** cut the dominant cost.
2. Test whether spinning the **immediate** containing UL/OL (replace `getTopList` with
   `hasClosestByTag` one level) is **byte-identical** across a corpus of ordered / nested / loose
   lists. **If even that flips tightness relative to the parent item, abandon.**

## Constraints
- Caret is preserved via the `<wbr>` inside whatever fragment is spun (caret is not the risk —
  **structural correctness** is).
- The `:136-147` merge-skip must keep the existing dedupe correct: a newly-typed ref-def/footnote is
  pulled into the spun html at `:159-172` and Lute dedupes — gate must only skip when the edited block
  is genuinely non-ref/non-footnote and the spin appended nothing.
- Round-trip must stay byte-identical (this is exactly what's at risk → the spike's gate).
- Off-thread is N/A (this is about WHAT html to spin, not WHERE).

## Verification
- **Spike gate:** byte-identical round-trip across ordered-renumber / nested / loose-vs-tight / the
  documented gap-paragraph corpora — in the Node-Lute harness AND a real-VS-Code e2e matrix.
- If any case flips tightness/ordinals → abandon.
- `tsc` + `biome` + vitest + Playwright, headless. Verify coverage.

## 2026-08-29 spike result — rejected

The queue's kill rule fired. The candidate was removed completely; this task closes with evidence
only and no runtime, build-patch, test, or generated-output change.

### Candidate that was tested

- Only a one-character `insertText` was considered. Delete, Enter/`insertParagraph`, paste/drop,
  IME/composition, multi-character input, and reference/footnote documents retained Vditor's stock
  outermost-list plus adjacent-list path.
- The experiment captured the caret state before Vditor inserted `<wbr>`, spun the immediate
  containing `UL`/`OL`, and skipped adjacent-list merging. The obvious lone-`li` variant remained
  explicitly rejected.

### Positive evidence before the kill case

- A temporary Node/Lute differential harness compared stock outermost+adjacent, outermost-only,
  immediate-list, and lone-`li` spins. Ordered starts, tight/loose ordered and unordered nesting,
  mixed/deep nesting, gap paragraphs, blockquote nesting, and top-level adjacent list types initially
  produced exact stock Markdown and HTML under immediate scope, with one `<wbr>` caret retained.
  The lone-`li` negative control changed HTML and (for the ordered/loose cases) Markdown, proving the
  harness could detect the known unsafe proposal.
- A temporary real-VS-Code matrix captured stock spin inputs of 290, 352, 276, 378, and 204 bytes.
  The candidate reduced them to 150, 186, 149, 175, and 104 bytes respectively. Across those cases,
  host text, saved disk bytes, list `data-tight`/`data-marker`/`start`, DOM structure, and caret landing
  matched the captured stock result. Enter still used the full two-list path, and documents containing
  link-reference or footnote blocks fell back to stock.

### Decisive negative evidence

The missing nested-adjacent shape was:

```markdown
- parent
  - nested TARGET
  1. nested ordered sibling
- outer sibling
```

The independently reproduced Node/Lute comparison showed:

- serialized Markdown stayed equal, so a Markdown-only assertion would give false confidence;
- stock outermost-list spin produced a **loose** outer `UL` (`data-tight` absent) with the required
  paragraph wrappers;
- immediate-list spin left the outer `UL` **tight** (`data-tight="true"`) with bare item text;
- therefore live DOM structure diverged even though current saved bytes did not. A following edit can
  observe that stale parent tightness, exactly the task's forbidden structural drift.

Independent review also found that Vditor calls `input()` from the post-mutation `input` event using
the current selection. A character typed over a non-collapsed multi-item selection arrives with a
collapsed post-edit Range, so the candidate could not reliably distinguish a safe caret insertion
from a boundary-spanning replacement without adding a separate `beforeinput` state channel and a much
larger proof surface.

Per the explicit rule "if tightness, ordinals, caret, structure, or round-trip bytes drift, abandon",
no attempt was made to rescue a smaller patch after the structural failure. The low-value,
deprioritized optimization remains unshipped; Vditor's full outermost+adjacent correctness mechanism
is unchanged.

### Closure verification

- Candidate build-patch and temporary Node/real-VS-Code matrix files were removed; `git diff` returned
  to only this task record/index plus the protected unrelated `LICENSE` and untracked operator file.
- `node build.mjs` passed after removal, restoring ignored generated output to the stock tree (main
  bundle 502.0 KB).
- No new `npm run quality` was run for this documentation-only negative closure. The unchanged runtime
  is commit `4f4e066`, whose final aggregate quality gate already passed all eight stages with 224
  files / 3,134 tests; Task 177 added no shipped code or tests.
- Per the queue budget, no full Chromium, FAST, or full real-VS-Code suite was run. The temporary
  focused real-VS-Code stock/candidate matrix ran with `--retries=0` and was removed after recording
  the decision-grade evidence above.

## See also
- **Lowest priority of the survivors** — sequence behind every lever that touches the actual
  diagram-source / prose hot path (171, 172, 173). Pairs opportunistically with task 171 §2's
  dropped ref-def/footnote merge-skip.
- `ir/input.ts`, `util/hasClosest.ts`, task 69 (incremental serialize — what the divergence would
  corrupt); the `vmde-lute-features` skill (`ListData.Tight`, the Node-Lute probe).
