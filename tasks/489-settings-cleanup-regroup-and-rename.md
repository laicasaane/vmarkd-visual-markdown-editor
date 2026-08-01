# 489 — Settings cleanup: regroup the categories, rename the inconsistent keys, read old keys forever

Status: **not started** — plan below is executable as-is. Raised by the user after a review of all
36 settings; the user's decision: *clean everything up, read the old keys as a fallback
indefinitely, but write only the new ones.*

## Decisive finding — this is a two-file change

`src/platform/editor-config.ts` is the SINGLE choke point: all 35 key reads go through
`c.get<T>('<key>')` there, and the internal config-object field names are ALREADY decoupled from the
key names (`enableFullWidth` ← `editor.fullWidth`, `showToolbar` ← `editor.toolbar`). Renaming a VS
Code key therefore touches `package.json` + that one file. The ~20 other files that mention these
concepts use the OBJECT field names and do not move.

## The fallback: `.get()` is not enough — use `.inspect()`

`WorkspaceConfiguration.get(key)` returns the **declared default** when the user has not set
anything, so "is it falsy?" cannot distinguish "user set it" from "untouched". The fallback must ask
`.inspect(key)` whether any user/workspace/folder value actually exists:

```ts
// Read `newKey`, falling back to a legacy key the user may still have in settings.json. Kept
// INDEFINITELY (user decision, task 489): a rename must never silently break someone's config, and
// one extra lookup is cheaper than a migration users have to notice. New writes only ever target
// newKey — nothing in the codebase writes the legacy name.
function getCfg<T>(c: vscode.WorkspaceConfiguration, newKey: string, legacyKey?: string): T | undefined {
  const fresh = c.inspect<T>(newKey)
  const explicit = fresh?.workspaceFolderValue ?? fresh?.workspaceValue ?? fresh?.globalValue
  if (explicit !== undefined) return explicit
  if (legacyKey) {
    const old = c.inspect<T>(legacyKey)
    const legacy = old?.workspaceFolderValue ?? old?.workspaceValue ?? old?.globalValue
    if (legacy !== undefined) return legacy
  }
  return c.get<T>(newKey) // the declared default
}
```

`deprecationMessage` is OPTIONAL and does nothing functional — it only strikes the old entry through
in the Settings UI and names its replacement. Add it for the renamed keys so users can tidy up; the
fallback above is what actually keeps their config working. Legacy keys stay DECLARED in
`package.json` (hidden via `"deprecationMessage"`), otherwise VS Code marks the leftover entry
"Unknown Configuration Setting".

## Part 1 — regroup categories (FREE: no key changes, no fallback needed)

Today 7 categories, unbalanced (Themes 10 + Appearance 11 = 21 of 36; three categories have 2), and
the category does not match the key namespace: `diagram.*` sits under **Themes**, `paste.csvAsTable`
and `slugifyMode` sit under **Appearance**.

- [ ] Add a **Diagrams** category; move all `diagram.*` out of Themes into it
- [ ] Keep Themes for the `theme.*` string pickers only
- [ ] Rename **Advanced** → **Performance** (both its entries — `contentVisibility`,
      `streamLargeFiles` — are performance toggles)
- [ ] Move `paste.*` and `slugifyMode` out of Appearance (see Part 2 for where they land)
- [ ] Re-number `order` on every category

## Part 2 — key renames (each needs a `getCfg` legacy entry)

| current | proposed | why |
|---|---|---|
| `slugifyMode` | `editor.slugifyMode` | the ONLY key with no namespace; 35/36 are `vmarkd.<ns>.<name>` |
| `paste.csvAsTable` | `paste.csvFormat` | **the misleading one** — reads as a boolean, is a string defaulting to `"tsv"` |
| `editor.pasteUrlAsLink` | `paste.urlAsLink` | two paste settings currently live in two namespaces |
| `theme.highlightHeadings` | `editor.highlightHeadings` | every other `theme.*` is a string picker defaulting `auto`; this is a boolean `false` — a feature toggle, not a theme |
| `image.allowRemoteImages` | `image.allowRemote` | repeats "image" inside the `image` namespace |
| `outline.openByDefault` | `outline.defaultOpen` | `editor.defaultMode` puts "default" first; this puts it last |
| `advanced.streamLargeFiles` | `performance.streamLargeFiles` | follows the category rename |
| `advanced.contentVisibility` | `performance.contentVisibility` | ditto |

### Debatable — decide before implementing, do NOT assume

Per-engine settings are split across two namespaces today (`diagram.d2Layout` + `diagram.d2Sketch` +
`theme.d2`; `diagram.mermaidLayout` + `theme.mermaid`), and `diagram.d2Layout` repeats "d2" inside
the `diagram` namespace while `theme.d2` does not. A per-engine grouping would fix both:

`diagram.d2.layout` / `diagram.d2.sketch` / `diagram.d2.theme`, `diagram.mermaid.layout` /
`diagram.mermaid.theme`, `diagram.echarts.theme`, `diagram.geo.basemap`

**But** it empties `theme.*` of its diagram entries and splits "all themes in one place". Worth
asking the user which they'd rather scan. Not decided here.

## Part 3 — boolean naming convention

Three styles coexist with no rule:
- bare noun = "enable this": `editor.toolbar`, `editor.fullWidth`, `editor.headingMarkers`,
  `editor.codeLineNumbers`, `outline.treeView`, `diagram.d2Sketch`
- verb/predicate: `image.allowRemoteImages`, `theme.highlightHeadings`, `advanced.streamLargeFiles`,
  `editor.pasteUrlAsLink`, `editor.linkOpenWithModifier`
- explicit `.enabled`: `wiki.enabled` — the only one

- [ ] Pick ONE rule, write it into the task, apply it. Suggested: bare noun when the namespace makes
      it unambiguous; a verb prefix (`allow`/`show`) only when the noun alone would be ambiguous;
      reserve `.enabled` for turning a whole SUBSYSTEM on/off (which is exactly what `wiki.enabled`
      does — so it stays).

Also note `outline.highlight` (highlight the active entry) and `theme.highlightHeadings` (colour the
headings) use the same word for unrelated features — the Part 2 rename separates their namespaces,
which is enough.

## Checklist

- [ ] Part 1 regroup (free — do this first and independently; it is shippable on its own)
- [ ] Decide the debatable per-engine question WITH the user
- [ ] Add `getCfg` to `editor-config.ts` + unit tests: user-set new key wins; user-set legacy key used
      when new is untouched; **untouched-but-non-default legacy value is honoured** (the case plain
      `.get()` gets wrong); neither set → declared default
- [ ] Apply renames in `package.json` (new keys) + keep legacy keys declared with `deprecationMessage`
- [ ] Route every renamed read through `getCfg(c, new, legacy)`
- [ ] Part 3 boolean convention
- [ ] Real-VS-Code e2e: set a LEGACY key in settings.json, confirm the behaviour still applies —
      this is the whole point of the task and the one thing unit tests cannot prove end to end
- [ ] `npm run lint:ci`, `npm run quality`, CHANGELOG entry
- [ ] Update `docs/`/README wherever setting keys are documented — grep for the old names

## Do not

- Do not remove the legacy keys later. The user's explicit decision is to read them **indefinitely**;
  one lookup per read is the accepted cost.
- Do not validate a rename by "the build passes" — nothing type-checks a settings key string. The
  legacy-key e2e above is the only real proof.
