# 384 — `domainstory` renders without any icons, and nothing says so

**Status: ✅ DONE (2026-07-26) — both halves as originally scoped.** A diagram that cannot resolve
an include says so, naming the file; and `domainstory` now DRAWS its icons offline, so it no
longer needs to say anything.

> **2026-07-28 — new report, NOT covered by the above: the icons that now draw are dark ink on a
> dark page.** ("domainstory ma ciemne znaczki na ciemnym tle"). Measured in a real VS Code on
> `github-dark` (throwaway probe over `fixtures/probe-domainstory.md`; its dump and screenshots
> survive in `tmp/icons/probe-domainstory/`, and `probe-pumlmode.spec.ts` re-measures the same
> thing): the drawn sprite is **71.6% fully
> transparent, 11.6% anti-aliased fringe, 16.8% opaque — and the opaque ink is `rgb(31,40,51)`
> = `#1F2833`, relative luminance 0.0205** against a page at ~0.006, i.e. **≈1.3:1**. The labels
> beside it are `currentColor` at `rgb(240,246,252)` and read fine, which is exactly the reported
> look: text visible, figure not.
>
> **CORRECTION to the first version of this note — the `ownTheme === false` claim was wrong, and
> it inverted the mechanism.** Measured through the real pair (`expandStdlibIncludes` →
> `plantumlHasOwnTheme`) on the actual fixture: **`ownTheme === true`** — after expansion the source
> carries **22 `skinparam` lines** (domainstory's own `skinparam Shadowing` / `ActorStyle`, plus the
> vendored material map's `skinparam folderBackgroundColor<<MA …>> White`), and `HAS_OWN_THEME` is
> `/<style>|^\s*(?:skinparam|!theme)\b/im`. So we never inject our palette here, and
> `adaptBakedColours` (and with it `backSprites`) **does** run on a dark theme. It simply finds
> nothing: `adaptedCount === 0` in the render, because domainstory draws its elements with **no
> background fill at all** (the only fills in the whole SVG are `path:none`, the activity arrow's
> `polygon:#C5C6C7` and the step badge's `rect:#66FCF1`). No element gets `data-vmarkd-adapted`, so
> `backSprites`' gate (`img.parentElement?.querySelector('[data-vmarkd-adapted]')`) never opens —
> `parentHasAdapted === false` on all three images. And even if it did open, `fillSpriteShape` backs
> *enclosed transparent holes* with LIGHT ink; here the transparency is the OUTER background and the
> ink is the artwork, so it is the wrong tool for the same reason as in task 383.
>
> **The ink is decided at SOURCE, not in the pixels.** `domainStory.puml` declares
> `$declareStyleProperty("", IconColor, Actor|Object, modeAdjustedColor("#1f2833"), …,
> $skinParam = %false())` with `!global PUML_MODE ?= "light"`. We never set `PUML_MODE`, so the
> library picks its light-page ink and the engine bakes it into the sprite PNG — a data URI that no
> CSS, `currentColor` or attribute pass can reach. Two source-level levers were rendered, not argued
> (same probe, blocks 2 and 3):
>
> | block | icon ink | luminance | rest of the diagram |
> |---|---|---|---|
> | as written | `rgb(31,40,51)` | 0.02 | — |
> | `!global PUML_MODE = "dark"` before the include | `rgb(224,215,204)` | 0.69 | ❌ flips everything: labels bake to `#F4F3EF` (wrong on a light theme, and no longer `currentColor`), the step badge's identity cyan `#66FCF1` → `#99030E` dark red |
> | **`!global $Actor_IconColor/$Object_IconColor = "#c5c6c7"`** | `rgb(197,198,199)` | 0.56 | ✅ **nothing else changes** — labels stay `currentColor`, badge stays cyan |
>
> So the surgical fix is to inject the two `$…_IconColor` globals (theme foreground, dark themes
> only) ahead of the `!include`, NOT a pixel-remap pass and NOT `PUML_MODE`. That makes this
> **independent of** [task 383](383-kubernetes-sprites-inverted-on-dark.md)'s still-open kubernetes
> badge, which really does need a pixel pass (its sprite is opaque and inverted, with no source-level
> colour hook).
>
> **2026-07-28 (2) — the user chose the broader lever: drive `PUML_MODE` from the theme.** Two
> findings settled first, in a real render (`probe-pumlmode.spec.ts`):
>
> - **`PUML_MODE` and `$PUML_MODE` are two DIFFERENT preprocessor variables.** `domainstory` tests
>   the bare name and ignores the `$` one; `awslib` tests `$PUML_MODE` and ignores the bare one.
>   Setting one leaves the other library at its light default, so `injectPumlMode` writes BOTH.
>   Of the ten vendored libraries only these two read the mode at all.
> - **awslib's own dark mode collides with our post-pass.** It paints the card `#000000`, which
>   `themePumlSvg` maps (as baked ink) to `currentColor` → near-white card under white text, i.e.
>   unreadable. Screenshot `tmp/icons/probe-pumlmode/block-2.png`.
>
> **EXPERIMENT NOW ON THE WORKING TREE (uncommitted, installed as `vmarkd-experiment-384.vsix`):**
> `injectPumlMode` (both names, `dark`/`light` from the palette, injected before stdlib expansion so
> it beats each library's `?=` default) + `EXPERIMENT_STDLIB_NATIVE_DARK` in `plantuml-render.ts`,
> which makes `themePumlSvg` skip EVERY vMarkd compensation for a stdlib diagram (foreground→
> currentColor, box tint, `adaptBakedColours`, sprite backing) and drop only the transparent backdrop
> rect. The user asked to see all ten libraries unaided before deciding. Flip the const to `false` to
> restore shipped behaviour; the const and the `stdlib` parameter are meant to be removed or promoted
> once the call is made. Unit 1935 ✅ · typecheck ✅ · lint ✅ (only the two untracked probe specs warn).
>
> **The sweep, github-dark, all ten (`tmp/icons/probe-nativedark/block-*.png`):**
>
> | # | library | native dark? | raw look |
> |---|---|---|---|
> | 3 | domainstory | ✅ bare `PUML_MODE` | fixed — light icons and labels; step badge is the library's own reversed `#99030E` |
> | 8 | awslib | ✅ `$PUML_MODE` | black cards, white labels, grey chrome — better than our adaptation |
> | 5 | cloudinsight | — | fine unaided (transparent cards, white glyphs) |
> | 7 | c4 | — | fine; boundary labels dimmer than with our ink lift |
> | 4 | cloudogu | — | identity-blue card holds, but the icon tiles are white squares |
> | 6 | edgy | — | its own pastel cards; the black `supports` label nearly vanishes on the page |
> | 0 | k8s | — | ❌ white sheet |
> | 2 | eip | — | ❌ white cards |
> | 9 | azure | — | ❌ white cards |
> | 1 | kubernetes | — | ❌ light sticker (task 383's open bug, unchanged) |
>
> So 2 of 10 libraries can theme themselves; the other 8 measurably need the compensation passes.
>
> **The row that combination does NOT show — mode injected, compensation ON — was measured
> separately** (`probe-compon.spec.ts`, flag flipped to `false`, `tmp/icons/probe-compon/`), because
> the experiment above changes two things at once and the 8 white cards are the compensation being
> off, not the mode being on:
>
> - the 8 mode-blind libraries render **exactly as they ship today** (k8s, azure, eip… all correct);
> - **domainstory is FIXED** there too — its icons need only the mode, nothing from the compensation;
> - **awslib BREAKS**: its own dark `#000000` card meets `themePumlSvg`'s baked-ink rule and becomes
>   `currentColor`, i.e. a near-white card under white labels (`tmp/icons/probe-compon/block-8.png`).
>
> That single collision is the only thing standing between "inject the mode always, keep the
> compensation" and a strictly-better render everywhere.
>
> **2026-07-28 (3) — SHIPPED, per the user's call ("zostawiamy PUML_MODE").** The experiment switch
> is gone. `injectPumlMode` runs for every stdlib diagram (both spellings, mode from the palette),
> and `usesModeAwareStdlib` = {`awslib`, `domainstory`} decides who then gets our compensation: on a
> DARK theme those two are rendered by their own palette (`themePumlSvg` keeps only the transparent-
> backdrop removal), everyone else keeps every pass exactly as before. On a light theme nothing
> changes for anyone — the passes were already no-ops there.
>
> Verified: **unit 1941 ✅** (+3 for `injectPumlMode`, +3 for the gate incl. "a native-dark card is
> not lifted to currentColor") · **typecheck ✅ · lint ✅** · **real VS Code**: new
> `plantuml-native-dark.spec.ts` pins all three halves in one render — domainstory's icon ink at
> luminance **0.6881** (was 0.0205), awslib's own `#000000` card + `#FFFFFF` labels intact, and k8s
> still coming out of `adaptBakedColours` with our `#23272d` surface — plus `plantuml-stdlib.spec.ts`
> updated (AWS moved from the compensated group to its own assertions) and green on
> `github-dark` / `vscode-dark-2026` / `vscode-light-2026`, with `plantuml-stdlib-more`,
> `plantuml-domainstory` and `plantuml-missing-include` unchanged and passing.
>
> What is left ugly about icons on dark — kubernetes' sticker, cloudogu's white tiles, edgy's black
> label, and the direction "fix PlantUML rather than the pixels" — now lives in ONE place:
> **[task 431](431-pretty-icons-in-dark-mode.md), deliberately left open.**
>
> One consequence of the "leave the step badge as the library drew it" decision, visible in the
> sweep: at `#99030E` on our page the pill effectively disappears and only the red `(1)` numeral
> reads (`tmp/icons/probe-nativedark/block-3.png`) — the accepted artefact is a vanished pill, not a
> bordo one.

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
2. **Vendor a TRIMMED `material2.1.19` and inject it** — measured 2026-07-26, and much smaller than
   the first estimate suggested:

   | | files | size |
   |---|---|---|
   | `material7.4.47` — the variant task 354's "16 MB" note was about | — | **15.6 MB** |
   | `material2.1.19` — the one domainstory actually includes | 2153 | **6.5 MB** |
   | **the icons domainstory names by DEFAULT** | **15** | **46 KB** |

   46 KB is smaller than `eip.js` (48 KB), which we already ship — 140× less than the whole set. The
   library picks its icon names statically at include time from `$…_IconStyle` (default `outline`):
   `account{,_multiple}{,_outline}`, `file_document`, `document`, `folder{,_outline}`, `laptop`,
   `phone`, `email`, `message{,_outline}`, `information{,_outline}`.

   **The variable key stops mattering.** PROVEN in the real editor rather than argued: paste those
   sprites into the block and the icons draw. The dropped `!include <material2.1.19/$icon>` is not
   load-bearing — `%set_variable_value($variableName, "$ma_" + $icon)` runs regardless, and each
   material file defines exactly `sprite $ma_<name>`, so the reference resolves as soon as the sprite
   exists. Screenshot: `tmp/icons/domainstory-with-sprites.png` (person, document and laptop all
   drawn); the source that produced it is `tmp/icons/domainstory-with-sprites.md`.

   So the change is: fetch the 15 with an allowlist, load the map as a dependency of `domainstory`,
   and inline it up front (we cannot resolve per-icon, so the whole trimmed map goes in). Two knock-on
   details: the note must stop firing for `material2.1.19/$icon` once we inject the set (otherwise it
   is a false alarm — visible in that same screenshot), and an icon the user names OUTSIDE the 15 is
   still missing, which is exactly what the note should keep reporting.

   Optional on top: the vendored files are the UNCOMPRESSED `/16` format (~3 KB each); re-encoding to
   `16z` at fetch time would take 46 KB to roughly 12 KB.

   **SHIPPED, with the recompression** (user's choice). 46.3 KB of source → **3.2 KB** of sprite text,
   15 KB as the packed JS map (JSON escaping). `fetch-plantuml-stdlib.mjs` gained two general
   mechanisms rather than a domainstory special case: `only` (an allowlist of basenames, for shipping
   a SUBSET of a large library) and `recompress16z` (the `/16` hex grid → deflate-raw → PlantUML's
   6-bit alphabet). The expander gained one rule: a key holding a `$variable` inlines that library's
   whole map instead of reporting it missing — the only shape that can work when the icon name is a
   procedure parameter, and viable only because the map is trimmed.

   The encoder was verified against the ENGINE, not just against our own decoder: the recompressed
   sprites were rendered in a real editor before any of this was wired up.
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
- An icon the user names OUTSIDE the vendored 15 (a custom `$…_IconName`) is still missing — and
  that is exactly the case the note now reports, correctly.
- Only `material2.1.19` is vendored, and only its 15 default names. Other material variants
  (`material7.4.47`, 15.6 MB) and the other ~2138 icons of 2.1.19 are not shipped.

## Sweep status

With this, all ten vendored PlantUML libraries have now been rendered in the editor at least once:
c4, awslib, azure (task 382) · eip, k8s, cloudinsight, cloudogu (correct), kubernetes (task 383) ·
edgy (correct), domainstory (this task).
