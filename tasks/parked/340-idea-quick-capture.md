# Task 340 — Quick capture + send-selection-to-note (org-capture for VS Code) [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14: markdown as the inbox); NOT scheduled.

## What it is & the effect

Org-mode's beloved, never-replicated ritual — capturing a thought WITHOUT leaving your
work:
1. **Quick capture**: global hotkey anywhere in VS Code → input box → the line lands in
   `inbox.md` (or today's daily note) with a timestamp, and you're back in your code.
   Flow never broken.
2. **Send selection to note**: select code/text in ANY editor → command → the snippet is
   appended to a chosen note as a fence WITH a `file:line` provenance link (229's link
   format). Research notes assemble themselves while you read code.

## Why novel

org-capture's absence is a running complaint of every org refugee; VS Code has no
markdown-native capture. Both commands are host-only — they work even when NO VMDE
editor is open, which no webview-bound feature can claim.

## Feasibility on our assets

Pure host: append via workspace.fs + minimal formatting; targets configurable
(inbox path / daily-note via 209's resolver when it lands — degrade to a fixed path
until then); provenance links = 229's format; capture template with `{{date}}` (the
shared expander). Days of work, no webview.

## Honest value

Top-tier stickiness-per-cost: tiny build, forms a daily habit, deepens the PKM story
(feeds 272's tree, 205's tags, 105 later). One of the two cheapest daily-drivers of this
round (with 334).

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
