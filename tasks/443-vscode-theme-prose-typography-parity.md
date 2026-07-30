# 443 — vscode-*-2026 prose reads bigger than VS Code's own preview

**Status:** ✅ DONE (2026-07-30) — prose parity shipped and measured. Two findings deliberately
NOT acted on are listed under [Not done](#not-done).

## Report

> "It seems to me the font size (vscode dark style) for blockquote in VS Code preview is different
> than ours; I'd like the font to be the same size (and really, for the vscode theme, to match the
> VS Code dark 2026 preview font size everywhere)."

Two crops of the same blockquote line — VS Code's built-in preview vs vMarkd under
`vmarkd.theme.content: vscode-dark-2026`.

## What it actually was — the premise was wrong

The font **size was already identical**. Measured side by side in ONE real VS Code instance, same
file, so `editor.fontSize` / `markdown.preview.*` / window zoom are equal by construction
(`test/vscode-e2e/font-parity.spec.ts`):

| | vMarkd (before) | VS Code preview |
|---|---|---|
| prose font-size | **14px** | **14px** |
| prose line-height | **21px** (1.5) | **22.4px** (1.6) |
| inked width of `The quick brown fox jumps` | **166.52px** | **188.45px** |

So the real divergences were the **leading** and the **font stack** — never the size:

1. **Leading.** Vditor ships `.vditor-reset { line-height: 1.5 }` (`media/vditor/dist/index.css:817`);
   VS Code's preview uses `markdown.preview.lineHeight`, default **1.6**. At an identical glyph size,
   tighter leading reads as "the font is bigger" — which is exactly what was reported.
2. **Font stack.** `main.css`'s named-theme bridge forces GitHub's sans stack on *every* named theme;
   the preview uses `markdown.preview.fontFamily`
   (`-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", system-ui, "Ubuntu", "Droid Sans", sans-serif`).
   On **Windows both land on Segoe UI** (verified: `Segoe WPC` is not installed in
   `C:\Windows\Fonts`), so this was a no-op for the reporter — but on Linux/macOS the two stacks
   resolve to *different faces*: measured **13% narrower** text than the preview these themes exist
   to reproduce.

### Ruled out by measurement, not by reading

- `editor.fontSize` / `markdown.preview.fontSize` overrides — **absent** from the reporter's
  settings (checked the Windows-side `settings.json` and every profile), so both sit at the 14px
  default. This killed the first hypothesis (that the registry's `fontDefaultPx: null` let the
  vscode themes inherit a scaled *editor* font).
- The first cut of the probe "measured" widths that were really **pane widths**: a `Range` spanning
  more than one line box returns a UNION rect. The spec now asserts `rectCount === 1` and
  cross-checks with `canvas measureText`, so this cannot silently regress.

## Fix

Both `media/markdown-themes/vscode-{dark,light}-2026.css` gained ONE rule:

```css
body.markdown-body .vditor .vditor-reset {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", system-ui, "Ubuntu", "Droid Sans", sans-serif !important;
  line-height: 1.6;
}
```

- `!important` at *exactly* that specificity: the rule it fights (`main.css`'s named-theme bridge,
  same selector) is itself `!important`, and the content-theme `<link>` is emitted **after**
  `main.css` (`src/html-builder.ts` — `cssFiles` then `contentThemeLinks`), so an equal-specificity
  declaration here wins on order.
- Values are static, with `markdown.preview.lineHeight` / `.fontFamily` defaults named in the
  comment. The settings are deliberately **not** plumbed through — see [Not done](#not-done).
- Blast radius: `vmarkd.theme.content` defaults to `auto`, so only users who explicitly picked a
  vscode theme are affected.

### After

| | vMarkd (after) | VS Code preview |
|---|---|---|
| prose font-size | 14px | 14px |
| prose line-height | **22.4px** | 22.4px |
| inked width | **188.45px** | 188.45px |

Identical on **both** themes, for a blockquote paragraph *and* a plain paragraph.

## Tests

- [x] `test/vscode-e2e/font-parity.spec.ts` (**new**) — opens the fixture in vMarkd, then in
      `vscode.markdown.preview.editor` in the same window, and asserts font-size, line-height and
      inked width match, per theme (dark + light). Golden-free, so it is valid on any machine
      regardless of installed fonts: both sides resolve the same stack on the same system.
      Also asserts all six heading sizes + leadings match the preview. **2 passed.**
- [x] `media-src/e2e/content-theme.spec.ts` (**+2 tests**) — the CI-side cascade guard: computed
      leading is 1.6 × base and the stack contains `Segoe WPC`, i.e. the theme out-ranked the
      `!important` bridge in the real load order. (The real-VS-Code spec does not run in CI.)
      **62 passed** in that file, including `blockbg` and the `d2 |md|` typography tests — the
      change does not leak into D2 markdown labels.
- [x] `test/backend/content-theme.test.ts` (**+3 tests**) — both hand-maintained twin theme files
      declare the contract (a rule added to only one is a silent per-mode inconsistency).
      **8 passed.**
- [x] Coverage: the change is pure CSS in `media/markdown-themes/`, which the v8 instrumentation
      does not see — there is no new TS to cover. The three layers above are the net.

## Not done

1. **`markdown.preview.*` are not read.** Following `markdown.preview.fontSize` instead of
   `editor.fontSize` for these themes would be the fully faithful model, but today it is a **no-op**
   (both default to 14px) while changing behaviour for everyone who scaled their editor font — plus
   it needs `ThemeDef` widening, CSS-var plumbing and a new config-change listener
   (`editor-session.ts` filters on `'vmarkd'`). Deliberately deferred; the existing
   `vmarkd.editor.fontSize` still overrides everything.
2. **Heading leading was NOT changed — and must not be.** The plan was to align headings to 1.6 too;
   measurement showed VS Code's preview headings are at **1.25** (h1 line box 35px = 1.25 × 28px),
   i.e. exactly what Vditor already gives us. All six levels now assert equal size AND leading
   against the preview. The assumption that markdown.css leaves headings inheriting 1.6 was wrong.
3. **Pre-existing: the H2–H6 gutter markers sit low under these themes.** `main.css:1222-1227`
   centres the floated `H1…H6` markers with six constants that are all exactly
   `1.25 × VDITOR's heading scale × 16px ÷ 13.6px` — derived from Vditor's scale at a 16px base,
   while the vscode themes set their own `2em…0.85em` scale at 14px. Only H1 coincides; measured
   marker-vs-heading line-box deltas: **H1 0.01px, H2 4.74px, H3 5.72px, H4 7.50px, H5 7.29px,
   H6 5.13px** (≈ half of each shows as visual misalignment). Independent of this task, invisible to
   the reporter (they run `editor.headingMarkers: false`), and fixing it is a user-facing visual
   change — so it is logged by the parity spec, not silently retuned. A robust fix exists and was
   prototyped: state the marker's line box as a LENGTH,
   `calc(1.6 × <per-level scale> × var(--me-font-size, 14px))`, which is exact and tracks the
   configured font size instead of hardcoding six numbers.
