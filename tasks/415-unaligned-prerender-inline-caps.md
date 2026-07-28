# Task 415 — Unaligned prerender (10KB) / inline-payload (100KB) size caps double-ship bytes for medium docs

**Status:** planned — perf, low priority (deliberate tradeoff, needs alignment not a rewrite) · **Impact:** 🟢 low (HTML payload ~1.5-2× for a specific document-size band) · **Origin:** Codex performance audit (2026-07-27), finding #5

## Problem

`src/extension.ts:591-615` inlines up to 100KB of raw document source as JSON in the webview's
HTML page (`InlineInitMax`, task 38 — skips the `ready`→`init` round trip for non-wiki, non-huge
docs). Separately, `src/lute-host.ts:56` (`MAX_PRERENDER_CHARS`) caps the host-side Lute
prerender teaser (the instant-paint HTML rendered from a truncated prefix) at 10KB.

The two caps are independent and unaligned. Task 38's own code comment already flags "would
~double the HTML" as the reason the *inline* cap exists at all — but that reasoning only bounds
the inline payload's own upper size, it doesn't prevent the actual doubling: any document between
~10KB and 100KB ships **both** a truncated-prefix HTML teaser (built from the first 10KB) **and**
the full raw source (up to 100KB) inlined as JSON, in the same HTML page. For that whole 10–100KB
band, the "double" cost the original comment warns about is still paid in full — the existing
cutoff caps how large it CAN get, it doesn't reduce the overlap.

Impact: inflated HTML payload size (and parse-to-first-token time) for medium documents,
roughly 1.5–2× depending on exactly where in the band a document falls. Low priority — this is a
deliberate, already-reasoned-about tradeoff (task 38), not a fresh bug; the caps are just not
tuned to each other.

## Scope

- [ ] Decide the alignment approach — options, pick one after reading task 38's original
      reasoning in full: (a) lower `InlineInitMax` closer to `MAX_PRERENDER_CHARS` so the overlap
      band shrinks (loses some of the inline-payload's round-trip-skipping benefit for
      medium docs); (b) make the prerender-teaser generation aware of whether the inline payload
      will ALSO fire for this document, and skip/shrink the teaser when it will (avoids the
      double-ship without touching the inline-payload's own size benefit); (c) confirm the
      current behavior is intentionally acceptable and just document the tradeoff more precisely
      (if profiling shows the actual byte/time cost is negligible for typical doc sizes).
- [ ] Whichever direction: the fix should be small — this is a tuning/alignment task, not a
      redesign of either mechanism.

## Out of scope

- The 10KB and 100KB thresholds' own rationale (why THOSE specific numbers) — not revisited here
  unless the chosen fix requires it.
- Any change to streaming (task 49, separate threshold/mechanism for genuinely huge docs).

## Verification

- [ ] Measure actual HTML payload size for a representative doc in the 10–100KB band, before and
      after the fix — confirm the overlap is actually reduced/eliminated.
- [ ] Real-VS-Code e2e: opening a doc in the affected size band still boots correctly (inline-init
      echo-guard, task 38's `inlineInitedContent` skip logic) — no regression to the open path.
