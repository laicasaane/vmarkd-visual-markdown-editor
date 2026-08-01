# 367 — authored HTML comments did not reach the full Preview pane

**Status: ✅ FIXED** (product fix + unit tests + e2e + measured before/after)

## Symptom

`all-renderers.md` carries three authored comments, the first of which states the intent outright:

```html
<!-- This comment should be visible as muted text in IR, WYSIWYG, and Preview. -->
```

In the full Preview pane none of them was present — not as an element, not as a DOM `Comment` node,
not even as text. IR showed them. So a whole block existed in one pane and was missing from the
other.

## Root cause — Lute's sanitiser drops comments

The preview render calls Lute with `sanitize: true`. Reproduced directly against the shipped Lute:

```
Md2HTML                    → "<p>para</p>\n<!-- comment -->\n<p>para2</p>\n"
Md2HTML + SetSanitize(true) → "<p>para</p>\n<p>para2</p>\n"
```

The IR path (`SpinVditorIRDOM`) is unsanitised, which is why only one pane lost them.

## Fix — hand Lute something it keeps, do NOT turn sanitising off

Sanitising is what strips `<script>`/`onclick` from a hostile document; disabling it to show comments
would be a bad trade. Probed what survives:

| input | after sanitize |
|---|---|
| `<!-- hi -->` | **dropped** |
| `<div class="vmarkd-comment" data-…>` | kept intact |
| `<script>alert(1)</script>` | dropped |
| `<div onclick="alert(1)">` | attribute stripped |

So `maskCommentsForPreview()` (`media-src/src/html-comment.ts`) rewrites each block-level comment in
the markdown SOURCE into `<div class="vmarkd-comment">&lt;!-- text --&gt;</div>` before Lute runs.
Wired in by a new esbuild patch on the single `markdownText` binding both preview render branches
read.

Two properties the implementation has to get right, both unit-tested:

- **Fenced code is untouched.** Inside a fence `<!-- … -->` is literal text the reader asked to see,
  so the function tracks fences (backtick and tilde, CommonMark length rules) instead of running a
  regex over the document.
- **Preview-only.** It transforms a local copy of the markdown; the saved document is serialised from
  the editor's own DOM. The e2e asserts `getValue()` never contains the injected class.

Mid-paragraph comments are deliberately left alone — they are inline content, and turning one into a
block element would reflow the paragraph.

### Two spacing fixes that followed

Once the comments were visible the panes could finally be compared, and both differences were real:

1. **IR was 21px taller per comment.** The collapsed `html-block` node's editable source is a
   `pre.vditor-ir__marker--pre` laid out `display:inline-block` — height 0, but still forming a line
   box worth one line-height. Same phantom, and same fix, as the existing collapsed code/math rule:
   lift it out of the inline flow. `data-type="html-block"` simply was not in that rule's scope.
2. **Adjacent comments sat 14px tighter in Preview.** IR's 0.5em breathing room lives on the injected
   `.vditor-ir__preview` (contenteditable=false, so it does not margin-collapse); the Preview pane's
   bare div had none. Added as a margin — `padding` closes the gap fully (document totals within 2px)
   but moves the space inside the block, making each comment 14px taller than its IR twin and
   tripping `parity.spec`'s 8px per-block guard. Same visible spacing, better per-block parity.

## Measured (all-renderers fixture, `theme.content: auto`)

Whole-document flow, IR vs Preview: **254px apart → 23px**. Paired blocks 121 → 124 (the comments
now pair at all). The comment blocks themselves went `dh=-42/-9` → `dh=0/-6`.

## Tests

- `html-comment.test.ts` — 14 cases, 9 new: the rewrite, multi-line comments, HTML escaping of the
  body, fenced code left alone (backtick and tilde, longer closing fences), masking resumes after a
  fence closes, inline comments untouched, empty comment, unterminated comment.
- `vditor-source-patches.test.ts` — anchor present pre-patch, routed through the mask post-patch,
  throws on version drift.
- `mode-switch-render-reuse.spec.ts` — the three comments appear in Preview, none inside a fence, and
  the injected markup never reaches `getValue()`.

## Not done

- **WYSIWYG** is untouched (task 366's remaining scope).
- Comments inside a fence are still literal in both panes, which is correct — but nothing asserts
  the IR side of that.
