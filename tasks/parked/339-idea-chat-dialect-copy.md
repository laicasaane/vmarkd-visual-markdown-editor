# Task 339 — Copy as Slack / Discord dialect [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14); NOT scheduled. Extends the 280 converter family (Confluence/Jira) to chat.

## What it is & the effect

Draft an announcement/incident update in VMDE, then "Copy as Slack" — the payload is
rewritten into Slack's mrkdwn (single `*bold*`, `_italic_`, no headings → bold lines,
lists flattened per Slack rules) or Discord's subset. Stop hand-fixing asterisks after
every paste into chat.

## Why novel

md→Slack converters exist as libraries/bots; in-editor "copy for THIS chat app" is
unshipped. Trivial concept — the value is having it where the drafting happens.

## Feasibility on our assets

Same shape as 280: host-side pure-TS converter (small, fixture-tested per construct),
entries in the toolbar `…`/215 menu, clipboard via the 53 wire. Slack's mrkdwn rules are
short; Discord is nearly GFM (converter mostly strips unsupported bits).

## Honest value

Low-med; cheap rider IF 280 is adopted (shared plumbing). Standalone it's not worth its
own infrastructure — decide together with 280.

## Decision

- [ ] **ADOPT** (only as a 280 rider)
- [ ] **PARK** — reason: _______
