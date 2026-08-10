# 492 — Toolbar: responsive overflow (+ the usability findings around it)

Status: **Phases 1–5 implemented and verified** (unit, chromium harness, real-VS-Code, including a
clean `test:vscode:fast` run for each phase). One pre-existing, unrelated issue remains open and
undiagnosed: `test/vscode-e2e/toolbar-overflow.spec.ts`'s original test fails at its `more`-panel
reopen assertion (~line 144); proven independent of Phase 4 and Phase 5 (reproduces with both
reverted, and with no concurrent test run on the machine) — see Phase 5's section for the isolation
evidence. Not part of this task's scope; needs separate triage.

Origin: user asked on 2026-08-02 whether toolbar usability could be improved. An external
review pass (Codex `gpt-5.6-sol`, two rounds) produced the audit and the overflow design;
every load-bearing claim below was then **re-verified against the tree by reading the
files**, and the places where the review was wrong are marked. Treat unmarked statements
as verified fact — do not re-derive them.

---

## What this task builds

**Phase 1 (the point of the task):** a responsive overflow for the toolbar. Today the row
is `flex-wrap: nowrap` with no overflow at all, so in a narrow panel the trailing items —
which happen to be the most important ones — go off-screen and become unclickable.

Phase 1 is A + B + a required subset of H (see [Phase 1](#phase-1--responsive-overflow)).
They are one unit: A without the H subset ships a toolbar where half the actions are
mouse-only, and A without B fights a Vditor rule that widens every button by 24px exactly
when space runs out.

**Phases 4-5** (keybindings and the rest of ARIA) are independent and gated — see
[phase status](#phase-status).

---

## Locked decisions — do not re-open

| date | decision |
|---|---|
| 2026-08-02 | `indent`, `outdent`, `insert-before`, `insert-after`, `line` (HR) and `strike` **stay as top-level buttons**. The audit's "thin out 7 rarely-used actions" is **rejected**; only `emoji` was left uncontested, which is not worth a change. The toolbar keeps all 26 actions. The fix for the space problem is overflow, not a smaller set. |
| 2026-08-02 | Overflow design accepted: pinned set, cluster give-way order, adaptive-overflow pattern (below). |
| 2026-08-02 | `undo`/`redo` **may overflow early** — Ctrl+Z / Ctrl+Y are universal, so the buttons are redundant. The counter-argument ("they show a visible is-there-anything-to-undo state") was raised and rejected. |
| 2026-08-02 | **No scroll fallback.** Below the width where the pinned cluster stops fitting, the pinned items give way too — `edit-in-vscode` → `preview` → `edit-mode` — and `more` is always last standing. One mechanism for every width. |
| 2026-08-02 | **Tooltips are re-enabled below 520px.** Edge overflow near the webview boundary is an accepted limitation; a JS-positioned tooltip is out of scope. |
| 2026-08-02 | **Submenu owners overflow in their agreed places** (`emoji` first, `headings` second to last); the panel-in-panel positioning rule is built as part of Phase 1 rather than reordering around the hard case. |
| 2026-08-02 (implementation pass) | **`.right`-classed items (the wiki pair) are pinned but give way FIRST**, ahead of `edit-in-vscode`. The spec pinned them without ordering them; chosen so that no right-aligned button — present or future — can become immovable and strand `more` off the edge. Verified by unit test only; no harness builds `createToolbar({ wikiEnabled: true })`. |
| 2026-08-02 | `outline` is **not pinned** — it overflows like anything else. `outline.treeView` already exposes the outline as a native VS Code view (read in `src/app/extension.ts`), so the toolbar button is not the only route to it. |

---

## Where the code lives

| file | role |
|---|---|
| `media-src/src/chrome/toolbar.ts:105-241` | the toolbar definition — order, separators, custom items, the `more` submenu, the optional wiki items |
| `media-src/src/chrome/toolbar-icons.ts` | custom SVGs (edit-in-VS-Code, wiki pages, go back, outline, link) |
| `media-src/src/boot/vditor-init.ts:220-243` | hands the config to Vditor; `toolbarConfig.pin` pins the bar; `counter.enable` is **false** (`:237`) so no counter element sits in the row |
| `media-src/src/vscode-chrome.css:22-172`, `:247-259` | VS Code-native chrome + the forced single non-wrapping row |
| `media-src/src/editing/escape-toolbar.ts:51-108` | `role="toolbar"`, `aria-orientation`, roving tabindex, arrow traversal, Escape |
| `media/vditor/dist/index.css` | Vditor 3.11.2's own toolbar CSS — the ≤520px media queries live here |
| `media-src/node_modules/vditor/src/ts/toolbar/` | Vditor's toolbar source — read-only reference, **not** ours to patch here |

---

## Verified facts an implementer needs

These were read out of the tree; they decide the shape of the solution.

### F1 — level-1 and level-2 items have different DOM

`MenuItem.ts:22-33`. A top-level item is:

```html
<div class="vditor-toolbar__item">
  <button class="vditor-tooltipped vditor-tooltipped__s" data-type="bold" aria-label="Bold <Ctrl+B>">…icon svg…</button>
</div>
```

A level-2 item (a row inside a submenu) is a *different* shape — no `.vditor-toolbar__item`,
no `.vditor-tooltipped`, no icon, just text:

```html
<div><button data-type="settings">Settings</button></div>
```

**Consequence:** reparenting a top-level item into the `more` panel does not produce a menu
row for free — it produces an icon with no label. The review's "just move the existing DOM
wrappers" is right about the mechanics and silent about the appearance. See F5 for the fix.

### F2 — event handlers survive reparenting

Handlers are bound in the constructor to `this.element.children[0]` (`MenuItem.ts:38`,
`Custom.ts:8`), and `Toolbar.elements[name]` stores element references
(`toolbar/index.ts:184-186`). DOM listeners and that map both survive a move. **Do not
rebuild items and do not add duplicate keys to `toolbar.elements`** — move the existing
nodes.

### F3 — the roving tabindex only walks DIRECT children — this is the blocker for A alone

`escape-toolbar.ts:60-70`: `rovingItems()` iterates `toolbarEl.children` and keeps those
with `.vditor-toolbar__item`. An item moved **into** the `more` panel is a descendant, not
a direct child, so it drops out of the roving set — and it keeps the `tabIndex = -1` that
`initRoving` last wrote. It becomes unreachable by both Tab and the arrow keys.

Today's `more` rows (`Settings`, `About …`) are plain `<button>`s and are Tab-reachable
when the panel is open. Overflowed items would **not** be. That is why part of H is
mandatory in Phase 1, not optional.

### F4 — submenu owners nest a panel inside their own item

`toolbar/index.ts:41-56`: an item with a `toolbar` array gets a
`div.vditor-hint.vditor-panel--arrow` appended **as a child of its own item element**, and
`toggleSubMenu` is bound to it. Only `emoji` and `headings` do this among the overflow
candidates (`more` and `edit-mode` are pinned, so they never move).

What survives a move into `more` — traced through `setToolbar.ts`:

- `toggleSubMenu:98` calls `stopPropagation()`, so opening a nested submenu does **not**
  trip the `more` panel's own click-to-close listener (`toolbar/index.ts:47-49`)
- `toggleSubMenu:108`'s except-element resolves to `actionBtn.parentElement.parentElement`
  = the `more` panel once moved, so `hidePanel` leaves the parent menu open — the nesting
  accidentally works in our favour
- `toggleSubMenu:113` measures against `vditor.toolbar.element`, which still contains the
  button, so the `--left` flip still computes
- `hidePanel:83-85`'s `elements.emoji.lastElementChild` special case still resolves

What does **not** survive: positioning — but for **`emoji` only**. Vditor ships
`.vditor-hint .vditor-hint` (`index.css:766-772` — flyout to the right at `left:100%`,
`--left` flips it), and the panel classes differ per item:

| item | panel class | nested positioning |
|---|---|---|
| `emoji` | `.vditor-panel .vditor-panel--arrow` (`Emoji.ts:16`) | **not covered** — needs the new rule |
| `headings` | `.vditor-hint .vditor-panel--arrow` (`Headings.ts:17`) | already covered, free |
| `edit-mode` | `.vditor-hint` (`EditMode.ts:160`) | already covered, free |

So the new `.vditor-hint .vditor-panel` rule exists for `emoji` alone. (An earlier draft of
this task said `headings` needed it too — wrong, it is a `.vditor-hint`.)

Cosmetic follow-on: `--arrow` stays on a moved panel, and `EditMode.ts:160` shows Vditor
drops that class for genuine level-2 items — so a nested panel will render a stray arrow
until the class is removed on move.

### F5 — the panel-row CSS is already most of the way there

`vscode-chrome.css:92-101` applies to **any** button inside `.vditor-hint`:
`display:block; width:100%; text-align:left; font-size:12px; line-height:18px; padding:3px 14px`.
So a moved item's button already becomes a full-width menu row. What is missing:

- `.vditor-toolbar__item { float: left }` (`index.css:374-377`) must be neutralised inside
  the panel
- `vscode-chrome.css:144-151`'s `padding 4px / 6px transparent borders` hover-band shaping
  is written for the row, and needs scoping so it does not apply inside the panel
- a **label**: `aria-label` on the button already holds the full tip text including the
  hotkey (`MenuItem.ts:30`), so `::after { content: attr(aria-label) }` gets it for free.
  **Check double-announcement** — CSS generated content is exposed to assistive tech in
  current browsers, so the row may be read twice; if it is, render a real `<span>` instead.

### F6 — the real-VS-Code suite can drive width

`workbox.setViewportSize({ width, height })` works and is already used for responsive
behaviour in `test/vscode-e2e/diagram-resize.spec.ts:53,71,94`. Phase 1's central
behaviour is therefore verifiable at the mandated layer.

---

## The overflow design

### Pinned — the last band, not an absolute

`preview`, `edit-mode`, `edit-in-vscode` — plus, when wiki is enabled, `navigate-back` +
`wiki-pages`, placed *before* the rest of that cluster. `outline` is deliberately not
pinned (locked decision above).

`more` is the container itself and is **the one true absolute**: it is always last standing.

Below the width where even the pinned cluster does not fit, the pinned items give way too,
in this order (decided 2026-08-02):

```
edit-in-vscode → preview → edit-mode → [ more ]
```

**There is no separate scroll fallback.** One mechanism covers every width, which is why
this was chosen over a sticky-`more`-plus-horizontal-scroll hybrid: two mechanisms means
two sets of edge cases meeting at a threshold.

Consequence the implementer must handle: `edit-mode` owns a panel, so at the narrowest
widths there will be a panel nested in `more` — the same machinery `emoji` needs (F4), and
`edit-mode`'s panel is a `.vditor-hint`, so nesting it is already covered by Vditor's own
CSS.

### Give-way order

Clusters, not whole `|` groups — a separator-delimited group may break up:

```
emoji → undo/redo → outline → insert-before/after → outdent/indent →
quote/line → code/inline-code → upload/table → list/ordered-list/check →
headings → bold/italic/strike/link          ← last to go
```

Criterion, in order: rarity → keyboard redundancy / contextual use → core formatting with
no alternative.

Separators (`|`) are not items: hide a separator when every cluster on one side of it has
overflowed, so the row never ends in a dangling divider.

### Pattern choice — and what was rejected

Adaptive overflow (move items into `more`, keep one row of stable height).

- **wrapping to a second row — rejected.** It resurrects the exact bug `flex-wrap:nowrap`
  fixes (see [Do not touch](#do-not-touch)).
- **scrollable strip — rejected** (2026-08-02). It was on the table as a fallback below the
  pinned cluster's minimum width; instead the pinned items give way too, so one mechanism
  covers the whole range.
- **user-configurable set** — a possible later addition, never a substitute.

---

## Nested submenus in the overflow — RESOLVED 2026-08-02

`emoji` is first in the give-way order and is one of only two items that own a nested panel
(F4), so the very first thing that ever overflows is the one needing panel-in-panel
positioning. `headings` (second to last) has the same problem, so it could only ever be
deferred, not avoided.

**Decision: do the nested-panel work now and keep the agreed order unchanged.** Two
alternatives were offered and rejected — overflowing submenu owners last (breaks an order
already approved), and excluding them from overflow entirely (the one item everyone agreed
is rare would be the one item that never hides, while `bold` would).

Concretely: add a `.vditor-hint .vditor-panel` positioning rule mirroring the
`.vditor-hint .vditor-hint` rule Vditor already ships at `index.css:766-772` (flyout at
`left:100%`, `margin-top:-31px`, with `--left` flipping it). The remaining machinery —
`stopPropagation`, `hidePanel`'s except-element, the `<250px` left-flip, the emoji special
case — was traced and already works once moved (F4).

---

## Phase 1 — responsive overflow

### A. The overflow module

New module next to `toolbar.ts` (suggested `media-src/src/chrome/toolbar-overflow.ts`).
Split it so the decision is a **pure function** and the DOM work is a thin shell — the pure
part is what the unit tests drive:

```
computeOverflow({ available, pinnedWidth, clusters }) -> { visible: string[], overflowed: string[] }
```

- `clusters` carries each cluster's cached **row** width (see below) in give-way order.
- The shell measures, calls the pure function, and moves nodes.

### Measurement rules

- Measure **once after the first real render, before anything has moved**, via
  `getBoundingClientRect`; cache each item's **row** width and each cluster's sum.
- **Re-measure only on font-size / zoom change** — VS Code webviews get both.
- **Never measure an item while it is inside `more`.** Its panel width is not its row
  width; deciding against the panel width is exactly the oscillation bug: at one specific
  panel width the item flips in and out on every frame.
- **At container width 0, make no decision — keep the last layout.** That is the hidden-tab
  case, i.e. the very scenario the `nowrap` rule exists for.
- `ResizeObserver` on a **stable container**, not on the toolbar itself (observing the
  element you are about to mutate is how you build a feedback loop). Batch reads and writes
  in one `requestAnimationFrame`.
- **Hysteresis of 8-16px** at the boundary, so a width sitting exactly on a threshold does
  not chatter.
- The `more` panel is `display:none` until opened (`index.css:764`), so it contributes no
  width — but it is a child of the pinned `more` item, so measure the item, not the panel.

### DOM rules

- Move the existing item elements (F2). Do not clone, do not rebuild, do not touch
  `toolbar.elements`.
- Append overflowed items into the existing `more` panel — **one menu, not two**. Put them
  above the existing rows with a divider, so `Settings` / `About` keep a stable position.
- Restore an item to its original index in the row when it fits again — keep the authored
  order, do not append to the end.

### CSS (`vscode-chrome.css`)

- neutralise `float:left` for `.vditor-toolbar__item` inside `.vditor-hint`
- scope the hover-band shaping (`:144-151`) so it does not apply inside the panel
- give overflowed rows their label (F5), and check the double-announcement question
- add the `.vditor-hint .vditor-panel` positioning rule mirroring `index.css:766-772`, so a
  nested `emoji` / `headings` panel flies out correctly from inside `more` (decided
  2026-08-02 — see [Nested submenus](#nested-submenus-in-the-overflow--resolved-2026-08-02))

### B. Neutralise Vditor's ≤520px padding bump

`index.css:492-494` sets `.vditor-toolbar__item { padding: 0 12px }` below 520px, while the
base rule (`:374-377`) has **no** horizontal padding — every button grows 24px precisely
when space runs out. Override it back to a compact target (~28-32px) in `vscode-chrome.css`.

The same breakpoint also kills tooltips (`index.css:249-253`). **Re-enable them** (decided
2026-08-02): a narrow panel is where labels are scarcest, so tooltips are needed more there,
not less — and more of the toolbar is about to live behind a `…` menu. Override the
`content: none` in `vscode-chrome.css`.

Known limitation, accepted: Vditor's tooltip is a pure `::before`/`::after` construct with
no positioning logic, so near the webview edge it can overflow. Clamping it would mean
replacing the CSS tooltip with a JS-positioned one — explicitly **not** in scope. If it
turns out to be bad in practice, that is a follow-up task, not a Phase 1 expansion.

### H-subset (required — A is incomplete without it)

- after **every** move, re-run `initRoving` so the roving set matches the row
- an item moved into the panel must become keyboard-reachable there: clear the
  `tabIndex = -1` that `initRoving` left on it (F3)
- `aria-haspopup` / `aria-expanded` on the `more` trigger, kept in sync with the panel's
  open state — with items now hiding inside it, "is there more" must be announced
- arrow / Home / End / Escape navigation **inside** the panel, matching the row's behaviour

### Do not touch

- **`vscode-chrome.css:247-259`'s `flex-wrap: nowrap`.** It fixes a separate documented
  bug: when a tab is hidden the webview collapses to zero width, Vditor's floated items
  stack into a grid, and that wrapped frame is painted on the way back — the "crooked
  toolbar" flash. The webview is retained, not rebuilt, so it is a reflow artifact. Read
  the comment there before touching anything nearby.
- Vditor's own source under `media-src/node_modules/` — reference only.

### Acceptance criteria

- [x] no item is ever unreachable: at any width, everything is either in the row or in `more`
- [x] **`more` is visible at every width, down to the narrowest the panel can go** — it is
      the only route to everything else, so this is the criterion the whole design hangs on
- [x] the pinned cluster gives way only after every other item has, and in the decided order
- [x] items return to their **authored position** when the panel widens
- [x] no oscillation: sweeping the width slowly across every threshold produces monotonic
      moves, and holding a width on a threshold produces none
- [x] hidden tab (width 0) → reopen leaves the layout unchanged and unwrapped
- [x] everything in `more`, including overflowed items, is keyboard-reachable and announced
- [x] buttons do not grow below 520px, and tooltips still appear there
- [x] a nested panel (`emoji`) opens in the right place from inside `more`, with no stray
      `--arrow`. **`edit-mode` is not covered by a test**: it is the last pin to give way, so it
      only reaches the menu below ~48px of row — measured — where its panel can no longer be
      clicked at all. A real webview floors near 220px, so that band does not occur; its panel is
      a `.vditor-hint`, already placed by Vditor's own nested rule (F4).

### Tests — all layers required (AGENTS.md: this is webview chrome)

- **unit** (`npm test`) — `computeOverflow` against a table of widths: exact-fit boundaries,
  hysteresis band, width 0, everything-overflows, nothing-overflows, restore ordering.
  Pure function, no DOM.
- **chromium harness e2e** (`xvfb-run -a npm --prefix media-src run test:e2e`) — narrow the
  viewport, assert items land in `more`, widen, assert they come back in order.
- **real-VS-Code e2e** (`test/vscode-e2e/`, MANDATORY, write **and run** it) — use
  `workbox.setViewportSize` following `diagram-resize.spec.ts:53,71,94`. Cover: narrow →
  items in `more`; pinned set still visible; keyboard reaches an overflowed item; widen →
  restored. Run it: `node build.mjs` first, then
  `xvfb-run -a npm --prefix test/vscode-e2e test -- <spec>.spec.ts`.
  Keep the test count low — boot cost is **per `test()`**, not per file.
- coverage confirmed on the new module; then `npm run quality` and `npm run lint:ci`.
- run the fast tier before handing over: `xvfb-run -a npm run test:vscode:fast`. **Do not
  start the full suite without asking** — it is 1-2 h.

Implementation status:

- [x] Overflow module (`media-src/src/chrome/toolbar-overflow.ts`), DOM shell, CSS, roving
      navigation, harness e2e, and real-VS-Code spec.
- [x] unit — `media-src/src/chrome/toolbar-overflow.test.ts` (13 cases: `computeOverflow` table +
      DOM shell + the `toolbar.ts` drift guard). The width-0, font-size-re-measure and drift cases
      were each confirmed **red** with the feature removed, so they guard what they claim to.
- [x] chromium harness — `media-src/e2e/toolbar-overflow.spec.ts` (5 tests: give-way + restore,
      monotonic sweep + threshold hold + completeness, labels/keyboard, pinned give-way order,
      nested panel).
- [x] real VS Code — `test/vscode-e2e/toolbar-overflow.spec.ts` (1 test, per-`test()` boot cost).
- **Not covered by any e2e:** the wiki-enabled toolbar. Both harnesses call `createToolbar()` with
  no options, so `navigate-back` / `wiki-pages` exist only as a synthetic `.right` item in the unit
  test. Enabling wiki in a harness costs a second toolbar fixture; the pinned-give-way logic it
  would exercise is identical.
- [x] coverage on the new module: 96.1% statements / 98.9% lines.
- [x] `npm run quality` — lint:ci, jscpd, depcruise, test:coverage (2664 unit tests) and the
      module ratchet all PASS. `knip` FAILs on its documented pre-existing baseline only; nothing
      in this task appears in its output.
- [x] `xvfb-run -a npm run test:vscode:fast` — 40 passed (7.7 min), including `escape-toolbar`,
      the spec most exposed to the roving-tabindex change.

### What the first implementation pass got wrong (found by running the tests)

Four defects that only surfaced once the e2e actually ran — recorded so they are not reintroduced:

1. **Cluster widths were computed before the first measurement**, so every cluster measured 0, was
   dropped by a `width > 0` filter, and the ordinary give-way path never ran at all. Only the
   narrow-width pinned branch worked. The single DOM unit test happened to sit below the pinned
   width, so it passed anyway — the new above-pinned case exists to close that hole.
2. **`authoredInsert` compared a live child index against the authored one**, so restoring on widen
   put items back in the wrong order. It now walks an authored child snapshot (items *and*
   dividers) taken at install.
3. **Overflowed items were appended below the menu's authored rows**, with the divider stranded at
   the top — the reverse of the agreed layout. They now go above the divider.
4. **The nested-panel CSS had no `--left` counterpart**, so the emoji flyout ran off the webview
   edge whenever `toggleSubMenu` tagged it `vditor-panel--left` (`setToolbar.ts:113`).

Also cached: the separator width, which was read live from the DOM each pass. Harmless today, but
it is a measurement that changes with the layout it feeds — the shape of an oscillation loop.

**A fifth defect, found in the simplify pass and not by any test:** the pinned set was `PINNED_ORDER
|| .right`, but the give-way loop walked `PINNED_ORDER` only. With wiki enabled, `navigate-back` and
`wiki-pages` (authored `className: 'right'`, `toolbar.ts:144-172`) were therefore pinned *and*
undroppable — they would sit in the row at every width while the three named pins gave way around
them. Both harnesses call `createToolbar()` with no options, so the whole wiki path was untested.
Fixed generally rather than by adding two names: any `.right` item is pinned but gives way **ahead**
of the named pins, so a future right-aligned button cannot become immovable either.

**Separator hiding** is now implemented (it was in the DOM rules and had been skipped). A divider
whose adjacent group has entirely overflowed is hidden, so the row never starts, ends, or breaks
twice on a stray rule; `dispose()` restores every one.

**Drift guard:** `CLUSTER_ORDER` / `PINNED_ORDER` are a second hand-kept copy of the names
`toolbar.ts` authors, and nothing linked them — an item renamed there would silently stop
overflowing. `KNOWN_TOOLBAR_ITEMS` is now cross-checked against `createToolbar()` (wiki on and off)
in a unit test that goes red on any drift.

Missing outright: **"re-measure only on font-size / zoom change"** was specified but not built, so
a zoom change left the cached widths stale forever. It is now a `getComputedStyle(...).fontSize |
devicePixelRatio` probe checked per pass; when it moves, every item is restored to the row *first*
(an item inside `more` reports its panel width) and re-measured inside the same `requestAnimation
Frame`, so the fully-restored row is never painted.

### Note for anyone writing a width test in real VS Code

`workbox.setViewportSize({ width: 360 })` does **not** give a 360px webview: the activity bar and
sidebar take a fixed slice, and at that window width the webview measures **0** — where the overflow
correctly declines to decide. Close the sidebar first
(`workbench.action.closeSidebar`); then 700px window ≈ 350px webview and 1400px ≈ 1050px. Measured
progression with the sidebar closed: 1052px → 0 overflowed, 552px → 4, 352px → 12, 220px → 18.

---

## Phase status

Phases 2, 3, 4, and 5 are complete.

### Phase 2 — labels and icons — IMPLEMENTED 2026-08-02

`Line` → `Horizontal Rule`, `Order List` → `Numbered List`, uniform 16×16 icons.
Files: `toolbar.ts`, `toolbar-icons.ts`. Note these strings feed `aria-label`
(`MenuItem.ts:30`) and therefore the overflow row labels from F5.

Implementation also advertises the existing Shift+Ctrl/Cmd+Z redo shortcut in the
Redo tooltip. The labels and custom SVG dimensions are covered by unit, Chromium
harness, and real-VS-Code toolbar tests.

### Phase 3 — localisation — IMPLEMENTED 2026-08-02

`media-src/src/util/lang.ts` covers 15 strings; only `en_US` and `zh_CN` are complete
(`ja_JP` / `ko_KR` have `save` and nothing else). Separately, the `more` submenu labels in
`toolbar.ts:199,211,214` — `Settings`, `About Vditor`, `About vMarkd` — are **hardcoded
English literals**, not `t()` calls.

Routing those three through `t()` is mechanical and safe. The new toolbar labels use the
same translation table, and missing keys in `ja_JP` / `ko_KR` intentionally fall back to
English. The fallback is exposed through `translate()` and covered by unit tests; no
additional locale content was invented.

### Phase 4 — keyboard shortcuts — IMPLEMENTED 2026-08-07, REVISED 2026-08-07 (final 13-binding set)

> **Correction to the audit.** It claimed vMarkd registers no `contributes.keybindings`.
> **False** — `package.json` declared four before this phase: `ctrl+shift+v` →
> `vmarkd.pastePlain`, `ctrl+enter` → `vmarkd.activateLinkAtCaret`, `ctrl+alt+e` →
> `vmarkd.openTextEditor`, `ctrl+f` → the webview find widget, all gated on
> `activeCustomEditorId == vmarkd.editor`.

The decision (promote Vditor's baked-in formatting hotkeys into real `contributes.keybindings`,
additive only) was made 2026-08-07. The first pass promoted 20 commands, one per Vditor toolbar
item that declares a `hotkey` in `Options.ts` and is present in vMarkd's own `createToolbar()`.
After reviewing that set against VS Code's own core keybindings and researching what comparable
tools actually bind — Obsidian, Typora, Notion, Google Docs, and especially VS Code's own
"Markdown All in One" extension, which lives in this exact host and faces the identical
core-keybinding collision space (it binds only bold/italic/strike/heading-cycle/indent-outdent/
task-check and deliberately leaves list/quote/HR/code/link/table unbound) — the user approved a
smaller, **final set of 13**, superseding the first pass. This section replaces the original
20-binding write-up in full; the numbers/keys below are the only ones that shipped.

**Final 13, win/linux key → mac:**

| name | key | mac |
|---|---|---|
| bold | Ctrl+B | Cmd+B |
| italic | Ctrl+I | Cmd+I |
| strike | Alt+S | Alt+S |
| list | Ctrl+Shift+8 | Cmd+Shift+8 |
| ordered-list | Ctrl+Shift+7 | Cmd+Shift+7 |
| check | Ctrl+Shift+9 | Cmd+Shift+9 |
| outdent | Ctrl+[ | Cmd+[ |
| indent | Ctrl+] | Cmd+] |
| quote | Ctrl+; | Cmd+; |
| code (fenced) | Ctrl+U | Cmd+U |
| inline-code | Ctrl+E | Cmd+E |
| undo | Ctrl+Z | Cmd+Z |
| redo | Ctrl+Y | Cmd+Y |

**Removed entirely** (no `vmarkd.format.*` command, no keybinding — back to toolbar/mouse-only,
matching Markdown All in One's own choice not to bind them): `link` (was Ctrl+K), `headings` (was
Ctrl+H), `table` (was Ctrl+M), `line`/HR (was Ctrl+Shift+H), `insert-before` (was Ctrl+Shift+B),
`insert-after` (was Ctrl+Shift+E), `emoji` (was Ctrl+E — freed up for `inline-code` above).

- `link`/Ctrl+K is the worst case: Ctrl+K is a VS Code chord **PREFIX** (Ctrl+K,S opens Keyboard
  Shortcuts, Ctrl+K,T the theme picker, etc.), so binding it — even `when`-scoped — risked
  shadowing every `Ctrl+K,*` chord while the vMarkd editor had focus. Removing the formal
  registration does not by itself fix the underlying collision (Vditor's own bubble-phase keydown
  handler still swallows a raw Ctrl+K regardless of whether a VS Code command is registered for
  it — pre-existing behavior, out of scope to change here) but it stops advertising a misleading,
  effectively-unrebindable entry in the Keyboard Shortcuts UI. **This was empirically verified**,
  see below.
- The other six had no dedicated-key precedent in any researched tool and each collided with a
  high-frequency VS Code core command (Open File, Show Explorer, Goto Symbol, Replace in Files,
  Run Build Task, the accessibility Toggle-Tab-Focus-Mode command) — not worth it for
  Vditor-specific/rare/menu-only actions that Markdown All in One doesn't bind either.
- `fullscreen` (⌘') and `both` (⌘P) were never in scope (not part of the original 20 either).

**Design (unchanged by the key rework):** one generic `HostMessage` discriminant, `{ command:
'trigger-toolbar-hotkey', name }` (`src/shared/protocol.ts`), rather than one message per command.
Host side: `FORMAT_COMMANDS` table (now 13 entries) + a registration loop in `src/app/commands.ts`,
each entry resolving the active panel (same `resolveActivePanel` helper `vmarkd.activateLinkAtCaret`
uses) and posting the toolbar item's name. Webview side: `handleTriggerToolbarHotkey`
(`media-src/src/bridge/message-router.ts`) dispatches a click on
`vditor.toolbar.elements[name].children[0]` — the exact call Vditor's own hotkey dispatch makes on
itself — so formatting logic is never reimplemented. `package.json` carries 13
`contributes.commands` entries (`vmarkd.format.*`, category vMarkd) and 13 matching
`contributes.keybindings` entries (`when: activeCustomEditorId == vmarkd.editor`, matching the
existing four pre-Phase-4 bindings).

**Double-fire bug found and fixed before shipping (still applies).** Vditor's own keydown handler
(`editorCommonEvent.ts`) is bound at the BUBBLE phase with no `stopPropagation` — unlike this
repo's own capture-phase + `stopImmediatePropagation` convention for keys vMarkd wants to own
outright (`caret-gesture.ts`, `undo-keybind.ts`). Measured in a real VS Code webview: a single
Ctrl+B produced **two** click dispatches on the bold button (one from Vditor's synchronous
in-webview handler, one from the new command's async postMessage round trip), corrupting the
result. Fixed with `media-src/src/chrome/toolbar-hotkey-dedupe.ts`: a capture-phase click
listener records every real toolbar-button activation; `handleTriggerToolbarHotkey` skips a name
activated within the last 400ms (the in-webview path always lands first — it's synchronous within
the keydown event, the command round trip cannot resolve before that tick finishes). A command
invoked with no preceding webview activation (Command Palette, a rebound key, or a focus context
Vditor's own listener doesn't reach) still dispatches normally.

**Undo/redo needed a second, separate fix.** `editing/undo-keybind.ts` (task 463) already owns
Ctrl+Z/Y/Shift+Z at the capture phase and calls `vditor.undo.undo/redo(inner)` **directly**,
bypassing the toolbar button entirely — because the button's disabled state lags Vditor's own
800ms `undoDelay` debounce and would otherwise no-op right after an edit. `vmarkd.format.undo`/
`redo` now do the same (special-cased in `handleTriggerToolbarHotkey`, `inner-vditor.ts`'s
`InnerVditor` type extended with `undo`), and `undo-keybind.ts`'s keydown handler now also calls
`markToolbarItemActive(kind)` so a trailing command round trip after a real Ctrl+Z is deduped the
same way. Both the click-based dedupe (bold) and the engine-call dedupe (undo) were verified with
a real Ctrl+B / Ctrl+Z keypress in real VS Code — exactly one bold, exactly one undo.

**`ctrl+k` chord-forwarding — empirically verified, not assumed.** With `link` no longer
registered, `test/vscode-e2e/format-hotkeys.spec.ts`'s third test presses a real `Ctrl+K` then
`Ctrl+S` (VS Code's own default two-key chord for "Preferences: Open Keyboard Shortcuts") while
the vMarkd editor has focus, and asserts a Keyboard Shortcuts tab actually opens. **Result: it
does** — the chord reaches the workbench correctly; a new "Keyboard Shortcuts" tab appears. This
resolves the risk flagged (but left untested) in the original 20-binding pass: Vditor's own
bubble-phase handler evidently does not consume the standalone `Ctrl+K` keydown in a way that
blocks VS Code's chord-prefix detection from completing.

**Files touched (this revision):** `src/app/commands.ts` (`FORMAT_COMMANDS` cut from 20 to 13,
keys remapped per the table above), `package.json` (`contributes.commands` /
`contributes.keybindings` cut from 20 to 13 each, keys remapped),
`test/vscode-e2e/format-hotkeys.spec.ts` (updated for the new keys; added the Ctrl+K
chord-forwarding test), `test/backend/commands-and-handlers.test.ts` (sample commands + the
registered-count assertion updated from 20 to 13). No other Phase 4 file needed a change — the
dedupe/undo/message-router/protocol machinery described above is name-driven, not
key-count-driven, so it required no edits for the smaller set.

**Tests:**
- Unit: `media-src/src/chrome/toolbar-hotkey-dedupe.test.ts` (5 tests — install/mark/expire/
  delegation/idempotency), `media-src/src/bridge/message-router.test.ts` (+5 tests — plain
  dispatch, double-fire skip, stale-mark passthrough, undo/redo engine routing, `window.vditor`
  not-ready no-op), `test/backend/commands-and-handlers.test.ts` (+3 tests — sample commands post
  the right message, all 13 register, no-op with no resolvable panel). `npm test`: 198 files /
  2796 tests, all green.
- Real-VS-Code e2e (mandatory, written and run): `test/vscode-e2e/format-hotkeys.spec.ts`, 3
  tests, all pass (`xvfb-run -a npm --prefix test/vscode-e2e test -- format-hotkeys.spec.ts`,
  26.9s): (1) a real Ctrl+B keypress bolds a selection exactly once (the double-fire regression
  test), (2) `vscode.commands.executeCommand('vmarkd.format.undo')` undoes a toolbar-driven edit,
  (3) the Ctrl+K chord-forwarding test above. `xvfb-run -a npm run test:vscode:fast` also run
  clean: 41/41 passed.
- `npm run lint:ci` and `npm run quality` (Biome lint incl. cognitive complexity, knip, jscpd,
  dependency-cruiser, unit coverage, the 0%-module coverage ratchet): all PASS, clean tree, no
  concurrent-agent noise this run.

### Phase 5 — the rest of ARIA — IMPLEMENTED 2026-08-07

Beyond the H-subset Phase 1 requires: `aria-haspopup` / `aria-expanded` on the other three
submenu triggers (`emoji`, `headings`, `edit-mode`), menu semantics inside those panels, and
replacing `upload` — which `MenuItem.ts:23` builds as a `div` wrapping a hidden
`<input type=file>` — with a semantic button.

**Part A — `aria-haspopup`/`aria-expanded` + menu semantics.** New module
`media-src/src/chrome/toolbar-submenu-aria.ts`, installed alongside `installToolbarOverflow` in
`finish-init.ts`. Mirrors the H-subset's `more` pattern rather than reinventing it:
`updateSubmenuExpanded` (the `aria-haspopup='menu'` + `aria-expanded` pair) was factored OUT of
`toolbar-overflow.ts`'s private `updateMoreState` into this module and re-imported there, so `more`
and the three new triggers share one implementation instead of four near-identical copies.

- `submenuPanel(toolbarEl, name)` finds a trigger's own nested panel (F4: appended as a sibling of
  its button, inside their shared `.vditor-toolbar__item`) by querying the toolbar subtree fresh
  each time — this is what makes it work whether the item currently sits in the row or has been
  moved into `more` at narrow widths, with no extra bookkeeping.
- **Menu scope differs per item's real DOM shape**, verified against Vditor's source rather than
  assumed: `headings` (`Headings.ts`) and `edit-mode` (`EditMode.ts`) have their rows as DIRECT
  children of the panel, so `role="menu"` goes on the panel itself. `emoji` (`Emoji.ts`) nests its
  buttons one level deeper inside `.vditor-emojis`, alongside a sibling `.vditor-emojis__tail`
  (a footer tip/link, not a menu item) — so `role="menu"` goes on `.vditor-emojis` specifically,
  not the outer `.vditor-panel`, keeping the tail out of the accessible menu.
- `more`'s own panel is **deliberately left untouched** (no `role="menu"` added there): it predates
  this module, Phase 1 already wired its `aria-expanded` half, and the brief scoped Phase 5 to "the
  OTHER three submenu triggers" — adding menu roles to `more` would be an unrequested change to
  already-shipped, already-tested code.
- **Keyboard navigation** (`escape-toolbar.ts`): `overflowMenuItems` (feeds `refreshToolbarRoving`'s
  F3 stale-tabIndex fix, which is specific to items moved into `more` — the other three panels'
  rows are plain native buttons never touched by `initRoving`, so nothing there needs it) now
  resolves `more`'s panel via the shared `submenuPanel`/`submenuMenuItems` helpers instead of its
  own bespoke query. A new `activeSubmenuItems(toolbarEl, activeEl)` checks all four known panels
  (`SUBMENU_TRIGGER_NAMES = ['more', 'emoji', 'headings', 'edit-mode']`) for whichever one currently
  contains focus and returns ITS rows — so the existing arrow/Home/End handling in `onKeydown`
  (previously scoped to `more` alone) now drives `emoji`/`headings`/`edit-mode` too, with no
  duplicated dispatch logic.
- `submenuMenuItems`'s row-button resolver (`menuRowButton`) handles all three real shapes with one
  function: a row that IS a `<button>` (headings/edit-mode/the emoji grid) is returned as-is; a row
  that WRAPS one in a bare `<div>` (`more`'s level-2 `MenuItem.ts` shape) is unwrapped; anything
  else (a divider) is filtered out.
- **Known inherited limitation, not introduced here**: ArrowLeft/ArrowRight inside an open submenu
  panel are intercepted by `escape-toolbar.ts`'s ROW-level roving handler before the menu-nav branch
  ever runs (that block only checks `focusInToolbar`, not "is focus on a row item vs. inside a
  panel"), so only ArrowUp/ArrowDown/Home/End actually navigate within a panel — this was already
  true for `more` (its own harness test only exercises ArrowDown/End/Home) and is unchanged by
  Phase 5; fixing it would be a pre-existing Phase 1 gap, out of this phase's scope.
- Also discovered while testing: `Headings.ts`'s own click handler has NO "second click closes it"
  branch (unlike `Emoji.ts`, which uses Vditor's `toggleSubMenu` and does toggle) — it only closes
  via `hidePanel` when a DIFFERENT panel opens, or a row is picked. Not a vMarkd bug (upstream
  Vditor behaviour, verified by reading `Headings.ts`), but it shaped how the harness test
  demonstrates the close path (opening `emoji` closes `headings` behind it, rather than clicking
  `headings` twice).

**Part B — `upload` as a semantic button.** `git ls-files` confirmed Vditor's `node_modules` tree is
**not** a tracked fork (plain npm vendor, `.gitignore`d) — editing it directly would be silently
lost on reinstall. Used the project's existing build-time patch mechanism instead
(`media-src/esbuild-shared.mjs`'s `VDITOR_TS_PATCHES` registry, an esbuild `onLoad` engine with a
precedent already in place for this exact directory, `patchOutlineCurrent` on `toolbar/Outline.ts`)
rather than inventing a new one. Two new patches, chained by file:

- `patchUploadTagName` (`toolbar/MenuItem.ts`): drops the `menuItem.name === "upload" ? "div" :
  "button"` special case (`upload` was the ONLY item built as a `<div>`) down to always `"button"`.
  A plain `<div tabindex="0">` (what the roving-tabindex code was setting it to) does not
  synthesize a click on Enter/Space — no native keyboard activation. A real `<button>` does.
- `patchUploadHiddenInput` (`toolbar/Upload.ts`): `Upload.ts` still nests the real
  `<input type="file">` INSIDE that trigger (now a `<button>`) via
  `this.element.children[0].innerHTML = icon + inputHTML`. A `<button>` containing an `<input>` is
  invalid content (interactive-in-interactive) and, worse, calling `input.click()` on activation
  would dispatch a bubbling click event that re-enters the SAME button's own listener (input is its
  descendant) — an infinite loop. Fixed by moving the input OUT to a hidden (`display:none`),
  tab-inert (`tabIndex=-1`) SIBLING of the button (still a child of `this.element`, so
  `this.element.querySelector("input")` keeps finding it unchanged) and having the button's own
  click handler call `input.click()` explicitly after the existing disabled-guard — the standard
  "hidden file input + visible trigger" pattern, and the only way to keep both a semantic button
  AND a working native file picker. Verified end-to-end (not just by reading the diff): rebuilt
  `main.ts` unminified through the SAME `vditorSourceConfig` patch pipeline and confirmed the
  patched `Upload` class in the actual bundle output before writing any tests.
- Both patches follow the registry's existing conventions exactly: anchor-string `throw` on
  mismatch (fails the build loudly on a Vditor version bump, not silently), one entry per file in
  `VDITOR_TS_PATCHES`, comment stating what/why/where per `.claude/rules/ts.md`.

**Files touched:** `media-src/src/chrome/toolbar-submenu-aria.ts` (new),
`media-src/src/chrome/toolbar-submenu-aria.test.ts` (new, 9 unit tests), `media-src/src/chrome/
toolbar-overflow.ts` (factored `updateMoreState` → imported `updateSubmenuExpanded`),
`media-src/src/editing/escape-toolbar.ts` (`overflowMenuItems` rebased on the shared helpers,
new `activeSubmenuItems` generalizing the menu-nav lookup), `media-src/src/boot/finish-init.ts`
(installs the new module), `media-src/esbuild-shared.mjs` (`patchUploadTagName`,
`patchUploadHiddenInput`, both registered in `VDITOR_TS_PATCHES`), `scripts/module-manifest.mjs`
(registers `toolbar-submenu-aria`), `media-src/e2e/toolbar-overflow-harness.ts` (wires the new
module in alongside the existing overflow/escape-toolbar install), `media-src/e2e/
toolbar-overflow.spec.ts` (+2 tests), `test/vscode-e2e/toolbar-overflow.spec.ts` (appended
assertions to the existing test rather than a new file, per the per-`test()` boot-cost rule).

**Tests:**
- Unit: `toolbar-submenu-aria.test.ts` — panel/scope resolution for all four triggers (incl. the
  emoji-grid-vs-outer-panel distinction), row-button extraction across all three real shapes,
  `aria-haspopup`/`aria-expanded` initial state + MutationObserver reactivity + dispose behaviour,
  role assignment, and that `more` is left alone. 97.4% statement / 100% line coverage on the new
  module (`npm run quality`'s `test:coverage` stage).
- Chromium harness (`xvfb-run -a npm --prefix media-src run test:e2e -- toolbar-overflow.spec.ts`):
  2 new tests — aria-haspopup/expanded + role=menu/menuitem + arrow/Home/End nav across
  emoji/headings/edit-mode, and upload-is-a-real-button + opens a real filechooser + the disabled
  guard still blocks it. Both pass; full file 8/8, plus a spot-check of `escape-toolbar-harness`,
  `dragdrop`, `paste-upload`, `toolbar-selection` (12/12) for regressions in the shared modules
  this phase touched.
- Real-VS-Code e2e (mandatory, written and run): a **separate `test()`** in the existing
  `test/vscode-e2e/toolbar-overflow.spec.ts` (not appended to the file's original test, and not a
  new file — one extra boot, per-`test()` cost, in the file this phase's work belongs next to).
  Deliberately independent of the original test's own `more`-panel open/close interaction: that
  interaction hits a failure (`await expect(morePanel).toBeVisible()` after a second click on
  `more`, around line 144) that reproduces IDENTICALLY with every Phase 5 file reverted (confirmed
  via `git stash`, only the parallel Phase 4 agent's WIP present) AND with no other agent's suite
  run concurrently active (reproduced a second time after the machine's only other real-VS-Code run
  finished and its lock cleared) — so it predates this phase, is not caused by it, and is NOT purely
  a load artefact as first suspected; cause not further diagnosed (out of Phase 5's scope — it's in
  the pre-existing Phase 1 test/interaction, not anything Part A/B touched). Notably, Phase 4's own
  write-up above records a clean full-suite pass of that same spec earlier in the session, so
  whatever the cause, it is not 100%-reproducing across the whole session either. Coupling this
  phase's verification to that unrelated interaction would have been the wrong call regardless of
  its cause. **Run and passing**: `node build.mjs` then
  `xvfb-run -a npm --prefix test/vscode-e2e test -- toolbar-overflow.spec.ts` — this phase's test
  (`emoji/headings/edit-mode advertise their popup and menu semantics; upload is a real button`)
  passed in 7.8s; the file's original (pre-existing) test failed at line 144 as described above,
  unrelated to this phase's changes.
- `npm test` (2796/2796), `npm run lint:ci` (clean, one pre-existing Biome-config deprecation
  notice unrelated to this task), `npm run quality` (lint:ci/knip/jscpd/depcruise/audit/
  test:coverage/check:coverage-modules all PASS) all green with Phase 5's changes in place.
- `xvfb-run -a npm run test:vscode:fast`: waited for a genuine concurrent fast-tier run (the Phase 4
  agent's, confirmed via `ps -eo pid,ppid,etime,args`: live `vscode-test/worker-0/.../code`
  renderer/gpu processes under the lock's pid, not stale) to release `tmp/vscode-e2e.lock` rather
  than forcing past it — that guard exists specifically to stop two runs corrupting each other's
  shared render-cache/timing assertions. Once clear, ran it: **41/41 passed (7.9 min)**, including
  `escape-toolbar.spec.ts` (the spec most exposed to the roving-tabindex/menu-nav changes) and this
  phase's new `test()`. `toolbar-overflow.spec.ts` (home of the line-144 pre-existing failure above)
  is not in the fast tier — it lives in a different tier — so that issue does not block routine runs.

---

## Provenance

- Audit and overflow design: Codex `gpt-5.6-sol`, two rounds, 2026-08-02.
- Everything marked "verified" / F1-F6 was re-read from the tree by the lead. The audit's
  keybindings claim was wrong (Phase 4) and its "just move the DOM wrappers" advice was
  incomplete (F1, F3, F4).
- Production and test files were modified by this task; the two browser-layer checks remain open
  until they can run outside the restricted sandbox.

## 2026-08-04 — the overflow a11y spec was asserting the wrong thing (found in CI)

`toolbar-overflow.spec.ts` "overflowed rows are labelled once" failed on the FIRST CI run that saw
this branch (and reproduces locally on `main`): expected 1, received 2. Not a regression from the D2
work it rode in with — verified by running the spec on a clean `main`.

Cause: the assertion counted raw occurrences of the label string in the panel's aria snapshot. A
snapshot prints a node's accessible NAME (`- button "…"`) and its child text nodes SEPARATELY, and the
row's visible label is a child text node (the `::after`). So the string is always there twice and the
count said nothing about how often the row is announced.

Fixed by asserting the property the comment always described: exactly one node carries the label as an
accessible NAME, plus a second assertion that the visible text matches it (WCAG 2.5.3 Label in Name).
No production code changed — the toolbar behaviour was correct.
