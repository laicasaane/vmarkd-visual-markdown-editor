# Task 240 — BUG: reference-link definition titles lost / leaked into prose on save

**Status:** planned — BUG, corruption class · **Impact:** 🔴 high · **Origin:** task 192 §10 (probe-verified)

## Problem

Probe-verified: `VditorIRDOM2Md(Md2VditorIRDOM('[a][r]\n\n[r]: https://e.com "T"'))` →
`'[a][r]\n\n[r]: https://e.com\n'` — the definition TITLE is dropped. Worse for image refs:
`![alt][r]` + titled def → `'![alt][r]"T"\n\n[r]: pic.png\n'` — the title is INJECTED into
body text as literal garbage. Same through `VditorDOM2Md` (wysiwyg). The save path runs this
serialization (`edit-sync.ts:78 serializeForHost`), so any hand-written README using titled
reference definitions silently mutates on open+edit+save.

## Scope

- [ ] Lute-side fix via the existing patch pipeline: the link-ref-definition renderer must
      emit ` "title"` and the image-ref renderer must NOT leak the title token into the
      inline text. Locate both in the vendored/bundled Lute (Node-Lute probing first to
      pin exact current behaviour per branch: link ref, image ref, single vs double quotes,
      `(parens)` titles).
- [ ] Fidelity corpus: add titled link-def + titled image-ref lines to
      `test/vscode-e2e/fixtures/torture.md` and a dedicated L1 round-trip unit (all title
      quote styles; defs with no title must stay byte-identical too).
- [ ] Audit the sibling behaviours while in there: ref-def ORDER and case preservation
      (`[R]:` vs `[r]:`) — pin whatever is already correct.

## Out of scope

- Reference-style link authoring conveniences (completion — task 32's territory).

## Verification

L1 round-trip units (Node-Lute) + L3: open a fixture with titled refs → type elsewhere →
save → defs byte-identical, no `"T"` in prose.
