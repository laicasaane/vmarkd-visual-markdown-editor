# 398 — mermaid lines/borders/arrows on vscode-*-2026 don't follow the accent colour

**Status: ⚪ NOT REPRODUCED in a clean environment — likely a local setting, needs the user's config
to confirm.**

## Report

> "mermaid na vscode dark nie jest niebieski a powinien (tak jak inne diagramy)" — mermaid on
> `vscode-dark-2026` isn't blue, but should be (matching the other diagram engines).
> "w mwrmaidzie chodzi o linie i ramki i strzalki" — specifically lines, borders/frames, arrows.
> "kolory cos sie popsuly jesli chodzi o zgodnosc z vscode tematem w marmeidzie" — user believes
> this is a regression (colours "broke").

Cross-reference: `vscode-2026 line==accent → palette diagram lines are blue there ON PURPOSE`
(memory from an earlier session) — so blue lines on `vscode-dark-2026` are the INTENDED look, not
something to neutralize. This report is that the intended look isn't showing up.

## What was checked

`src/mermaid-palettes.ts`'s `vscode-dark-2026` entry: `line: '#48a0c7', accent: '#48a0c7'` — the
palette data is correct (blue). `paletteToThemeVariables()` maps `lineColor: line, nodeBorder: line`
— the mapping into mermaid's `themeVariables` also looks correct on read. `mermaid-theme.ts`'s
`resolveMermaidInit` threads a content-theme-paired palette through `theme:'base'` +
`themeVariables` when the `diagram.mermaidTheme` setting is `auto`/unset. No recent commit in this
session touched `mermaid-theme.ts` or `mermaid-palettes.ts` (`git log` on both files — last touch
was the `72a63f` VS Code 2026 palette commit, well before this session).

So the wiring READS as correct end to end in the source — this needs a REAL webview measurement
(actual applied `theme.content` setting, actual rendered mermaid SVG stroke colours on
`vscode-dark-2026`) before concluding anything, per the project's no-fix-without-measurement rule.
Candidates not yet ruled out:
- the user's actual `vmarkd.diagram.mermaidTheme` setting is an explicit non-`auto` value that
  wins over the content-theme pairing (see `resolveMermaidInit`'s precedence order);
- `pairedPalette(contentTheme)` not resolving `'vscode-dark-2026'` for some reason (naming/migration
  edge case — `content-theme-migration` memory notes stale-enum handling is a known trap);
  arrowhead markers specifically may not inherit `lineColor`/`nodeBorder` the way mermaid's marker
  `<defs>` are styled (a separate CSS/attribute path from node/edge strokes) — arrows were called
  out by name in the report, worth checking in isolation from lines/borders.

## Measured — real webview, clean settings

`test/vscode-e2e/fixtures/all-renderers.md`'s `graph TD` block, `theme.content: vscode-dark-2026`,
`theme.mermaid: auto` explicitly set (a clean profile, no leftover overrides): edge `<path>` stroke,
node `<rect>` stroke, and arrowhead `<marker>` fill are ALL `rgb(72, 160, 199)` = `#48a0c7` — the
intended accent blue, on lines, borders AND arrows. The wiring is correct end to end in a fresh
environment.

## Conclusion

Not reproduced from source/config review + a clean real-webview render. The most likely explanation
for the user's report is a **local setting**, not a code defect — `resolveMermaidInit`'s precedence
means an EXPLICIT `vmarkd.theme.mermaid` value (a mermaid built-in like `default`/`dark`/`forest`/
`neutral`) wins over the content-theme pairing entirely and would show mermaid's generic palette
instead of the vscode-2026 accent, which would look exactly like "colours broke" if that setting was
ever touched (by the user or a settings-sync). Needs the user to confirm their actual
`vmarkd.theme.mermaid` and `vmarkd.theme.content` values before any further action — not a fix
target as it stands.
