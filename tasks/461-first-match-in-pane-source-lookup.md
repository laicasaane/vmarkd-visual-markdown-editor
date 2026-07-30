# Task 461 — `nativeSourceForPane`'s `data-code` read takes the FIRST match in the pane, which is wrong for `.vditor-preview`

**Status:** 🔵 **OPEN — not started.** Filed while root-causing task 454; deliberately out of that
task's scope. · **Impact:** 🟡 medium (wrong diagram redrawn on a theme flip, but only with 2+
diagrams of the same lang in split/full Preview) · **Origin:** code reading during task 454's root
cause, 2026-07-30.

## Problem

`media-src/src/native-offscreen.ts`'s `nativeSourceForPane` resolves a diagram's source like this:

```ts
const stamped = pane.querySelector(`.language-${lang}`)?.getAttribute('data-code')
if (stamped != null) return stamped
```

`querySelector` = the FIRST match inside `pane`. That is correct for `.vditor-ir__preview` and
`.vditor-wysiwyg__preview`, which wrap exactly ONE diagram each. It is **not** correct for
`.vditor-preview`: the full/split Preview surface is a SINGLE pane containing every diagram in the
document. With two or more diagrams of the same lang there, every one of them resolves to the
first one's source.

Callers affected: `mermaid-retheme.ts` (per-pane loop), and `render-cache-client.ts` in two places.

## Why task 454 could not surface it

`test/vscode-e2e/fixtures/all-renderers.md` has exactly one diagram per language, so first-match and
correct-match are the same element. Task 454 fixed the echarts path by reading `data-code` off the
LIVE node it is already iterating (not via this helper), precisely to avoid this hazard — so 454's
own fix is not affected, but the helper it deliberately avoided still has the bug.

## Scope

- [ ] Reproduce first: a fixture with TWO mermaid diagrams with visibly different content, opened in
      `sv` mode, theme-flipped — assert each keeps its own shape. Measure before changing anything;
      it is possible a caller already scopes narrowly enough that the bug is unreachable in practice.
- [ ] If real: give `nativeSourceForPane` a per-live-node entry point (the same shape task 454 used
      for echarts) rather than widening the pane search, and route the callers through it.
- [ ] Unit test with two same-lang nodes in one synthetic `.vditor-preview`, each with its own
      `data-code`, asserting each resolves to its OWN source.

## Out of scope

- The echarts path (task 454) — already fixed by reading off the live node.
