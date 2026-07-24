# 369 — table rows holding inline code are 0.86px taller in Preview than in IR

**Status: 🔍 OPEN — fully measured, NOT fixed. Recommendation: leave it.**

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
