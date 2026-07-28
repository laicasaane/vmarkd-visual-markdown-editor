# Task 416 — Audit layout-thrashing risk across `getBoundingClientRect`/`getBBox` call sites

**Status:** planned — investigation/spike, not yet a confirmed bug · **Impact:** ⚪ unknown (flagged as an audit coverage gap, not a finding) · **Origin:** Codex performance audit (2026-07-27), finding #7 — explicitly self-flagged as unverified

## Problem

The Codex performance audit found 46 call sites across 12 files using `getBoundingClientRect`/
`getBBox`: `caret-scroll.ts`, `gap-paragraph.ts`, `callout-nav.ts`, `mermaid-retheme.ts`,
`custom-diagrams.ts`, `abc-fit.ts`, `hr-nav.ts`, `diagram-zoom.ts`, `edit-activity.ts`,
`echarts-retheme.ts`, `split-scroll-sync.ts`, `fix-table-ir.ts` — but ran out of scope/time to
check each for **layout-thrashing** (a read-then-write-then-read pattern inside a loop, forcing
the browser to synchronously recompute layout multiple times instead of once).

This is explicitly **not a confirmed finding** — it's an honest gap flagged by the audit: these
call sites might be entirely fine (most one-shot geometry reads are cheap and harmless), or one
or two of them might be a genuine hot-path cost. Nobody has checked.

## Scope

- [ ] For each of the 12 files, read the call site(s) in context: is the `getBoundingClientRect`/
      `getBBox` call (a) a one-shot read on a rare event (fine, skip), (b) inside a loop that also
      writes DOM/style in between reads (a real thrashing risk — flag), or (c) inside a hot path
      that runs per-keystroke or per-mutation-observer-callback (worth checking even if not
      literally thrashing, just for call frequency).
- [ ] For any site classified as a real risk, either fix it directly (batch reads before writes,
      cache the rect across a loop) if small/obvious, or spin it off as its own task with the
      specific file:line and mechanism if it needs a larger change.
- [ ] If nothing turns out to be a real risk: close this task with that explicit negative result
      (a "checked, nothing found" verdict is a valid and useful outcome — don't manufacture a fix
      for a non-problem).

## Out of scope

- Rewriting any of these call sites' surrounding logic beyond what's needed to fix an actual
  thrashing pattern, if found.
- Profiling every call site with the DevTools Performance panel — reading the code in context
  (read-before-write ordering) is enough to classify most cases; reach for a trace only if a
  specific site's classification is genuinely ambiguous from reading alone.

## Verification

- [ ] A checklist/table of all 46 call sites (or however many exist at audit time — re-count,
      don't trust the 46 figure blindly) with a verdict per site: fine / fixed / spun-off.
- [ ] For any site fixed directly: before/after confirms no behavior change (these are geometry
      reads feeding navigation/scroll/zoom logic — a wrong cached rect could cause a real UX bug,
      not just a perf regression).
