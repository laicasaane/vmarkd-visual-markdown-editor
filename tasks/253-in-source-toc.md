# Task 253 — In-source TOC: create + update between markers (MAIO parity)

**Status:** planned · **Impact:** 🟡 med (docs authors) · **Origin:** task 192 §10

## Problem

Task 225's `[toc]` is a LIVE-rendered block — on GitHub it's literal text. MAIO's flagship
is the portable variant: a real markdown bullet list of headings written INTO the document
between markers, refreshed on demand. VMDE already has all the data (outline + source
map); no command exists (grep → 0).

## Scope

- [ ] Command `VMDE: Create/Update Table of Contents`: writes a heading bullet list
      between `<!-- toc -->` … `<!-- /toc -->` (MAIO-compatible markers so migrating docs
      keep working); anchors are GitHub-style slugs (share task 243's slugger — ONE
      slugger repo-wide).
- [ ] Update = idempotent regenerate of the marked region only (minimal-diff writeback);
      settings: depth range, ordered/unordered, exclude-by-comment
      (`<!-- toc-ignore -->` on a heading).
- [ ] Optional `vmde.toc.updateOnSave` (default off) — refresh the region during the
      save flush.

## Out of scope

- The live `[toc]` block (225), numbering (250 composes — TOC picks up written-back
  numbers automatically), per-file config beyond the markers.

## Verification

L1: generator units (slugs, depth, ignore, idempotence, markers mid-doc/missing/duplicated).
L2: command over the harness doc → region exact, rest byte-identical. L3: create + edit a
heading + update → disk region refreshed, GitHub-renderable (plain-Lute render of the
output asserted).
