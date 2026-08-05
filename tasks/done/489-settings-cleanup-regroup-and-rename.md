# 489 — Settings cleanup: regroup the categories, rename the inconsistent keys

Status: **implemented**. Raised by the user after a review of all 36 settings.

## DECISION REVERSED — no legacy fallback, no deprecated entries

The task was first built to the user's original decision — *read the old keys as a fallback
indefinitely* — and that shipped: a `getCfg` helper with a new→legacy map, 17 legacy keys declared
with `deprecationMessage`, unit tests, and a real-VS-Code e2e proving a pre-489 `settings.json` still
drove the editor.

The user then reversed it after seeing the result in the Settings UI (2026-08-01): *"usuń te
deprecations, nie obsługujmy ich, ludzie sobie przestawią."* A struck-through duplicate of every
renamed setting is permanent clutter in the UI, and the audience is small enough that re-setting a
handful of values is cheaper than carrying a compatibility layer forever.

So the fallback is **gone**, not merely unused:

- `src/platform/config-compat.ts` deleted; every read is a plain `.get()` again
- no `deprecationMessage` anywhere — VS Code flags a leftover entry as an unknown setting, which is
  the prompt to move it
- `test/vscode-e2e/legacy-settings-keys.spec.ts` deleted (it tested behaviour that no longer exists)
- the `inspect()` shim added to `test/backend/vscode-mock.ts` reverted — it existed only for `getCfg`

**Do not re-add a fallback** without asking. What survives from that work is the useful part: a unit
test (`test/backend/config-keys.test.ts`) that scans `src/` and fails if any settings key read there
is not a declared property in `package.json` — a typo or half-finished rename otherwise compiles,
type-checks, and silently returns `undefined`.

## The one thing that was NOT true in the original plan

It claimed `src/platform/editor-config.ts` is the single choke point for all 35 key reads. **It is
not** — verified by grepping every `.get<`/`getConfiguration` in `src/`:

| renamed key | read sites OUTSIDE `collectConfigOptions` |
|---|---|
| `theme.highlightHeadings` | `src/app/markdown-editor-provider.ts` (prerender payload) |
| `image.allowRemoteImages` | `src/app/markdown-editor-provider.ts` — **feeds the CSP** (`img-src … https:`) |
| `slugifyMode` | `src/session/asset-link-actions.ts` |
| `outline.treeView` | `src/app/extension.ts` (+ its `affectsConfiguration`) |

Every one of those had to be renamed too. `image.allowRemoteImages` is the sharp one: it feeds the
CSP, so missing it would have left the webview asking for remote images the policy then blocks.

## Part 1 — regroup categories — DECIDED

Today 7 categories, unbalanced (Themes 10 + Appearance 11 = 21 of 36; three categories have 2), and
the category does not match the key namespace: `diagram.*` sits under **Themes**, `paste.csvAsTable`
and `slugifyMode` sit under **Appearance**.

User's choice (2026-08-01): **no separate Paste category** — `paste.*` lives in Editor.

| # | category | holds |
|---|---|---|
| 1 | **Editor** (was "Appearance" — it only ever held `editor.*`) | `editor.*` + `paste.*` |
| 2 | **Themes** | `theme.content`, `theme.code` — nothing else |
| 3 | **Diagrams** | all `diagram.*` (incl. the ex-`theme.*` diagram pickers) |
| 4 | Custom CSS | `css.*` |
| 5 | Outline | `outline.*` |
| 6 | Image | `image.*` |
| 7 | Wiki | `wiki.*` |
| 8 | **Performance** (was "Advanced") | `performance.*` |

- [x] Re-number `order` on every category **and on every property** — the old Themes group had two
      settings both at `order: 7`.

## Part 2 — key renames — DECIDED

User's choice (2026-08-01) on the two open questions:

- **Per-engine grouping: YES.** `theme.*` keeps only content + code; everything diagram-shaped moves
  under `diagram.<engine>.<option>` so one engine's settings sit together.
- **Boolean convention: applied retroactively**, not only to new keys.

| current | new | why |
|---|---|---|
| `slugifyMode` | `editor.slugifyMode` | the ONLY key with no namespace |
| `paste.csvAsTable` | `paste.csvFormat` | reads as a boolean, is a string defaulting to `"tsv"` |
| `editor.pasteUrlAsLink` | `paste.urlAsLink` | two paste settings in two namespaces |
| `theme.highlightHeadings` | `editor.headingColors` | a feature toggle, not a theme; pairs with `editor.headingMarkers` |
| `image.allowRemoteImages` | `image.allowRemote` | repeats "image" inside the `image` namespace |
| `outline.openByDefault` | `outline.defaultOpen` | `editor.defaultMode` puts "default" first |
| `outline.treeView` | `outline.tree` | bare noun (retroactive convention) |
| `editor.linkOpenWithModifier` | `editor.modifierClickLinks` | verb-phrase → noun phrase |
| `advanced.streamLargeFiles` | `performance.streamLargeFiles` | follows the category rename |
| `advanced.contentVisibility` | `performance.contentVisibility` | ditto |
| `diagram.mermaidLayout` | `diagram.mermaid.layout` | per-engine grouping |
| `theme.mermaid` | `diagram.mermaid.theme` | per-engine grouping |
| `diagram.d2Layout` | `diagram.d2.layout` | per-engine grouping |
| `diagram.d2Sketch` | `diagram.d2.sketch` | per-engine grouping |
| `theme.d2` | `diagram.d2.theme` | per-engine grouping |
| `theme.echarts` | `diagram.echarts.theme` | per-engine grouping |
| `theme.geoBasemap` | `diagram.geo.basemap` | per-engine grouping |

