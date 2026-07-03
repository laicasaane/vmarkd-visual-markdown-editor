# Task 224 — Paste URL onto selection → wrap as link

**Status:** planned · **Impact:** ⚪ low · **Origin:** task 192 §5

## Problem

Pasting a URL over selected text replaces the text with the bare URL (auto-linked) instead
of producing `[selection](url)` — a now-standard affordance (Typora, VS Code text editor
with markdown extension, Obsidian all do it). Vditor's paste path has no such branch
(`fixBrowserBehavior.ts:1360-1365` only normalizes browser-copied `<a>` HTML).

## Scope

- [ ] Pre-Vditor paste hook: clipboard is a single URL (scheme http/https/mailto or a
      workspace-relative path?) AND the selection is non-collapsed prose → replace with
      `[<selection>](<url>)`; selection already a link → replace the href only.
- [ ] Context guards: not in code/sv-raw/math/diagram source (literal paste there — the
      191 P0-9 contract); wiki-chip selection excluded (ambiguous — leave default).
- [ ] Setting `vmarkd.paste.linkifySelection` (default on); Ctrl+Shift+V (raw paste)
      bypasses — if a raw-paste chord exists; if not, note the escape hatch is
      undo (one step).
- [ ] **Update 191 P0-8** — it pins the CURRENT `[target](url)`-less behaviour matrix;
      that spec's expectation flips when this ships (called out in 191 §3 already).

## Out of scope

- Fetching page titles for the link text, image-URL special-casing (stays a plain link).

## Verification

- L1: decision-table unit (URL detection, contexts, existing-link replace).
- L2: paste-pipeline spec cases per mode — wrap happens in prose, literal in fence, one
  undo step, one edit post.
- L3 real-VS-Code: clipboard URL + Ctrl+V over a selection → disk shows the wrapped link.
