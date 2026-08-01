# Task 320 — Debug Journal: breakpoint-pinned notes + stack snapshots [IDEA]

**Status:** 💡 IDEA (2026-07-03) — **TO CONSIDER: adopt or park.** Creative audit (192 §13);
NOT scheduled. Honest rating: niche.

## What it is & the effect

While debugging, one command snapshots the current call stack and selected variable values
into a formatted block in your investigation note; blocks can be PINNED to breakpoints so
the note surfaces (status-bar chip) whenever that breakpoint exists or is hit — and
re-opening the note can re-arm the relevant breakpoints. A multi-day bug hunt stops living
in your head/chaotic scratch file: each hypothesis carries captured evidence with context.

## Why novel

Debugging investigations are the least-documented engineering activity; no tool bridges
the debugger and a document. Distinct from plain file:line links (229): this consumes LIVE
vscode.debug session state, which only an in-IDE editor can reach.

## Feasibility on our assets

Fully host-side: `DebugSession.customRequest('stackTrace'/'variables')`, breakpoints API
for pin/re-arm; insertion via the writeback pipeline; a side TreeView follows
outline-tree's pattern; status-bar surfacing exists.

## Honest value

Niche but deeply sticky for gnarly-bug specialists and postmortem writers. Cool demo,
small devoted audience — a fine PARK candidate until someone asks.

## Decision

- [ ] **ADOPT**
- [ ] **PARK** — reason: _______
