# Task 433 — Nothing owns the 2000 ms diagram-cache-reply fallback

**Status:** ✅ **DONE (2026-07-29) — instrumented, measured zero, closed as checked-and-fine. The timeout was NOT tightened.** ·
**Impact:** ⚪ nil in practice; the counter is now a standing net ·
**Origin:** Opus open-path analysis, 2026-07-29 (finding 2)

## Result — measured, negative (as expected)

`resolveRequest` now records how each request was resolved (`__vmarkdCacheResolveStats`, a two-field
counter on `window`), and the fallback path additionally logs to the Output channel because reaching it
would be an anomaly rather than routine. `diagram-cache-reply-source.spec.ts` opens `all-renderers.md`
— the largest reserve batch there is (13 d2 + mermaid + plantuml + vega + wavedrom + …) — waits well
past the 2 s ceiling and asserts the counters.

Measured: **`{"reply":1,"timeout":0}`**. The host answers; the fallback is not reached.

Deliberately NOT changed: the 2000 ms value, or any retry. Tightening a timer that never fires would be
churn with a real downside (a shorter ceiling turns a merely-slow reply into a spurious full miss, i.e.
a wholesale re-render). The counter stays so that "it never fires" remains a measured claim instead of
an assumption — if it ever goes non-zero, the finding becomes real and the retry question is worth
re-opening.

## Problem

`reserveAndRequest` (`media-src/src/render-cache-client.ts:436-485`) synchronously walks every cacheable block
(custom: d2/wavedrom/nomnoml/vega/vega-lite; native: mermaid/abc/flowchart/plantuml), sets
`data-processed="true"` on each — which **blocks the engines from rendering it** — computes the hashes and
posts one `diagram-cache-get`. Every reserved block stays blocked until `resolveRequest` fires.

The only thing that unblocks a **dropped or delayed reply** is
`window.setTimeout(() => resolveRequest(requestId, {}), 2000)` (`:484`). So in that scenario every diagram in
the document sits inert for up to two full seconds before falling through to a live render.

In the normal path this never bites: the host side (`onDiagramCacheGet`, `src/editor-session.ts:210-223`) is
synchronous in-memory `Map` lookups, and `ensureLoaded()` is a small `index.json` parse (~5–12 ms even at the
50 MB cap, measured in task [414](414-diagram-cache-sync-disk-io.md)) with per-hash lazy blob hydration.

**Explicitly speculative:** there is no evidence that replies are ever actually lost. This is filed because the
mechanism is real, the check is cheap, and it is **not** covered by 184/406/414 — those measured the host's
side of the round trip, not a dropped-message scenario.

⚠️ Correction recorded with it: an earlier exploration pass in the same session characterised this round trip
as "not gated on anything async". That is **wrong** — it *is* gated, by this timer. The normal-case speed is a
property of the host implementation being fast, not of the protocol being synchronous. Noted so it does not
get miscited.

## Steps

- [x] Instrument `resolveRequest` (`render-cache-client.ts:490+`) to record whether it was invoked by a genuine
      host reply or by the 2000 ms fallback, and surface it to the vMarkd Output channel (not `console.log`).
- [x] Run the probe on the heaviest fixture (chosen over the tiers: `all-renderers.md` makes a far bigger reserve batch than anything in smoke/fast) with it on and count. **Zero fallback invocations ⇒ close
      this task as checked-and-fine**, recording the count — do not "harden" a path that never fires.
- [ ] Only if nonzero (it is zero — nothing to do): tighten the timeout and/or add a retry, and add a regression spec that drives the
      dropped-reply case deliberately.
