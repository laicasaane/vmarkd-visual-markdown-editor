# Task 497 — Full-width mode has NO top padding: the document sits flush against the edge

**Status:** done (2026-08-05) · **Impact:** ⚪ low (readability, but on every document) · **Origin:** user report while evaluating task 292 — "od góry dokumentu nie ma żadnej przerwy (a powinna być)"

## Problem

In FULL-WIDTH mode (`body[data-full-width="1"]`, the default) the editing surface had **zero** top
padding, so the first block touched the top edge of the pane. In NARROW mode it had 10px. Measured
in the real editor, on the user's own document:

```
Vditor's inline style (setPadding, ui/initUI.ts):  padding: 10px 35px
computed:                                          padding: 0px 52px
body[data-full-width]:                             1
strip above the first block:                       14px — ALL of it the block's own margin-top
```

Cause (`main.css`, the `body[data-full-width="1"] … .vditor-reset` rule): the full-width reset writes
the `padding` SHORTHAND to claim the symmetric side gutter — and a shorthand also sets the vertical
value, silently collapsing Vditor's inline 10px to 0. The narrow-mode rule overrides only
`padding-left`/`padding-right`, which is why that mode kept the 10px and the two modes disagreed.

The preview surface was then deliberately matched to the ZERO (`main.css`'s preview full-width rule,
whose comment records the earlier bug: preview had 10px the editor lacked, so its content sat 10px
lower and the first heading's margin collapsed differently). So the two surfaces were consistent
with each other and wrong together.

## Fix

Both full-width rules — the editor's and the preview's — now write `padding: 10px
var(--vmarkd-gutter, 52px)`, i.e. the same vertical value narrow mode already had. **They are a
pair:** changing one without the other re-opens the Edit↔Preview 10px shift its own comment records,
so both comments now say so explicitly.

Verified in the real editor: computed `10px 52px` on both surfaces, and the strip above the first
block went 14px → 24px (10px padding + the block's own 14px margin).

Side benefit, not the reason: that strip is the click target for task 292's gap cursor above a
document that starts with a diagram — 24px is a friendlier target than 14px.

## Checklist

- [x] editor + preview full-width rules carry the same vertical padding
- [x] comments rewritten (both said "0 to match the other" — that reasoning is now inverted)
- [x] measured in real VS Code before AND after (numbers above)
- [x] `content-theme.spec` / `width.spec` / `preview-scroll.spec` — 74 green
- [x] `@visual` goldens — 4 green (element-scoped, so a page-level 10px does not move them)
- [x] FAST real-VS-Code tier

## Not done

- SV mode shares the editor rule (`body[data-full-width="1"] .vditor-sv .vditor-reset`) and so gets
  the same 10px. That is intentional — it is a document surface too — but it was not separately
  evaluated by eye.
- The 10px is Vditor's own value, chosen for consistency with narrow mode, not because it was
  measured against VS Code's native markdown preview. If more breathing room is wanted later, it is
  one value in two places.
