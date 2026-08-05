# Task 496 — No caret position between an `<hr>` and an adjacent code block / front matter

**Status:** done (2026-08-05), then **superseded the same day by [292](292-void-block-interaction.md)** — see the section at the bottom before using anything below as a map of the tree · **Impact:** 🟡 med (a slot of the document was unwritable) · **Origin:** user report — "nie da się strzałkami wjechać pomiędzy hr i code block/frontmatter block w IR mode"

## Problem

`text / --- / ```js` had NO reachable caret position between the rule and the fence, in either
direction — so there was no way to write anything there at all:

- **Arrowing across the rule** (`hr-nav.ts`, task 100) stepped the caret from the paragraph above
  the rule straight INTO the code block, `preventDefault` + `stopImmediatePropagation` included —
  so Vditor's own splice (`insertAfterBlock`/`insertBeforeBlock`, the transient `<p>`
  `gap-paragraph.ts` reclaims) never even ran.
- **Without that step-across** there is still nothing: Vditor's splice only fires from INSIDE a
  code block, and its "is the neighbour spliceable" test is `tagName === 'TABLE' || data-type` —
  an `<hr>` is neither, so it takes the `selectNodeContents(hr)` branch instead, which is exactly
  the caret-dropped-on-a-void-rule bug task 100 exists to prevent.
- **Enter is no escape** either: from inside a code block it adds a code line, from inside front
  matter it edits the YAML.

Measured in the chromium harness (`media-src/e2e/hr-gap.spec.ts` as a probe first): with the
fixture `front-matter | hr | p | hr | code-block | hr | p`, ArrowDown traced `2:p → 4:code-block`
and ArrowUp `4:code-block → 2:p` — the block chain never changed, i.e. no landing node was ever
created. Same across front matter ↔ rule. IR and WYSIWYG alike (`hr-nav` is wired against
`activeModeElement`).

## Fix

A rule next to an **atomic** block (`isAtomicBlock`, `trailing-paragraph.ts` — the existing
"not a plain editable text block" blacklist that the trailing invariant already used) leaves a slot
that has to be manufactured. `hr-nav.ts` now stops the crossing there instead of stepping the whole
way across:

- `gapSlot(block, target, down)` (pure, unit-tested) decides where: adjacent to the atomic block on
  the rule's side. The block being LEFT wins over the one being ENTERED — it's the nearer of the
  two in the travel direction, and the far slot is reached by the next arrow press.
- The spliced `<p>` carries `data-vmarkd-gap` (`GAP_ATTR`) + a ZWSP seed (task 439: a collapsed
  Range in a genuinely empty element is unpaintable). `cleanupGapParagraphs` reclaims it once the
  caret leaves it still empty — the tag is what makes it self-cleaning, since its neighbours (a
  rule, front matter, a table) are outside `isGapNeighbour`'s code-block/callout set. Task 486's
  Enter-built-chain guard was hoisted above it so a deliberate blank-line chain started in the gap
  still survives.
- Nothing changes between plain text blocks — `Enter` already opens a line there.

Attributes are invisible to Lute's serializer, so an untouched gap round-trips to nothing: verified
by asserting `getValue()` is byte-identical after arrowing through.

## Checklist

- [x] `isAtomicBlock` extracted in `trailing-paragraph.ts` (`endsWithBlock` now reuses it)
- [x] `gapSlot` + gap splice in `hr-nav.ts`
- [x] `GAP_ATTR` reclaim in `cleanupGapParagraphs` (+ task-486 chain guard hoisted above it)
- [x] unit: `hr-nav.test.ts` (8 cases), `gap-paragraph.test.ts` (4 reclaim cases)
- [x] e2e harness: `media-src/e2e/hr-gap-harness.ts` + `hr-gap.spec.ts` (6 tests, IR + WYSIWYG)
- [x] real VS Code: `test/vscode-e2e/hr-edit.spec.ts` + `fixtures/hr-code-gap.md` — ArrowDown stops
      between the rule and the fence, and typed text is saved as `---\n\nbetween\n\n```js`
- [x] `npm run quality` (knip's pre-existing 41-unused-export baseline is the only red stage)

## Superseded by 292 — same day

This task was the point fix; [292](292-void-block-interaction.md) generalised it into one rule
hours later, on the same branch. `hr-nav.ts` and its `gapSlot` no longer exist: the rule now lives
in `gap-boundary.ts` (pure — `needsGap`/`boundaryToward`), the arrow mover in `gap-nav.ts`, the
click handler in `gap-click.ts`, and the tests listed above were renamed with them
(`hr-nav.test.ts` → `gap-nav.test.ts`, `media-src/e2e/hr-gap*` → `gap-cursor*`). The two things
this task established survived unchanged and are what 292 was built on: `isAtomicBlock` as the
shared vocabulary, and the self-cleaning `GAP_ATTR` paragraph as the mechanism. The checklist above
is kept as the record of what shipped under this number — read it as history, not as a map of the
current tree.

## Follow-ups

Measured the rest of the adjacency matrix in the same harness afterwards (probe only, not kept as
a spec) so the remaining holes were stated from evidence, not from reading the code:

| adjacency | reachable slot? |
| --- | --- |
| `hr` ↔ code block / front matter | ✅ this task |
| table ↔ code block (both directions) | ✅ Vditor's own splice; reclaimed on pass-through |
| blockquote ↔ code block, code ↔ code, callout ↔ callout | ✅ pre-existing (`gap-paragraph.ts`) |
| above a document that **STARTS** with a code block / table | ✅ **closed by 292** |

That last row was this task's one concrete remaining hole — `ensureLeadingBlock` only manufactures
a block when the editable has ZERO element children (deliberately narrow, task 446 Part 1: a
leading `<p>` on every open would add a visible blank line above everyone's first block), so a
document whose first block was atomic could not be typed above. 292 closed it by treating a
missing neighbour as atomic (`atomicOrNull`), which makes the document's leading edge just another
boundary; it is the headline case of `test/vscode-e2e/gap-cursor.spec.ts`.

- **sv mode is still not covered, and that is deliberate.** sv has no block chain to walk — Vditor
  wraps the whole source in ONE `<div data-block="0">` — so 292 gates the gap rule to ir/wysiwyg
  through `blockModeElement` (`util/source-map.ts`). Wiring it to sv anyway spliced paragraphs into
  the source text and turned the FAST tier red; the gate is the fix, not an omission.
