# Task 239 — BUG: indented (4-space) code blocks destroyed by the IR save path

**Status: ✅ DONE (2026-07-27).** Fixed with option (b'), a third route the scope did not list and
the probes chose: repair the IR **DOM** before Vditor sees it, in the same layer as tasks 370/60
(`src/lute-block-repair.ts`). Neither a load-time source rewrite (a) nor a Lute/Vditor source patch
(b) was needed.

**Impact:** 🔴 high · **Origin:** task 192 §10 (broad sweep, probe-verified)

## The fix

`Md2VditorIRDOM` emits an indented block as a `data-type="code-block"` div with no marker spans,
where a ``` fence carries `code-block-open-marker` + an info span + `code-block-close-marker`.
`fenceIndentedCode` injects exactly those spans, so `VditorIRDOM2Md` writes a fence instead of
prose. IR now agrees with WYSIWYG, which has always fenced.

Three things the probes settled that the scope had not:

1. **A markerless code-block div is an indented block and nothing else.** Raw `<pre>` HTML, `$$`
   math blocks, `~~~` fences and YAML front matter all carry their own markers — checked, and each
   is pinned by a unit test.
2. **The fence must be sized to the content.** An indented block containing ``` re-parses as two
   fences with prose between them if the injected fence is a constant. `fenceFor` takes the longest
   backtick run + 1, minimum 3.
3. **WYSIWYG was NOT correct after all.** On that same input `Md2VditorDOM` writes the block's
   CONTENT into `data-marker` instead of a fence, and `VditorDOM2Md` turns one block into three —
   destroying the code. The task's premise ("WYSIWYG is CORRECT") holds only for the simple case.
   `normalizeWysiwygFenceMarker` fixes it, so this task closed a WYSIWYG defect it did not know about.

**Bytes on disk change** — four spaces become a fence — which is the honest, semantically-identical
diff option (a) was expected to carry. Nothing is lost, and the e2e pins that the FIRST save
normalizes and the second changes nothing more, so the file settles instead of churning.

## Evidence

- **Corpus, 1154 real-world markdown files** (the repo plus vendored Go-module docs, which is where
  legacy indented code actually lives — the repo's own docs use fences almost exclusively, so a run
  over them alone would have proved nothing): **29 files were losing code blocks before the fix, 0
  after.** Zero regressions: no file that round-tripped correctly before does anything different now.
- **e2e verified to FAIL without the fix** — all three specs go red on "the indented block is still
  code" when the repair is stubbed out.
- **Unit**, `test/backend/lute-block-repair.test.ts` — the pure string layer plus round-trips
  through the REAL vendored Lute in a `vm` sandbox.

## The SPLIT (sv) path — found later, while closing task 240's sv gap

sv already fenced an indented block, so it never had IR's "code becomes prose" defect. But it
**hardcodes ```**, which is the same bug Lute's WYSIWYG path had and this task already fixed there:
an indented block whose content holds its own fence comes back as

```text
```
```
inner fence
```
```
```

— one block re-parsing as an empty code block, prose, and another empty code block. Probed on
`test/vscode-e2e/fixtures/block-fidelity.md`. `fenceSvIndentedCode` sizes the fence to the content,
exactly as `fenceFor` does for the other two modes.

Telling the two shapes apart is clean and was probed, not assumed: a REAL fence puts its info span on
the open line (`<open>```</open><info>ts</info>`) and closes with a `code-block-close-marker`; an
INDENTED block has no info span after the open marker and closes with a `code-block-info` span
holding the fence. Only the marker TEXT is rewritten — sv's markdown is `element.textContent`, so the
text is the whole fix, and leaving `data-type` alone keeps Vditor's caret logic on ground it knows.

**Reachability, stated precisely.** Opening a file cannot hit this today: IR renders first and its
repair already turns the indented block into a correctly-sized fence, so sv is handed a fence. The
path that DOES reach it is **pasting** markdown containing an indented block into split mode —
`sv/processPaste` spins `blockElement.textContent`, i.e. the raw pasted text. So the fix is covered
by units (real vendored Lute: content with ``` and with ````, several blocks each sized
independently, and real ``` / ~~~ / `$$` blocks asserted byte-identical) but **not** by an e2e, and
the e2e that would cover it is a paste-into-sv case that does not exist yet. Recorded rather than
claimed.

## Problem

Probe-verified data loss in the DEFAULT mode: `Md2VditorIRDOM` emits an indented code block
WITHOUT open/close marker spans (unlike ``` fences), the first `SpinVditorIRDOM` degrades it
to `<p>`, and `VditorIRDOM2Md` serializes it as plain prose — the indent is gone, re-parse
gives a paragraph. Repro: `'para\n\n    code line\n    second'` → spin → `<p>code line\n
second</p>`. WYSIWYG is CORRECT (emits a fence); IR is the default (`Options.ts:47`,
not overridden) and the save path is `VditorIRDOM2Md` (`edit-sync.ts:54,78`). Open any
legacy/pandoc/email markdown with CommonMark indented code → edit anywhere → save →
every indented block in the doc becomes prose. Minimal-diff writeback can't mask it (the
region genuinely differs). Zero coverage: `torture.md` has no 4-space code.

## Scope

- [x] Pick the fix — neither (a) nor (b): repair the IR DOM between Lute and Vditor, which needs
      no source rewrite and no Vditor patch. See "The fix" above.
- [x] Add an indented code block to `test/vscode-e2e/fixtures/torture.md` (the canonical
      round-trip fixture — mode-roundtrip.spec picks it up for free).
- [x] L1 serialization unit via the Node-Lute recipe pinning the round-trip.
- [x] L3 regression: open → type elsewhere → save → the block is still a code block
      (`block-fidelity.spec.ts`). NOT byte-identical on disk, as the scope hoped: the block is
      normalized to a fence. Equivalent, stable, and not a loss — but a diff the user will see, so
      it is stated plainly rather than buried.

## Out of scope

- Auto-converting indented→fenced as a formatting feature (only fidelity).
