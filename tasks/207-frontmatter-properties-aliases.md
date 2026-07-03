# Task 207 — Front-matter properties: `aliases:` + `tags:` resolution

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §3

## Problem

Zero host-side front-matter parsing. `WikiCache` keys come only from file paths
(`src/wiki.ts:58-64`), so a page reachable in Obsidian via a declared alias shows as a
*missing* page here; front-matter `tags:` are invisible to any tag index. (Rendering-wise
front matter is fine — it round-trips as an editable yaml block, verified.)

## Scope

- [ ] Host: lightweight front-matter extractor (first `---` block, YAML subset:
      `aliases`/`tags` as list or scalar; tolerate malformed YAML by skipping the file's
      metadata, never erroring the scan).
- [ ] `WikiCache`: alias keys join the path-derived keys (normalized via
      `normalizeWikiLookupKey`); ambiguity handling identical to duplicate filenames
      (existing picker). Incremental: re-parse on save/watch events.
- [ ] `tags:` feed task 205's index (if 205 unshipped, store and expose; don't block).
- [ ] Chip resolution + `[[` hint list include aliases (hint shows `alias → file` hint text).
- [ ] Rename-refactor interplay (task 202): alias-resolved links must NOT be rewritten on
      file rename (the alias still resolves) — pin this.

## Out of scope

- A properties editor UI, arbitrary property queries (task 105 dataview epic), alias
  WRITE-side tooling.

## Verification

- L1 backend: extractor unit (list/scalar/missing/malformed), cache-key merge, ambiguity,
  incremental update on alias edit.
- L2: `[[Some Alias]]` chip renders resolved when a fixture declares it.
- L3 real-VS-Code (mandatory): click alias chip opens the declaring file; hint offers the
  alias.
