# Task 240 — BUG: reference-link definition titles lost / leaked into prose on save

**Status: ✅ DONE (2026-07-27) — all three edit modes.** Fixed in `src/lute-block-repair.ts`,
alongside task 239 — same layer, same wiring. IR and WYSIWYG landed first; the SPLIT (sv) path was
found still broken by the full suite and closed in a follow-up commit.

**Impact:** 🔴 high · **Origin:** task 192 §10 (probe-verified)

## The split (sv) path — found by the suite, fixed separately

The first commit wired the repair into `Md2VditorIRDOM`/`SpinVditorIRDOM`/`Md2VditorDOM`/
`SpinVditorDOM` but **not** into the sv pair, so `mode-roundtrip.spec.ts` failed hard on all
retries: `ir → wysiwyg → sv → ir` re-dropped `[imgref]: pic.png 'Image Title'` AND re-leaked
`![the image][imgref]"Image Title"` into the prose. Split mode had both defects, untouched.

Probing first (as the gap note required) showed the sv DOM is structurally different enough that the
IR repairs cannot be reused, so `dropSvRefTitleMarkers` / `restoreSvRefDefTitles` are separate:

- **sv is a SOURCE view.** `getMarkdown` returns `sv.element.textContent` verbatim (Vditor's
  `markdown/getMarkdown.ts`) — there is no `VditorSVDOM2Md` at all. So the text these spans hold IS
  the saved file, and a DOM repair lands directly in it.
- **The defs block is a span soup, not a div of text.** `<span --bracket>[</span>` +
  `<span --link data-type="link-ref-defs-block">LABEL</span>` + `<span --bracket>]</span>` +
  `<span>: </span>` + DEST as a bare text node. `restoreRefDefTitles`'s line-splitting has nothing to
  split, hence a separate scan.
- **`SpinVditorSVDOM` takes MARKDOWN, not HTML** — unlike the IR/WYSIWYG spins. Vditor calls it with
  `blockElement.textContent` (`sv/process.ts`) or the whole document (`toolbar/EditMode.ts`).
  Probed: `SpinVditorSVDOM(md) === Md2VditorSVDOM(md)`, so one repair with the argument as its own
  source oracle serves both entry points, and no `Md2HTML` oracle is needed. The per-block spin is
  safe: a block with no definition in it simply finds nothing to restore.
- **The leak discriminator is different too.** A title is only expressible inline inside a link/image
  paren form, and sv closes that form with a `--paren` span right after the title (probed for
  `![a](p.png "T")`, `[a](u "T")`, `[a](<u v> "T")`). So a title marker NOT followed by that closing
  paren is the leak — where IR tells them apart by the absence of `--paren` markers in the node.
- `renderForMode` (`lute-host.ts`) needed nothing: it already returns `undefined` for sv.

Only the block repairs are wired to sv. The gap repairs (`restoreCellGaps`, `dropInsertedCodeGaps`)
pre-check for `<td>` and `<code data-marker=`, neither of which sv's span soup ever contains.

NOTE: the fixture change that exposed this (titled definitions added to `torture.md`) is correct and
stays — it did its job.

## Known sv normalizations, recorded not fixed

Probed while fixing the above; all pre-date this task and none loses content the way the title did:

- `<https://e.com>` (autolink) renders as `[https://e.com](https://e.com)` — sv expands it. Not in
  `torture.md`, so the round-trip does not see it.
- `![a][]` (collapsed reference) comes back as `![a]` (shortcut). Same rendering, different bytes.
- A title's leading whitespace is normalized to ONE space, so `[r]: u    "T"` opens as `[r]: u "T"`.
  This is a visible byte change in a *source* view, but it matches the shipped IR/WYSIWYG behaviour
  (`sourceDefs` normalizes it for all three), so the three modes stay consistent with each other.

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

Unit round-trips through the real vendored Lute (`test/backend/lute-block-repair.test.ts`, 79) for
every form above — including a dedicated sv block asserting on the HTML Lute builds (title span
restored, leak span gone, inline `(…)` titles and footnote definitions byte-identical) — plus
`block-fidelity.spec.ts` and `mode-roundtrip.spec.ts` in real VS Code. **Both verified to FAIL
without the fix**: stubbing the sv wrappers out of `patchLuteGapRepair` and rebuilding turns
`mode-roundtrip` red again on all retries, which is what proves the wiring and not just the
transform. Corpus: 2 files in the 1154-file sweep had their definition titles restored, 0
regressions.

`mode-roundtrip.spec.ts` is now in the FAST tier — it is the only net that crosses all three modes,
and it is what caught this.

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
- [x] All three edit modes, not two — the split (sv) path is covered by its own repairs; see "The
      split (sv) path" above.

## Out of scope

- Reference-style link authoring conveniences (completion — task 32's territory).

## Verification

L1 round-trip units (Node-Lute) + L3: open a fixture with titled refs → type elsewhere →
save → defs byte-identical, no `"T"` in prose.
