# Task 206 — Obsidian callout compatibility (aliases + fold)

**Status:** planned · **Impact:** 🟡 med · **Origin:** task 192 §3

## Problem

Vault content pasted from Obsidian degrades: `KNOWN_TYPES` is strict
(`media-src/src/callouts.ts:48-51`) so Obsidian alias names (`summary`, `tldr`, `hint`,
`check`, `done`, `help`, `faq`, `fail`, `missing`, `error`, `attention`, `cite`) fall back
to raw blockquotes; the fold suffix `[!note]-` / `[!note]+` is accepted-but-ignored
(`callouts.ts:55-56`) — foldable callouts never fold.

## Scope

- [ ] Alias map → existing 15 visual types (Obsidian's documented alias table: summary/tldr
      →abstract, hint/important→tip, check/done→success, help/faq→question, fail/missing→
      failure, error→danger, attention→warning, cite→quote). Unknown types: render as a
      generic `note`-styled callout with the literal type as title (Obsidian's behaviour)
      instead of a bare blockquote — decide + pin.
- [ ] Fold: `-` renders collapsed, `+`/none expanded; clickable chevron toggles in preview
      AND edit modes; the suffix round-trips byte-stable; folding state is visual-only
      (never written back).
- [ ] Editing interplay: collapsed callout must still expand-on-caret-enter (the task 179
      machinery) — folding is a separate visual state from the edit expand; keep the two
      orthogonal and test the combination.

## Out of scope

- New visual designs per alias (map to existing 15), nested-callout rendering changes,
  Obsidian custom callout CSS.

## Verification

- L1: alias-map + marker-parse units (suffix parsing, title extraction with fold chars).
- L2: extend `callouts.spec` — alias renders styled, `[!summary]-` collapsed with working
  toggle, round-trip stable, caret-enter still expands (task 179 regression guard).
- L3 real-VS-Code (mandatory): extend `callout-edit.spec` with one alias+fold leg.
