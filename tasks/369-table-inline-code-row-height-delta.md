# 369 — table rows holding inline code are 0.86px taller in Preview than in IR

**Status: 🔍 OPEN — root cause CORRECTED (see below), still unfixed pending a product decision.**

⚠️ The original analysis in this file was WRONG about the mechanism. It is not line metrics and not
the IR editing wrapper's inline box. Corrected account first; the old text is kept below for the
record.

## Corrected root cause — where the line breaks, not how tall it is

Measured precisely: the IR editing markers have **width 0**, so they displace nothing, and the code
text has the SAME total width in both panes (85.64 in IR; 64.23 + 21.42 = 85.65 in Preview). The
difference is that **Preview breaks the word in half** and IR does not:

- Preview: `SVG post-` / `processing currentCo` / `lor`
- IR: `currentColor` kept whole

It happens only where the source glues text to inline code with no space —
`SVG post-processing`​`` `currentColor` ``. IR has an element boundary there, which is a legal place
to break a line; Preview has one continuous run, so `overflow-wrap: anywhere` (inherited from the
cell) breaks mid-word. The 0.86px per row is a CONSEQUENCE of that extra line fragment.

And the reason the numbers looked unstable across runs: **the document itself changes on a mode
switch** — see task 370. After an IR → WYSIWYG round trip Lute inserts the missing space, and then
Preview matches IR exactly (1062.88 both).

## Options measured in the real webview

| candidate (Preview) | table | code stays whole | long token |
|---|---|---|---|
| none (today) | 1067.17 | ✗ splits | wraps, no overflow |
| `overflow-wrap: normal; word-break: normal` | **1062.88** ✓ | ✓ | **overflows the cell (431px in a 181px column)** |
| `overflow-wrap: break-word` / `word-break: keep-all` / combinations | 1067.17 | ✗ | wraps |
| **zero-width break opportunity at the code boundary** | 1068.03 | ✓ | ✓ wraps, no overflow |

The last row is the user's suggestion — "let `currentColor` move to a new line, and let a very long
one still break". It works, via an empty `::before`/`::after` atom
(`content: ""; display: inline-block; width: 0`), which creates a break opportunity without inserting
any text — so, unlike a literal U+200B, nothing can ride along into a clipboard copy. Its cost is
that the numeric delta grows slightly (4.29px → 5.15px) because the code then occupies its own,
taller line box.

So there is no option that is best on both axes: closing the pixel gap requires never breaking inside
inline code (overflow risk), and fixing the ugly split leaves the pixel gap.

---

## Original (superseded) analysis


## Measured (all-renderers fixture, `theme.content: auto`)

The renderer table: **IR 1062.88px, Preview 1067.17px — 4.29px over 17 rows.** Exactly 5 rows differ,
each by ~0.86px, and every one of them contains inline code:

| row | IR | Preview |
|---|---|---|
| 1 math (KaTeX) … `currentColor` | 55.86 | 56.72 |
| 6 graphviz, 7 plantuml, 10 wavedrom, 11 nomnoml | 76.86 | 77.72 |
| the other 12 rows | — | identical |

Cell padding, line-height, font-size and font-family are IDENTICAL in both panes (6px/6px, 21px,
14px, mononoki). So this is not a theme or spacing difference.

## Cause — structural, not metric

IR wraps inline code in an editing node; Preview emits it bare:

```html
IR  …<span data-type="code" class="vditor-ir__node"><span class="vditor-ir__marker">`</span>
      <code data-newline="1">currentColor</code><span class="vditor-ir__marker">`</span></span>
PV  …<code>currentColor</code>
```

The wrapper span carries the BODY font metrics and contributes its own inline box to the line, which
absorbs the smaller code box; Preview's bare `<code>` contributes its own metrics directly and the
line box ends up 0.86px taller.

## Why it is NOT fixed

Every principled CSS lever was measured live in the real webview and none closes it:

| candidate (Preview only) | table height | vs IR 1063 |
|---|---|---|
| `code { line-height: inherit }` | 1067 | unchanged (an existing rule wins — computed stays 17.85px) |
| `code { padding-block: 0 }` | 1067 | unchanged |
| `code { vertical-align: middle }` | 1056 | overshoots |
| `code { line-height: 0 }` | 1056 | overshoots |
| `td code { line-height: 21px }` | 1082 | worse |

And forcing the SAME rule on both panes makes it worse, which is the finding that settles it:

| shared rule | IR | Preview | delta |
|---|---|---|---|
| none | 1062.88 | 1067.17 | **4.29** |
| `td { line-height: 21px !important }` | 1072 | 1082 | 10 |
| `td { line-height: 1.5 !important }` | 1062.88 | 1067.17 | 4.29 (no effect) |
| `td code { line-height: 21px !important }` | 1072 | 1082 | 10 |

The two panes respond DIFFERENTLY to an identical rule — confirming the difference is the DOM shape,
not a value. The only way to land on 1063 exactly would be a magic line-height fitted to this font at
this size, applied to all inline code in tables. That is fitting a number, not fixing a cause, and it
would break under any font or size change.

## If it is ever picked up again

The real fix would be to stop the IR editing wrapper from altering line metrics — e.g. making the
`.vditor-ir__node` code wrapper contribute no inline box of its own (`display: contents`-like
behaviour), so both panes lay out from the `<code>` alone. That touches the editable inline-code
surface, which has its own regressions on record (inline-pad.spec, the `.4em` padding re-assert), so
it needs its own careful pass — not a drive-by.

## Perspective

0.86px per affected row, 4.29px over a 1063px table, on rows that contain inline code. It is below
the threshold of anything a reader can see, and the mode-switch scroll anchors absorb it. Documented
so the next sweep recognises it instead of re-deriving it.
