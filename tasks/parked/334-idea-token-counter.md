# Task 334 — LLM token counter in the status bar [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Real-usage audit
(192 §14: markdown as the language of AI work); NOT scheduled.

## What it is & the effect

Next to the word count, an approximate LLM token count (`~3.2k tok`) for the doc — and
for the selection when one exists. Everyone writing prompts, system instructions,
CLAUDE.md/AGENTS.md files or few-shot examples today pastes into a playground "to see how
much it eats". After: the number is just THERE while you edit, like word count is for
writers. Optional soft budget (front-matter `token-budget: 8000` → the counter goes amber
past it).

## Why novel

No markdown editor shows token counts; token-counter web tools are a top AI-era utility.
vMarkd's user base (devs maintaining agent files) is exactly the audience.

## Feasibility on our assets

Offline BPE approximation: a small vendored cl100k/o200k-style ranks table (or a
chars×heuristic fallback tier — decide accuracy vs bundle size in a 1-day spike);
plumbing = the existing status-bar word-count pipeline (reading-time.ts / status-bar.ts)
+ the 223 selection-stats wire. Zero webview architecture impact.

## Honest value

Tiny build, daily-driver for the AI-adjacent crowd, "why does nothing have this" reaction.
One of the cheapest adopt candidates in the whole idea set.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
