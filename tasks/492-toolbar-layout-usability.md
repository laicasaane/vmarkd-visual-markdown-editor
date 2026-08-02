# 492 — Toolbar: responsive overflow (+ the usability findings around it)

Status: **Phase 1 ready to implement — nothing blocking.** Phases 2-5 are specified but
gated. Nothing implemented yet.

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

**Phases 2-5** (labels, localisation, keybindings, the rest of ARIA) are independent and
gated — see [Later phases](#later-phases--specified-but-gated).

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

- [ ] no item is ever unreachable: at any width, everything is either in the row or in `more`
- [ ] **`more` is visible at every width, down to the narrowest the panel can go** — it is
      the only route to everything else, so this is the criterion the whole design hangs on
- [ ] the pinned cluster gives way only after every other item has, and in the decided order
- [ ] items return to their **authored position** when the panel widens
- [ ] no oscillation: sweeping the width slowly across every threshold produces monotonic
      moves, and holding a width on a threshold produces none
- [ ] hidden tab (width 0) → reopen leaves the layout unchanged and unwrapped
- [ ] everything in `more`, including overflowed items, is keyboard-reachable and announced
- [ ] buttons do not grow below 520px, and tooltips still appear there
- [ ] a nested panel (`emoji`, and `edit-mode` at the narrowest widths) opens in the right
      place from inside `more`, with no stray `--arrow`

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

---

## Later phases — specified but gated

Independent of Phase 1. Do not bundle them into it.

### Phase 2 — labels and icons

`Line` → `Horizontal Rule`, `Order List` → `Numbered List`, uniform 16×16 icons.
Files: `toolbar.ts`, `toolbar-icons.ts`. Note these strings feed `aria-label`
(`MenuItem.ts:30`) and therefore the overflow row labels from F5.

### Phase 3 — localisation

`media-src/src/util/lang.ts` covers 15 strings; only `en_US` and `zh_CN` are complete
(`ja_JP` / `ko_KR` have `save` and nothing else). Separately, the `more` submenu labels in
`toolbar.ts:199,211,214` — `Settings`, `About Vditor`, `About vMarkd` — are **hardcoded
English literals**, not `t()` calls.

Routing those three through `t()` is mechanical and safe. What the two near-empty locales
should do is **a decision, not a task** — ask before filling or removing them.

### Phase 4 — keyboard shortcuts — NEEDS A DECISION FIRST

> **Correction to the audit.** It claimed vMarkd registers no `contributes.keybindings`.
> **False** — `package.json:767+` declares four: `ctrl+shift+v` → `vmarkd.pastePlain`,
> `ctrl+enter` → `vmarkd.activateLinkAtCaret`, `ctrl+alt+e` → `vmarkd.openTextEditor`,
> `ctrl+f` → the webview find widget, all gated on
> `activeCustomEditorId == vmarkd.editor`.

What is true: the **formatting** hotkeys (Ctrl/Cmd+B/I/D/K/L/O/J/U/G/M/Z/Y…) are baked into
Vditor and swallowed inside the webview — invisible in VS Code's Keyboard Shortcuts UI, not
rebindable there, and a collision risk with the workbench. Redo also accepts
`Shift+Ctrl/Cmd+Z` without advertising it in its tooltip.

Fixing the Redo tooltip is trivial and can ride along with Phase 2. **Promoting the Vditor
formatting hotkeys into `contributes.keybindings` is a much bigger call** — each needs a
real command plus a webview round-trip, and it changes who owns the key. Do not start it
without an explicit decision.

### Phase 5 — the rest of ARIA

Beyond the H-subset Phase 1 requires: `aria-haspopup` / `aria-expanded` on the other three
submenu triggers (`emoji`, `headings`, `edit-mode`), menu semantics inside those panels, and
replacing `upload` — which `MenuItem.ts:23` builds as a `div` wrapping a hidden
`<input type=file>` — with a semantic button.

---

## Provenance

- Audit and overflow design: Codex `gpt-5.6-sol`, two rounds, 2026-08-02.
- Everything marked "verified" / F1-F6 was re-read from the tree by the lead. The audit's
  keybindings claim was wrong (Phase 4) and its "just move the DOM wrappers" advice was
  incomplete (F1, F3, F4).
- No production file has been modified by this task yet.
