# 381 — d2 sql_table / class tables are too bright on a dark theme

**Status: ✅ DONE** (variant B, chosen by the user from a rendered comparison sheet)

## Report

> "w d2 diagramy klas tez zbyt jasne" — with a screenshot of an ER diagram on a dark page whose
> tables read as white blocks.

## What it is — measured, not eyeballed

The screenshot reads as "light tables", which suggests the BODY fill is wrong. It is not. Probed in a
real VS Code webview on a dark workbench, straight off the rendered SVG:

| `theme.content` | body | border | header band | row dividers |
|---|---|---|---|---|
| `auto` (default) | `#18181B` | **`#FAFAFA`** | **`#FAFAFA`** | **`#FAFAFA`** |
| `vscode-dark-2026` | `#121314` | `#bbbebf` | `#bbbebf` | `#bbbebf` |

The body is dark and correct. What is bright is the CHROME: a 2px border, a solid header band and a
divider under every row — dense enough that the block reads as a white rectangle at normal size.

Root cause: we ported d2's token mapping faithfully, and there `N1` is **dark ink on white `N7`
paper**. An editor-paired palette maps `N1` to the palette FOREGROUND and `N7` to the background, so
the relationship inverts and "a solid ink header" becomes a slab of near-white. The mapping is
faithful; the perceptual result is the opposite of what it is in d2.

Same class of bug as 376 (flowchart) and 377 (nomnoml): a monochrome/faithful colour rule that only
holds on the light background it was designed against.

## Fix

Three chrome colours split out of `text`/`paper` into their own `D2Style` tokens — `tableBorder`,
`tableHeaderFill`, `tableHeaderText` — so the two theme families can disagree:

- **`d2-*` catalog themes: unchanged.** They keep `N1 / N1 / N7`, so d2's own look is still faithful
  where the code claims to be faithful. Pinned by a unit test.
- **editor-paired + `auto`: muted.** Border and dividers take the LINE colour (the same one a plain
  rectangle strokes with and connections are drawn in), the header band becomes a raised SURFACE, and
  the title is drawn in the foreground on top of it.
- **`mono`: unchanged** (`currentColor` at `fill-opacity="0.12"`).

Four candidates (current / muted / accent band / no band) were rendered through the real engine in
four themes and shown to the user, who chose **B — muted**. The key comparison on that sheet was a
plain `Service` node beside the table: the table's border was far brighter than a normal shape in the
same diagram, which is why it jumped out.

### The band needs its OWN mix — caught by rendering, not by reading

The first cut reused `surface2`, the level-0 container fill. `fills` is indexed by nesting depth, so
a `sql_table` INSIDE a container (which the fixture has: `data: Data Stores { userdb: users
{shape: sql_table} }`) then painted its header in exactly the parent's background — the band
disappeared and the title floated in a hole. Confirmed by rendering the nested case in all four
themes before it shipped, and only visible that way; the code reads fine.

The band is now `mix(bg, fg, dark ? 0.24 : 0.14)`, clear of every entry in `fills` at any depth, and
a unit test asserts `fills` does not contain it.

## Verification

- **Unit** (`d2-theme.test.ts`, +5): the band is never the foreground, `tableBorder === leafStroke`,
  the title is foreground, the band collides with no container fill; `d2-original` still resolves
  `N1/N1/N7` and paints it; mono untouched. Proven to be a real net twice over — reverting the three
  token values turns exactly those 3 tests red, and so does reverting the band to `surface2`, while
  the catalog test stays green through both.
- **e2e** (`test/vscode-e2e/d2-table-chrome.spec.ts`, new): real VS Code, dark workbench, both
  `auto` and `vscode-dark-2026`. Asserts the band sits nearer the body than the title ink, that it is
  never light on a dark page, and that the table border equals the connection stroke. Also proven by
  reverting: 2 passed → 2 failed (with retries), restored → 2 passed.
- **Pixel matrix**: 5/5 green, zero baselines changed. State this honestly — it is evidence of NO
  COLLATERAL DAMAGE, not evidence of the fix: the suite captures the FIRST `d2` block of the fixture,
  which has no `sql_table`, so it would have stayed green throughout the entire bug. Extending the
  captured block to include a table is a separate decision (it would rewrite all 5 d2 baselines) and
  was deliberately not taken here.
- **Lint**: clean — and it flagged 2 files (`custom-diagrams.test.ts`, `flowchart-retheme.test.ts`)
  that were already unformatted at HEAD, i.e. committed that way earlier in this session. Fixed here.
- No version bump: 1.2.3 is bumped but not yet packaged or installed anywhere, so no cached render
  exists under it. Once 1.2.3 IS installed, the next render-output change needs 1.2.4.
