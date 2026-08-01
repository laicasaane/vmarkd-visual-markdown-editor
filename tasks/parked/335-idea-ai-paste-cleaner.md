# Task 335 — "Paste from AI chat" cleaner [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14); NOT scheduled. Cousin of 242 (ANSI strip) — same hook, different parasite.

## What it is & the effect

Pastes from ChatGPT/Claude/Copilot chats break in CHARACTERISTIC ways: an outer
```` ```markdown ```` wrapper around the whole payload, collapsed/unbalanced nested
fences, "Sure! Here's the updated version:" preamble, smart quotes/dashes where code
needs ASCII, stray citation artifacts. One command (or an offer-toast on detection, like
218's CSV ask) repairs exactly this dialect of breakage before it pollutes your doc.

## Why novel

Everyone who works with AI output does this cleanup BY HAND many times a day; no editor
recognizes "AI-chat paste" as a format with known defects. The detection heuristics are
easy precisely because the breakage is so stereotyped.

## Feasibility on our assets

Rides the shared pre-Vditor paste hook that 242/218 establish (build the hook once —
three consumers already). Pure-TS transforms, exhaustively unit-testable on a fixture
corpus of real chat pastes; `ask | always | off` setting like 218. Fence-rebalancing is
the only subtle part (reuse the fence-aware scanner).

## Honest value

High frequency for the AI-adjacent user, invisible to others; small build on existing
plumbing. Bundles naturally with 334/336 as an "AI-era pack".

## Decision

- [ ] **ADOPT** (with 334/336 as one release theme)
- [ ] **PARK** — reason: _______