17 renames, 19 keys untouched, 36 total.

## Part 3 — boolean naming convention — DECIDED (and applied retroactively)

**The rule, from now on:**

1. **Bare noun** when the namespace already makes it unambiguous — `editor.toolbar`,
   `editor.fullWidth`, `editor.headingMarkers`, `editor.headingColors`, `editor.codeLineNumbers`,
   `outline.tree`, `outline.highlight`, `diagram.d2.sketch`.
2. **Verb prefix** (`allow…`, `show…`, `stream…`) ONLY when the bare noun would be ambiguous or
   would read as a thing rather than a switch — `image.allowRemote` (`image.remote` means nothing),
   `performance.streamLargeFiles`, `performance.contentVisibility`, `paste.urlAsLink`,
   `outline.defaultOpen`.
3. **`.enabled`** is reserved for turning a whole SUBSYSTEM on/off — `wiki.enabled` is the only one
   that qualifies, and it stays.

`outline.highlight` (flash the clicked heading) and the old `theme.highlightHeadings` (colour the
headings) used the same word for unrelated features; `editor.headingColors` removes the collision
entirely rather than just re-namespacing it.

## Checklist

- [x] `package.json`: 8 categories, 36 keys, `order` renumbered per category AND per property (the
      old Themes group had two settings both at `order: 7`). Restructured by script — package.json
      round-trips through `JSON.stringify` byte-for-byte, so no description/enum was retyped by hand
- [x] Rename every read site — `editor-config.ts`, `app/markdown-editor-provider.ts` (×2, one of them
      the CSP), `session/asset-link-actions.ts`, `app/extension.ts` (+ its `affectsConfiguration`)
- [x] `test/backend/config-keys.test.ts` — scans `src/` and fails if a settings key read there is not
      a declared property, if any pre-489 name survives in the source or the manifest, or if anything
      is declared with a `deprecationMessage`. Plus a test pinning the scan itself, since
      `expect(offenders).toEqual([])` would otherwise pass vacuously if the regex stopped matching
- [x] `outline.tree` — the one renamed key with no other coverage — has a behavioural unit test on
      the Explorer tree gate via the `vmarkd.hasOutline` context key
- [x] Update the existing e2e specs that `update()` renamed keys to the NEW names (16 files)
- [x] `npm run lint:ci` clean; `quality` — only knip red, with the same pre-existing findings
      (nothing in the changed files); CHANGELOG entry (flagged **action required**)
- [x] Update `docs/`/README/code comments (26 files). ADR-0006's "theme overrides live under
      `theme.*`" note is marked SUPERSEDED by this task rather than silently contradicted

### Verified

- `npm test` — 2643 passing · host `tsc -p . --noEmit` clean · `npm run typecheck` (media-src) clean
  · `npm run lint:ci` clean
- `xvfb-run -a npm run test:vscode:fast` — 39/39
- Real-VS-Code specs driving renamed keys: `d2-sketch` 3/3 (incl. a LIVE flip — proves the nested
  `diagram.d2.sketch` key works for both `update()` and `onDidChangeConfiguration`), `d2-theme` 3/3,
  `mermaid-elk` 3/3, `paste-url-link` 3/3
- `vmarkd.openSettings` checked: it filters by `@ext:spiochacz.vmarkd`, not by a category title or a
  key, so the regroup does not touch it

### Full real-VS-Code suite — run 2026-08-01 at the user's request

**251 passed · 1 failed · 2 flaky (green on retry) · 2 skipped · 44.1 min.** Every spec that drives a
renamed key passed, including all ten heavy flip-matrix ones this task had left unrun
(`geojson-basemap`, `geojson-tiles`, `d2-elk`, `d2-container-edge`, `d2-content-theme-flip`,
`flip-skip`, `retheme-flip-matrix`, `caret-empty-typing`, `local-assets-only`, `outline-keyboard`).

The single hard failure is `escape-toolbar.spec.ts` — **not this task's**. It is
[456](456-a11y-escape-the-editor.md)'s open bug 2, already catalogued in
[480](480-preexisting-full-suite-failures.md) with the identical assertion (`focus left the
editor` → `activeIsEditor` still true after Escape+Tab) and a ~1/6 pass rate. Confirmed here rather
than assumed, in this order:

1. `--repeat-each=3 --retries=0` → 3/3 fail, so it is deterministic on this machine, not a flake to
   wave away
2. the one plausible confound was the OTHER uncommitted change in this tree (task 485's
   document-level `selectionchange` listener, which rewrites the selection) — disabled it, rebuilt,
   still fails, so it is not that either
3. only then read 480/456, which describe exactly this failure

The 2 flaky specs (`clipboard-preview`, `retheme-preview-surface`'s d2 leg timing out) passed on
retry and touch no renamed key.

Harness note: an earlier batched 3-spec run wedged for ~70 min and reported 4 `electron.launch:
Process failed to launch!` failures. Environmental (resource exhaustion right after the fast tier),
not assertions — all 4 passed when the same specs were re-run individually.
