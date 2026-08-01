# Task 203 — Fix `[[note#heading]]` / `[[note^block]]` (broken, not missing)

**Status:** planned — BUG · **Impact:** 🔴 high (worse than unsupported) · **Origin:** task 192 §3

## Problem

Standard Obsidian anchor syntax is actively mishandled: `parseWikiPayload` splits only on
`|` (`src/wiki-core.ts:12-18`) and `normalizeWikiLookupKey` keeps `#` in the key
(`wiki-core.ts:24-40`), so `note#heading` never matches an existing page → the chip renders
as **missing**, and clicking offers **Create Page**, which would create a file literally
named `note#heading.md` (`src/wiki.ts:106`, `extension.ts:813-815`). `^block` fails the
same way.

## Scope

- [ ] Parse `#heading` / `^block` suffixes out of the target in `parseWikiPayload`; resolve
      the PAGE part against the cache — chip state reflects the page's existence.
- [ ] Click on `[[note#heading]]`: open the page, then scroll to the heading — the
      `scroll-to-heading` protocol message already exists (`protocol.ts:101`); match heading
      by slugified text (define + unit-pin the slug rules; Obsidian-compatible).
- [ ] `^block` v1: resolve + open the page, ignore the block ref (document the limitation
      in the chip tooltip). Never offer to create `note#heading.md` / `note^id.md`.
- [ ] Serialization round-trip: the full `[[note#heading|label]]` payload survives
      edit/save (extend `wiki-serialize.ts` cases).
- [ ] Display: default chip label per Obsidian convention (`note > heading`) unless a
      `|label` is given.

## Out of scope

- True block-reference targets (needs block IDs — future), embeds (task 204),
  heading-anchor autocompletion in the `[[` hint (nice follow-up, note in 221/hint work).

## Verification

- L1: `wiki-core` parse/normalize units — `#`/`^`/`|` combinations, slug rules.
- L2: chip renders resolved (not missing) for `[[Home#Section]]` when `Home.md` exists;
  round-trip byte-stable.
- L3 real-VS-Code (mandatory): click chip → target opens AND scrolls to the heading;
  missing-page anchor click offers to create `note.md` (not `note#heading.md`).
