# Task 416 — Audit layout-thrashing risk across `getBoundingClientRect`/`getBBox` call sites

**Status:** ✅ **DONE (2026-07-28) — audited all sites, 2 real (small) patterns found and fixed, the rest cleared.** · **Impact:** 🟢 low, as suspected — no hot-path thrashing existed; the one per-caret-move site (`fix-table-ir.ts`) was doing 2 avoidable forced layouts · **Origin:** Codex performance audit (2026-07-27), finding #7 — explicitly self-flagged as unverified

## Result

**Re-counted, as the task demanded: 26 real call sites in 12 files** (`grep` reports 33 hits, but 7
are comments referencing `getBBox`/`getBoundingClientRect`, and test files are excluded). The
audit's "46" also counted `.test.ts` files and predates the `custom-diagrams.ts` split (task 409 —
that call site now lives in `diagram-engines/d2.ts`).

| File | Sites | Verdict |
|---|---|---|
| `fix-table-ir.ts` | 4 | 🔧 **FIXED** — the only site that mattered. See below. |
| `abc-fit.ts` | 1 | 🔧 **FIXED** — textbook read→write→read in a loop, but N≈1. Hygiene. |
| `echarts-retheme.ts` | 1 | ⚪ fine — a read inside a per-pane loop whose body may reconstruct a chart, so reads/writes do interleave; but it runs on theme-flip/resize (not per-keystroke), pane count is tiny, and the read IS the dedupe guard that prevents the far more expensive reconstruct. Leave it. |
| `gap-paragraph.ts` / `hr-nav.ts` / `callout-nav.ts` | 4 + 4 + 4 | ⚪ fine — three copies of the same `caretLineRect` + block-rect pair, on arrow-key/keydown. Pure reads, no interleaved writes; the writes (caret placement) all happen after the last read. *(They are near-identical triplicates — a DRY concern, not a perf one; not in this task's scope.)* |
| `caret-scroll.ts` | 3 | ⚪ fine — caret rect + scroller rect, read together, then one scroll write. |
| `split-scroll-sync.ts` | 2 | ⚪ fine — two reads per scroll event, both before the `scrollTop` write. |
| `edit-activity.ts` | 1 | ⚪ fine — inside a loop syntactically, but it `return`s on the first match, so one read per call. |
| `mermaid-retheme.ts` / `diagram-engines/d2.ts` / `diagram-zoom.ts` | 1 each | ⚪ fine — one-shot probe reads (measure a live element / a zoom wrapper on wheel-start). |

### The two fixes

1. **`fix-table-ir.ts` (the real one).** The table-edit panel positioner read
   `cell.getBoundingClientRect()` and `eventRoot.getBoundingClientRect()`, assigned `style.top`,
   then read **both rects again** for `style.left`. A geometry read after a style write forces a
   synchronous layout → **4 forced layouts where 2 suffice**, on a path that runs on every
   selection change inside a table (i.e. per caret move). Fixed by measuring both boxes once, up
   front, then writing. The reads deliberately stay *after* the existing `display = 'block'` write,
   so the measured state is byte-for-byte what it was.
2. **`abc-fit.ts` (hygiene).** `fitAbc` looped `getBBox` → `setAttribute('viewBox'|width|height)`
   → next `getBBox`, invalidating layout per iteration. Split into measure-then-write passes.
   Values are unchanged (a sibling's viewBox can't affect another svg's bbox); N is normally 1, so
   this is correctness-of-pattern, not a measured win — recorded as such rather than dressed up.

**Verification:** 1941 unit tests green, whole-tree lint clean, and the real-VS-Code specs covering
both touched surfaces re-run green — `table-nav-scroll.spec.ts` (the table panel's own path),
`abc-edit-jump.spec.ts`, and `diagram-width.spec.ts` (abc still measures `452×99` inside a 545px
column and still shrinks to 133px in the narrow case — i.e. the viewBox maths is untouched).
No new tests: both changes are strictly reflow-count changes with identical outputs, and the
existing specs already pin the geometry they produce.

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

- [x] For each of the 12 files, read the call site(s) in context: is the `getBoundingClientRect`/
      `getBBox` call (a) a one-shot read on a rare event (fine, skip), (b) inside a loop that also
      writes DOM/style in between reads (a real thrashing risk — flag), or (c) inside a hot path
      that runs per-keystroke or per-mutation-observer-callback (worth checking even if not
      literally thrashing, just for call frequency).
- [x] For any site classified as a real risk, either fix it directly (batch reads before writes,
      cache the rect across a loop) if small/obvious, or spin it off as its own task with the
      specific file:line and mechanism if it needs a larger change.
- [x] If nothing turns out to be a real risk: close this task with that explicit negative result
      (a "checked, nothing found" verdict is a valid and useful outcome — don't manufacture a fix
      for a non-problem).

## Out of scope

- Rewriting any of these call sites' surrounding logic beyond what's needed to fix an actual
  thrashing pattern, if found.
- Profiling every call site with the DevTools Performance panel — reading the code in context
  (read-before-write ordering) is enough to classify most cases; reach for a trace only if a
  specific site's classification is genuinely ambiguous from reading alone.

## Verification

- [x] A checklist/table of all 46 call sites (or however many exist at audit time — re-count,
      don't trust the 46 figure blindly) with a verdict per site: fine / fixed / spun-off.
- [x] For any site fixed directly: before/after confirms no behavior change (these are geometry
      reads feeding navigation/scroll/zoom logic — a wrong cached rect could cause a real UX bug,
      not just a perf regression).
