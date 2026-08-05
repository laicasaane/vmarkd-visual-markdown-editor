# Task 292 — Void-block interaction model: gap cursor

**Status:** done (2026-08-05) — gap cursor shipped; node selection deferred to its own task · **Impact:** 🟡 med (closes a whole bug class) · **Origin:** task 192 §12 (ProseMirror patterns)

## What it is & the effect

For blocks that contain no editable text (rendered diagrams, `<hr>`, tables, front matter,
code fences), a **gap cursor**: a reachable caret position at boundaries where none exists —
before a document that STARTS with a diagram/table, between two adjacent rendered blocks,
between a rule and a fence.

**Today in vMarkd:** POINT fixes only — Vditor's own transient splice around code fences
(`gap-paragraph.ts`), the hr step-across (`hr-nav.ts`, task 100), the hr↔atomic slot
([496](496-hr-atomic-block-gap-slot.md)) — and each new void-block edge case becomes its own bug.
**After:** one rule decides every boundary, and the point fixes fold into it.

**Node selection** (click a rendered block's edge → select/delete/copy it as a UNIT) was the other
half of this task. Split off by user decision on 2026-08-05: the gap cursor is the live pain, node
selection is not. It is NOT in this task's scope any more — see "Deferred" below.

## Decisions (user, 2026-08-05)

1. **Gap cursor only.** Node selection deferred.
2. **Triggers: arrows + click.** Click is the common reflex — without it a document that starts
   with a diagram still looks broken. (Ctrl/Cmd+Home/End explicitly not in scope.)
3. **Mechanism: a real transient paragraph**, generalising the proven `data-vmarkd-gap` /
   `cleanupGapParagraphs` machinery — NOT a ProseMirror-style drawn caret. The deciding argument is
   architectural, not visual: in this codebase "where the caret is" IS a DOM Range — `caret.ts`
   (ADR-0007) holds a `{node, offset}` intent and re-asserts it every frame, and `focus-restore`,
   `caret-preserve`, the position tracker and the undo restore all read a Range. A drawn caret adds
   a SECOND kind of caret that every one of those would have to learn about, and Vditor's per-keyup
   `expandMarker(getEditorRange())` normalises a selection that is "nowhere" to the editor start —
   exactly the jump-to-top of tasks 439/446/490. The hybrid (draw, materialise on `beforeinput`)
   collapses into this one under IME anyway: composition starts in the current selection, so a real
   text node must exist BEFORE the first input event.
   Accepted cost: content shifts by one line while the caret sits in a gap (it goes away when the
   caret leaves) — the same behaviour the trailing paragraph and the existing transient gaps already
   have. If it ever grates, a narrower `line-height` on the gap is a CSS-only follow-up.
4. **Stop only where nothing else can reach.** Not PM's "every boundary with no text position":
   between a paragraph and a rule you can already open a line with Enter, so no stop there. Zero
   extra keypresses in ordinary prose.

## Design

### 1. `gap-boundary.ts` — the rule (pure; no layout, no selection)

One predicate covers the whole matrix. For a boundary between blocks `A` and `B` (either may be
`null` = start/end of document):

```
needsGap(A, B) = atomicOrNull(A) && atomicOrNull(B)
```

`atomic` is the existing `isAtomicBlock` (`trailing-paragraph.ts`): anything that is not a plain
editable text block. Checked against the measured matrix:

| boundary | needsGap | why |
| --- | --- | --- |
| doc start ↔ code block / table | ✅ | measured hole — nothing above it at all |
| `hr` ↔ code block / front matter | ✅ | task 496 |
| code ↔ code, table ↔ code, quote ↔ code | ✅ | Vditor splices there today; the rule now owns it |
| `hr` ↔ `hr` | ✅ | no text position between two rules |
| paragraph ↔ `hr`, heading ↔ code block | ❌ | Enter at the text block's edge already opens a line |
| paragraph ↔ paragraph | ❌ | a text position already exists |

Unit-testable against DOM strings — **this matrix is the spec**.

### 2. `gap-nav.ts` — arrows, one handler instead of three

On ArrowUp/Down from a block's edge line, ask for the boundary in the travel direction. Three
outcomes: `gap` (splice `<p data-vmarkd-gap>`, place the caret, `preventDefault`), `step-across`
(hop the void `<hr>` — task 100's behaviour, for boundaries that need no gap), `none` (hand back to
the native move / Vditor).

`hr-nav.ts` is RETIRED into this module — not kept alongside it: two modules pre-empting the same
keydown is a guaranteed conflict. Retire only once parity tests are green.

### 3. `gap-click.ts` — clicking a dead strip

Only when the event target is the editable itself (the click missed every block) and Y falls in a
strip between blocks or above the first one. Map Y to that boundary and, if `needsGap`, materialise
it. When no gap is needed: do nothing — no "improving" what the browser does.

Measured (chromium harness, doc of two code fences): a **24 px** strip above the first block
(editor top 37 → first block 61, `padding-top: 10px`) and a **~14 px** strip between the two
fences. Clicking either lands the caret INSIDE the block above today.

### Ownership boundaries (decided, not incidental)

- **End of document stays with the trailing invariant** (`trailing-paragraph.ts`): it already
  maintains a visible-when-active paragraph there. Pulling that boundary into the new rule would
  double the paragraphs and disturb the 446/472 machinery for nothing. The new module owns
  **internal boundaries + the start of the document**.
- **`ensureLeadingBlock` is unchanged** (still only for a completely empty editable); "the first
  block is atomic" is served on demand by the gap, not by a permanent leading paragraph.
- Reclaim and serialisation are unchanged: `cleanupGapParagraphs` + `GAP_ATTR`, attributes are
  invisible to Lute, `getValue()` byte-identical after navigation alone.

## Plan

- [x] **Phase 1 — the rule.** `gap-boundary.ts` + the unit matrix (24 cases). No behaviour change;
      nothing wired.
- [x] **Phase 2 — arrows.** `gap-nav.ts` took over; `hr-nav.ts` + `hr-nav.test.ts` DELETED (its
      `gapSlot` is subsumed by `needsGap`, its step-across by `stepAcross`'s hr hop). Parity proven
      BEFORE the deletion: 51 chromium specs (hr-gap/gap/codenav/callouts/callout-ir/keybugs) and
      then 5 real-VS-Code nav tests green. Manifest (`scripts/module-manifest.mjs`) and the 0%
      coverage baseline updated with it.
      **Behaviour deltas, all deliberate:** (a) a document STARTING with an atomic block now opens
      a line above it on ArrowUp — the measured hole; (b) two ADJACENT rules now stop between them
      (task 100 used to skip a whole RUN of rules in one press) — nothing else can reach that slot,
      so the agreed rule says stop; (c) quote↔code and table↔code boundaries are now spliced by us
      instead of by Vditor — asserted identical, including `getValue()` byte-for-byte.
- [x] **Phase 3 — click.** `gap-click.ts` (`boundaryAtY` + a capture-phase `mousedown`). mousedown,
      not click, so a caret is never painted in the wrong block first; narrowed to a plain single
      primary press, which is the deliberate cost — a selection DRAG that STARTS inside one of these
      thin strips is cancelled rather than anchoring in the neighbour.
- [x] **Phase 4 — cleanup.** Harness renamed `hr-gap` → `gap-cursor` (it is no longer hr-specific),
      ADR-0004/0007/0008 references to the deleted `hr-nav.ts` updated, module manifest + coverage
      ratchet updated, `npm run quality` green except knip's pre-existing 41-unused-export baseline
      (unchanged by this work — the three exports this added were pulled back to module-private).
      `gap-cursor.spec.ts` added to the FAST real-VS-Code tier (41 tests) with its justification.

**sv is explicitly OUT (found by the FAST tier, not by reasoning).** `hr-nav.ts` was wired to every
mode too, but it only ever acted when the sibling was an `<hr>` — and sv has no `<hr>` elements, it
renders the markdown source — so it never fired there. The generalised rule DOES fire: Vditor's
`setValue` wraps the whole sv document in ONE `<div data-block="0">` (task 495), which `isAtomicBlock`
correctly reads as atomic, so the document's edges looked like gap boundaries and paragraphs got
spliced into the source. Four sv/split specs went red in the FAST tier
(`caret-tab-return` sv, `clipboard-preview` split-edit, `cut-selection-sv`, `block-fidelity` sv) —
green again once the wiring became `blockModeElement` (`util/source-map.ts`, ir/wysiwyg only, with
its own unit test so it cannot silently regress). Neither the unit nor the harness layer could have
caught this: both only ever construct ir/wysiwyg DOM.

**The coverage ratchet earned its keep here.** It refused `gap-nav.ts` / `gap-click.ts` at 0% unit
coverage, and writing those tests (stubbed rects — jsdom has no layout, see
`gap-nav-fixture.ts`) immediately caught a REGRESSION no e2e had: `stepAcross` was landing the caret
at the near edge of the next block for ordinary paragraph→paragraph moves too, throwing away the
caret's visual column on every ArrowDown in prose. Now the mover only takes over once a void rule
has actually been crossed — the native move is better than us whenever it can get there itself.

## Verification

- **L1** the boundary matrix over block-type fixtures (pure DOM strings).
- **L2** chromium harness: block families (hr, code/mermaid, table, front matter, blockquote) ×
  (ArrowDown / ArrowUp / click) × `getValue()` unchanged; the transient `<p>` never serialises.
- **L3** real VS Code (mandatory): a document STARTING with a mermaid diagram — click above it,
  type, and assert what is saved.

## Deferred

- **Node selection** (PM `NodeSelection` / Lexical equivalent): click a rendered block's edge → the
  whole node is selected, Backspace deletes it in one edit, Ctrl+C copies its markdown source, Esc
  deselects (fits task 288's ladder). Must respect the Ctrl-to-interact zoom gate on diagram
  surfaces. Split off 2026-08-05; give it its own task when it becomes the live pain.
- Multi-node selection (259 covers dragging, 288 covers block→doc) and cut/paste of node selections.
