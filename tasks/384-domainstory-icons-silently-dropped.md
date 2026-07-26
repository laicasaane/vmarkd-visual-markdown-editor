# 384 — `domainstory` renders without any icons, and nothing says so

**Status: 🔍 MEASURED, no fix written.** Found 2026-07-26 finishing the sweep of vendored PlantUML
libraries that had never been drawn in the editor (tasks 382 → 383).

## What was checked

The last two of the ten vendored libraries, `edgy` and `domainstory`, rendered in a real VS Code on
`github-dark` (`tmp/icons/edgy-domainstory.md`).

- **`edgy` — correct.** Renders, takes the dark adaptation (4 adapted fills), reads cleanly: light
  ink on `#23272d` cards. Nothing to do.
- **`domainstory` — renders, but EVERY ICON IS MISSING.** The structure is there (actors, the
  activity arrow, the numbered step badge in the library's cyan `#66FCF1`) and the labels are
  readable, but `Person`, `Document` and `System` draw no figure at all — just their text.

## Why

`domainstory` does not ship its own sprites. It pulls them from ANOTHER stdlib library, at the one
`!include` in the whole file:

```
!if $icon
    !if %not(%variable_exists($variableName))
        !include <material2.1.19/$icon>
        %set_variable_value($variableName, "$ma_" + $icon)
    !endif
```

Two independent reasons that cannot resolve offline:

1. **`material2.1.19` is not vendored.** The fetch script (task 354) ships ten libraries; the
   material icon set is not among them.
2. **The key is a VARIABLE.** Our stdlib expander (task 136) is a TEXTUAL pre-inliner — it maps
   `<lib/path>` to vendored file text before the engine runs, and it does not evaluate PlantUML
   variables. The referenced key is literally `material2.1.19/$icon`, so vendoring the material set
   would NOT fix this on its own: at expansion time we still do not know which icon is wanted.

So the include is dropped, the sprite name never gets defined, and the engine draws an empty shape.

## The part that makes it a defect rather than a limitation

`expandStdlib` ALREADY records this: it returns a `missing: string[]` of every referenced-but-absent
key and leaves a marker comment in the source
(`' [vmarkd: stdlib file not found offline: <…>]`). **`plantuml-render.ts` never reads that list** —
nothing is surfaced. The diagram renders looking complete, quietly missing every icon, and the user
has no way to know why. There is already a note mechanism for the sibling case
(`hasRemoteInclude` → a note about remote includes); this one just was not wired to it.

That is the piece worth fixing regardless of what is decided about material: a silent degradation
where an accurate diagnosis is already computed and thrown away.

## Options — none chosen

1. **Wire up `missing`** (small, self-contained): surface the same note the remote-include case
   shows — "these stdlib files are not available offline: …". Fixes the silence for every library,
   not just this one. Does not make domainstory draw icons.
2. **Vendor `material2.1.19` AND resolve variable keys.** The expander would have to evaluate
   `%set_variable_value`/`!$var` enough to know which icon file is wanted, or inline the whole
   material set unconditionally (it is large — the icon sets we ship run 46 KB–3.7 MB, and material
   is bigger than most). Much larger change; the expander is deliberately textual.
3. **Leave the icons out, document it.** domainstory is usable as a text-and-arrows notation; its
   own README does not promise the icons without the material dependency.

## Reproduction

`tmp/icons/edgy-domainstory.md`, screenshots `tmp/icons/{edgy,domainstory}-github-dark.png`. The
probe spec was throwaway and is not committed (it opened that file, waited 45 s for the engine, and
reported per block: rendered/errored, sprite counts, adapted-fill count, and every shape/text fill).

## Not done

- Neither library was checked on a LIGHT theme. `edgy` is adapted-and-correct on dark, which is the
  harder direction; `domainstory`'s missing icons are theme-independent.
- No fix, no test, for either the note or the icons.

## Sweep status

With this, all ten vendored PlantUML libraries have now been rendered in the editor at least once:
c4, awslib, azure (task 382) · eip, k8s, cloudinsight, cloudogu (correct), kubernetes (task 383) ·
edgy (correct), domainstory (this task).
