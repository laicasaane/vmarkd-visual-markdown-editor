# Task 166 — Viewport-gate the mermaid theme-flip re-render

**Status:** ✅ **SPIKE CONFIRMED — VALID, keep (2026-07-05).** Unlike the killed 169/170, the premise holds:
the flip re-render is a real, mostly-offscreen main-thread freeze that viewport-gating would cut. Kept as a
real backlog item (medium value, rare interaction → low urgency); the plan below stands unchanged.

## Spike result (real VS Code, headless — measured 2026-07-05)
12-mermaid doc (prose spacers → tall), 164 is DONE so a genuine dark↔light flip is NOT skipped. Started
light, flipped light→dark, longtask observer over the flip only:
- **total=12 mermaid, visible=1** (viewport 786 px) — 11/12 are offscreen.
- **the flip re-rendered ALL 12** (no viewport check today) in **one ~505 ms main-thread longtask**
  (rAF max-gap 507 ms; ~42 ms/diagram; ~696 ms flip→all-swapped).
- ⇒ **~90 % of the flip freeze is offscreen work.** Viewport-gating drops the immediate block to the
  visible set (~1 diagram ≈ ~40 ms) and defers the other 11 to scroll-in. Scales linearly — 30 mermaid ≈
  a ~1.3 s freeze today.

**Verdict:** a genuine win, but for an **infrequent interaction** (dark/light toggle) — so medium value,
low urgency. Worth doing for diagram-heavy docs; not blocking anything. (Note: the flip burst is ONE
synchronous block here — unlike the open path's 21 async tasks in the 169 spike — so gating, i.e. NOT
rendering the offscreen 11, is strictly better than merely yielding between them.)

## Original TODO (plan unchanged, still the right approach)
**Status was:** TODO (medium; the complement of task 164 §1, **not** a prerequisite — sequence it after).
**Source:** vMark perf analysis (2026-06-28, 39-agent workflow `wf_19aa433d-4fa`).
**Value / Risk:** 🟨 medium (caps immediate flip latency at the *visible* diagrams on many-mermaid docs) / 🟡 medium (IntersectionObserver lifecycle + scroll-preserve interaction).
**Engines:** mermaid.

## Problem

`reRenderMermaid` (`media-src/src/mermaid-retheme.ts:24-65`) collects **every** `.language-mermaid`
across **all** `.vditor-ir__preview`/`.vditor-wysiwyg__preview` panes into one `jobs[]` with **zero
viewport check** (24-46), builds one hidden sandbox holding all sources (50-61), and fires a single
`mermaidRender` over all of them (65) — N back-to-back main-thread dagre layouts per flip. The only
callers are `handleSetTheme` (`main.ts:559`) and `handleConfigChanged` (`main.ts:642`) via
`rethemeDiagrams` (`diagram-retheme.ts:156`) — i.e. the dark↔light/config flip, an **infrequent**
interaction (so this is a flip-latency win on many-diagram docs, **not** an open/edit speedup).

Crucially, the swap loop (`mermaid-retheme.ts:71-82`) leaves the **live DOM (old SVG) untouched
until** every temp reports `data-processed=true` — so deferring offscreen swaps is **invisible**.
No `IntersectionObserver` exists in this file today (verified: grep = 0 hits).

## Plan

In `reRenderMermaid`, split `jobs` into **visible** (live node intersects viewport + a small
`rootMargin`) vs **deferred**:
- render the visible set immediately via the existing sandbox path;
- attach a **single** `IntersectionObserver` that renders + swaps each deferred node (its own small
  sandbox) on scroll-in.

## Constraints
- Render with a small `rootMargin` so a diagram is re-rendered **just before** it scrolls in, else a
  brief flash of the old-theme SVG.
- Mark deferred live nodes (a `data-*` attr) so a **second flip before scroll** doesn't queue
  duplicate observers/renders.
- The deferred callback must **re-read the current theme at fire time** (not close over the
  flip-time `theme`) — `applyMermaidTheme` may have flipped again before the node scrolls in.
- Register the observer in the **task-152 `Disposables` registry** and tear it down on re-init.
- Injected SVG keeps its `data-render` Lute-invisibility (no new round-trip surface — same
  `innerHTML` replace as today).
- Verify **no scroll fight** with `preview-scroll-preserve` (anchors on all top-level blocks) and
  `heading-align`. Main-thread only (no Worker/CSP); no `Date.now`/`Math.random`.

## Verification
- **Real-VS-Code perf e2e (MANDATORY)** in `test/vscode-e2e/`: on a multi-mermaid doc, immediate
  render count == visible-only after a flip; scrolling a deferred diagram into view triggers its
  render + swap.
- Scroll-preserve spec: scroll up/down across deferred diagrams → no anchor drift.
- Keep task-59/86 mermaid retheme + `diagram-width.spec` green. `tsc` + `biome` + vitest +
  Playwright, headless. Verify coverage.

## See also
- Sequence **after** task 164 §1 (skip-flip-rerender-when-init-unchanged) — cheaper, higher-leverage
  sibling; this is the complement for the diagrams that *do* need re-rendering.
- `mermaid-retheme.ts`, `diagram-retheme.ts`, task 59/86, `preview-scroll-preserve.ts`, task 152
  (Disposables). Same viewport-gating idea applied to the **open** path = task 168.
