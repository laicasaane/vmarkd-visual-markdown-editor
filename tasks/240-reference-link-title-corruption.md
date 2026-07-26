# Task 240 — BUG: reference-link definition titles lost / leaked into prose on save

**Status: ✅ DONE (2026-07-27).** Fixed in `src/lute-block-repair.ts`, alongside task 239 — same
layer, same wiring, one commit.

**Impact:** 🔴 high · **Origin:** task 192 §10 (probe-verified)

## The fix, and why it is NOT the Lute-side one the scope proposed

The scope assumed the renderers were at fault. Probing showed the loss happens earlier, in the
md → DOM direction, and that the DOM can carry the correct form:

- **The definitions block is verbatim TEXT.** `Md2VditorIRDOM` renders it as
  `<div data-type="link-ref-defs-block">[r]: https://e.com\n</div>` — title already gone. Put the
  title back into that div and `VditorIRDOM2Md` emits it. So `restoreRefDefTitles` restores it from
  the source rather than patching a Go renderer.
- **It does not survive a spin**, because spin is DOM → md → DOM and the md → DOM half strips it
  again. That is why the SPIN entry points are wrapped too, with `VditorIRDOM2Md(input)` as the
  source oracle — without that, the title came back on open and vanished on the first keystroke.
- **The image leak is a stray marker span**, not a serializer bug: Lute puts a `--title` marker
  INSIDE the img node for a reference image, where the inline source has no title at all.
  `dropRefImageTitleMarkers` removes it, telling a reference image (no `--paren` markers) from an
  inline one (`![alt](p.png "T")`, whose title is genuine).

The restore is deliberately conservative: a source definition is substituted only when the emitted
line is exactly that definition MINUS its title, so the repair can only ever ADD a title back and
can never smuggle a destination change in behind one.

## Sibling behaviours audited (scope item 3)

- **Definition ORDER and label CASE** — already correct, both modes. Pinned by a test.
- **All three title quote styles** — `"…"`, `'…'`, `(…)` — were all dropped, all now restored.
- **Untitled definitions** stay byte-identical; a title is never invented.
- **Collapsed / shortcut reference forms** (`![a][]`, `![a]`) leaked the title too, and are fixed.
- **Two things left alone, on purpose:** a destination in `<angle brackets>` still loses them
  (a normalization, not a loss — and restoring it would mean rewriting the destination, which the
  guard above forbids), and a definition whose title sits on the FOLLOWING line is not restored
  (the div does not contain that line; guessing it would be worse than leaving it).

## Evidence

Unit round-trips through the real vendored Lute (`test/backend/lute-block-repair.test.ts`) for
every form above, plus `block-fidelity.spec.ts` in real VS Code — **verified to FAIL without the
fix**. Corpus: 2 files in the 1154-file sweep had their definition titles restored, 0 regressions.

## Problem

Probe-verified: `VditorIRDOM2Md(Md2VditorIRDOM('[a][r]\n\n[r]: https://e.com "T"'))` →
`'[a][r]\n\n[r]: https://e.com\n'` — the definition TITLE is dropped. Worse for image refs:
`![alt][r]` + titled def → `'![alt][r]"T"\n\n[r]: pic.png\n'` — the title is INJECTED into
body text as literal garbage. Same through `VditorDOM2Md` (wysiwyg). The save path runs this
serialization (`edit-sync.ts:78 serializeForHost`), so any hand-written README using titled
reference definitions silently mutates on open+edit+save.

## Scope

- [x] Fix the two defects — **not** Lute-side: the DOM repair described above needs no patch to the
      vendored Lute, and works for both the IR and WYSIWYG paths.
- [x] Fidelity corpus: titled link-def + titled image-ref lines added to
      `test/vscode-e2e/fixtures/torture.md`, plus a dedicated L1 round-trip unit (all title quote
      styles; defs with no title stay byte-identical).
- [x] Audit the sibling behaviours — order and case were already correct and are now pinned; see
      "Sibling behaviours audited" above.

## Out of scope

- Reference-style link authoring conveniences (completion — task 32's territory).

## Verification

L1 round-trip units (Node-Lute) + L3: open a fixture with titled refs → type elsewhere →
save → defs byte-identical, no `"T"` in prose.
