# 384 — `domainstory` renders without any icons, and nothing says so

**Status: ✅ THE SILENCE IS FIXED (2026-07-26).** A diagram that could not resolve an include now
says so, naming the file. The icons themselves are still absent — that part is unchanged and
decision-gated (options below).

Two corrections to the first version of this write-up, both found by reading the code rather than
assuming:

1. It said "there is already a note mechanism for the sibling case (`hasRemoteInclude` → a note about
   remote includes)". **There was not.** `hasRemoteInclude` was used ONLY as a gate deciding whether
   to run the expander; a remote include was every bit as silent. The fix covers both.
2. It implied the missing `material2.1.19` was an oversight. **It was a documented decision** —
   `plantuml-render.ts` carries the task-354 note: "domainstory references material2.1.19 only inside
   a `!if $icon`-guarded procedure — an optional icon feature needing an unvendored 16 MB lib; core
   DomainStory renders without it, so it is deliberately NOT a dependency." The defect was never the
   omission; it was that nothing told the user the omission had consequences.

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
nothing read that list. The diagram rendered looking complete, quietly missing every icon, and the
user had no way to know why. A remote `!include` was the same: `hasRemoteInclude` existed only as a
gate deciding whether to run the expander, never as a signal.

That was the piece worth fixing regardless of what is decided about material — a silent degradation
where an accurate diagnosis is already computed and thrown away — and it is what got fixed.

## Options — none chosen

1. ~~**Wire up `missing`**~~ — **DONE.** `plantumlRenderNote` (pure, unit-tested) builds ONE message
   for everything that made a render quieter than its source asked for: the dropped extra diagrams of
   a multi-diagram fence (task 140, folded in — `appendDiagramNote` keeps only one note per block, so
   these had to be joined rather than appended in turn), the unresolvable stdlib keys, and a remote
   include. Fixes the silence for every library, not just this one; it does NOT make domainstory draw
   icons.
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

## Verification of the fix

- **Unit** (`plantuml-render.test.ts`, +6): silent when nothing was lost; the multi-diagram case
  still reported; an unresolvable key named, with what it costs ("icons, macros"); keys deduped and
  summarised past three; a remote include flagged; and all causes joined into ONE message.
- **e2e, real VS Code** (`plantuml-missing-include.spec.ts`): a diagram with `!include
  <nosuchlib/NoSuchFile>` still RENDERS (this is an info note beside a successful render, not an
  error box) and carries a note naming the file, while a clean diagram in the same document carries
  none — otherwise the note would be noise on every document.
- **The motivating case, re-rendered**: `domainstory` now reads
  "A stdlib file this diagram includes is not available offline: `<material2.1.19/$icon>` — anything
  it defines (icons, macros) is missing from the render."

## Not done

- Neither library was checked on a LIGHT theme. `edgy` is adapted-and-correct on dark, which is the
  harder direction; `domainstory`'s missing icons are theme-independent.
- The ICONS are still missing — only the silence was fixed. Options 2 and 3 remain open.

## Sweep status

With this, all ten vendored PlantUML libraries have now been rendered in the editor at least once:
c4, awslib, azure (task 382) · eip, k8s, cloudinsight, cloudogu (correct), kubernetes (task 383) ·
edgy (correct), domainstory (this task).
