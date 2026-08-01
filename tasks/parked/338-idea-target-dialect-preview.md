# Task 338 — Target-dialect preview: "render it like GitHub will" [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14: most markdown ends up in a web textarea); NOT scheduled.

## What it is & the effect

A Preview-mode dialect switch: **GitHub** (their soft-break semantics — the exact
difference task 83 documented, their alert rendering, emoji, task-list rules, and our
extensions SHOWN AS THE LITERAL TEXT GitHub would show: wiki chips as `[[text]]`,
callout-aliases as blockquotes) and optionally GitLab. You draft a README/PR
description/issue in vMarkd and KNOW how the target will render it — no more
paste-and-wince.

## Why novel

Every editor renders ITS dialect; none previews the TARGET's. The pain is real and
specific (line breaks and unsupported extensions are the classic bite); we're uniquely
positioned because Lute exposes the parse flags (SetToC/SetMark/softbreak behaviour are
all switches we already know from 83/225).

## Feasibility on our assets

A second Lute render profile (flag set per dialect) + a "no vMarkd decorations" pass
(chips/admonitions off) in Preview; the 83 softbreak work defines the hardest flag
already. Honest scope: PARITY IS APPROXIMATE — pin the known-differences list in the doc
and test against a fixture corpus rendered by real GitHub once (manual snapshot).

## Honest value

High for the README/PR-drafting workflow (a daily journey); medium build. Pairs with the
53 rich-copy path (draft → verify → copy).

## Decision

- [ ] **ADOPT** → GitHub profile only v1
- [ ] **PARK** — reason: _______
