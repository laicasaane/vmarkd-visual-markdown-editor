# 504 — `toolbar-overflow.spec.ts`: `more` panel fails to reopen on second click (real VS Code)

Status: **DONE 2026-08-10 — root-caused and fixed, extended to all toolbar submenus.** The panel was
left OPEN across an overflow layout change; the second toggle click closed it instead of reopening
it. Fix: the overflow pass closes **every** open toolbar submenu panel (`more` +
`emoji`/`headings`/`edit-mode`) whenever the overflow set changes.

## The failure

`test/vscode-e2e/toolbar-overflow.spec.ts`'s original (pre-task-492-Phase-4/5) test fails around
line 144: `await expect(morePanel).toBeVisible()` after a **second** click on the `more` trigger
(post-widen-to-1400px) — the panel resolves hidden instead of visible again.

## Root cause (measured, 2026-08-10)

The chromium harness (same page JS, ~1 s/test) reproduced it deterministically. State logged across
the open → widen → second-click cycle:

| step | inline `display` | `aria-expanded` | overflowed items |
|---|---|---|---|
| after first click (360 px) | `block` | `true` | 16 |
| after widen to 1400 px | `block` | `true` | 0 (items restored) |
| after second click | `none` | `false` | 0 |

The panel is left `display:block` (open) when the widen's overflow pass restores the items — the
pass never touches the panel's visibility. The second click then hits Vditor's `toggleSubMenu`
(`dist/index.js`, bound in the `Toolbar` constructor), which reads
`panelElement.style.display === "block"` and **closes** it. So the "reopen" assertion fails.

The real-VS-Code intermittency is just this stale-open state racing whatever occasionally closes the
panel in the real editor between the widen and the second click (a synthetic focus/click from the
host, a re-render path, etc.) — when something closes it, the second click reopens it and the test
passes; when nothing does, it fails. Both directions share one root cause: the panel's open state is
not tied to the overflow layout it describes.

### Why nothing else was at fault

- **Not Phase 4/5** — confirmed during task 492 close-out (reproduces with every Phase 5 file
  reverted), and the harness repro above uses none of that code.
- **Not concurrent load** — the harness repro has no other process involved at all.
- **Not a `--left`/panel-positioning overlap** — the open panel never covers the trigger (logged
  `coversTrigger: false`), so the second click genuinely lands on the button; it toggles.

## The fix

`media-src/src/chrome/toolbar-overflow.ts` — `apply()`'s write phase (the branch that runs only when
the overflow *set* changed) now closes **every** open toolbar submenu via a new
`closeSubmenuPanels()` in `toolbar-submenu-aria.ts` (which knows all four triggers and how to find
each panel wherever the item currently sits — row or `more`):

```ts
closeSubmenuPanels(toolbar)
```

An open menu whose contents just moved is stale by definition (items that returned to the row
vanish from the more menu; an item that just overflowed carries its open emoji/headings/edit-mode
panel into `more` with it). Closing them all means the next click re-opens a menu that matches the
row. The close is gated on a *signature change*, so open panels are left alone while the overflow
set is unchanged (e.g. a resize within the hysteresis band). Each trigger's own MutationObserver
(and `updateSubmenuExpanded` at the end of the pass, for `more`) then mirrors `aria-expanded` back
to `false`.

## Tests (per AGENTS.md)

- **Unit** (`media-src/src/chrome/toolbar-overflow.test.ts`, 3 new): closes the more panel when the
  overflow set changes; keeps it open when the set is unchanged; closes an open emoji panel on the
  same change. (`toolbar-submenu-aria.test.ts`, 2 new): `closeSubmenuPanels` closes every panel
  open or not, is idempotent, and skips a trigger the toolbar does not have.
- **Chromium harness** (`media-src/e2e/toolbar-overflow.spec.ts`, 2 new tests): the more-panel
  open → widen → hidden + `aria-expanded=false` → reopen cycle, and the emoji-picker-inside-more →
  widen → picker closed cycle. Fast nets for both halves of the state leak.
- **Real VS Code** (`test/vscode-e2e/toolbar-overflow.spec.ts`): the existing failing test is the
  regression net — made reliably green, not weakened — plus one new test for the emoji submenu case
  (opened inside `more`, widen returns it to the row, the picker must not travel back open).

## Verification record

- `npm test` — 2863/2863 unit tests pass (200 files).
- `xvfb-run -a npm --prefix media-src run test:e2e` — 462/462 harness tests pass.
- `xvfb-run -a npm --prefix test/vscode-e2e test -- toolbar-overflow.spec.ts --repeat-each=3` —
  9/9 pass (3 tests × 3 repeats); pre-fix the same spec fails.
- `npm run quality` — PASS on every code-quality stage (`lint:ci` whole-tree, knip, jscpd,
  depcruise, unit coverage, coverage ratchet). The one red stage is `audit`: a pre-existing
  `nanoid@3.3.16` advisory (transitive dev-dep via vitest→vite→postcss), unrelated to this change —
  no dependency file was touched.
