# Task 189 — cross-diagram edit stability (user report: markmap dots, smiles panel)

> **Status:** ✅ DONE (2026-07-03). User report after installing 187: (1) "po wyedytowaniu
> echarts pojawily sie jakies kropki pod markmap (tak samo jak edytowalem wavedrom)" —
> a growing markmap svg with stray nodes after editing ANY other diagram; (2) "smiles ma
> tlo bloku zamiast przezroczystego". Directive: build tests that edit one diagram and
> verify nothing breaks anywhere else. All three root causes fixed; the permanent
> cross-edit net is `test/vscode-e2e/cross-diagram-edit.spec.ts`.

## Root causes (each reproduced, then fixed)

1. **markmap duplication** — Vditor's `markmapRender` CHECKS `data-processed` but never
   SETS it, and after the first render it REMOVES the original code node — so on every
   later `afterRender` pass the selector matches the RENDER div itself and re-renders
   its own output (duplicate `.language-markmap` divs, huge svg, stray node squares —
   the user's "kropki"). Harmless before task 187 only because the whole preview pane
   was rebuilt from raw HTML every settle; the morph keeps rendered DOM alive, exposing
   the non-idempotent adapter. Fix: `patchMarkmapStatic` now also marks the render div
   `data-processed="true"` (fail-loud anchor). Reproduced by the net: ONE prose edit →
   markmap els 1→2; green after.
2. **Phantom svg in d2** — `codeRender` decorates every fresh `pre > code` with a copy
   button; the `<pre>` inside a d2 `|md|` label (task 154) renders async, so a LATER
   pass found it "fresh" and injected the button INTO the diagram (the earlier
   task-187 census "13th svg"). New `patchCodeRenderSkipDiagram`: the filter skips
   `e.closest("svg, .vmarkd-d2-md")` — diagram output is not a copyable code panel.
   (The task-187 CSS hide of `.vmarkd-d2-md .vditor-copy` stays as belt.)
3. **smiles code panel in the Preview pane** — the `<code>`-strip rule
   (`… :is(.vditor-ir__preview, .vditor-wysiwyg__preview, .vditor-preview) > code:is(…)`)
   used a CHILD combinator, but the full/split Preview wraps the code in a `<pre>`
   (`.vditor-preview pre > code.language-smiles`) — so smiles kept the inline-code box
   (`--vmarkd-code-bg` + padding + radius; the user's screenshot). IR and WYSIWYG were
   probed clean (incl. after edits — the flatten-repair structure is fine); only the
   pre-wrapped Preview form was missed. Fix: `.vditor-preview pre` added to the `:is()`
   list. The first fingerprint missed it because it measured the PRE's background —
   the net now asserts the diagram ELEMENT's own background too.

## The permanent net — `cross-diagram-edit.spec.ts` (real VS Code)

Opens all-renderers in the split view, fingerprints all 14 diagram families
(element/svg/canvas/copy-button counts, summed height, the wrapping `<pre>`'s AND the
element's own background), then performs three edits — prose, INSIDE the echarts source
(the user's exact repro), INSIDE the wavedrom source — asserting after each that every
OTHER family is unchanged (counts exact, height within 15%, backgrounds identical), and
finally that every family sits transparent (no code panel). This is the regression net
for the whole "editing X breaks Y" class; extend LANGS/edits as new engines land.

## Gates

- [x] cross-diagram-edit.spec green (was RED on markmap 1→2, then RED on d2 12→13,
      then green after each fix — the net caught both before the CSS fix landed)
- [x] patch tests: markmap idempotence rewrite + codeRenderSkipDiagram apply/throw
- [x] unit suite 1187/1187; typecheck clean; lint gate clean; build patch-coverage green
- [x] sv-split + parity re-run green (insurance for the morph/preview interplay)
