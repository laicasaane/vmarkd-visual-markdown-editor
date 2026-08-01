# Task 415 — Unaligned prerender (10KB) / inline-payload (100KB) size caps double-ship bytes for medium docs

**Status:** ✅ **DONE (2026-07-30) — measured, resolved as option (c): NO code change.** The
measurement contradicts the task's own diagnosis on both magnitude and location, and separately
rules out option (b). · **Impact:** 🟢 low · **Origin:** Codex performance audit (2026-07-27),
finding #5

## What was measured

Two measurements, because the byte count alone cannot answer the question.

**1. Payload bytes.** Method, since the throwaway script lived under the gitignored `tmp/` and is
not in the repo: require `out/lute-host.js`, call `prewarmLute()` and WAIT — `renderForMode` returns
`undefined` until Lute has loaded, so an un-warmed run measures every teaser as zero and looks like
there is no overlap at all. Then for each size, render a synthetic doc (headings + prose + a list +
a fence, repeated) through `renderForMode(cwd, doc, 'ir', false)` and compare its length against
`JSON.stringify(doc).length` (what the inline payload costs in the HTML), counting the inline
payload only below the 100 KB `InlineInitMax`:

| doc size | teaser HTML | inlined source | total | vs source alone |
|---|---|---|---|---|
| 8 KB | 62,853 | 8,524 | 71,377 | **8.92×** |
| 12 KB | 78,708 | 12,784 | 91,492 | 7.62× |
| 20 KB | 78,708 | 21,304 | 100,012 | 5.00× |
| 50 KB | 78,708 | 53,267 | 131,975 | 2.64× |
| 90 KB | 78,708 | 95,880 | 174,588 | **1.94×** |
| 120 KB | 78,708 | — (inline skipped) | 78,708 | 0.66× |

**The task's framing is wrong in both directions.** It says "roughly 1.5–2×, for the 10–100KB band".
1.94× is the ratio at the very TOP of that band — the best case. The ratio gets *worse* as documents
get *smaller*, peaking below the band entirely (8.92× at 8 KB, where the teaser renders the WHOLE
document and the source is then inlined alongside it). And the cost is not really "the overlap": the
teaser is a **fixed ~79 KB for every document over the 10 KB prefix cap**, because markdown→IR-HTML
is a ~7.9× expansion. The inline payload is the smaller half everywhere below ~79 KB of source.

**2. Is the teaser worth its bytes?** (`test/vscode-e2e/prerender-overlay-lifetime-probe.spec.ts`,
`@probe`.) Option (b) — skip/shrink the teaser when the inline payload will also fire — only makes
sense if the teaser is replaced so fast nobody sees it. Measured time the overlay is actually up:

| doc | overlay visible for |
|---|---|
| 5 KB (inline-init fires) | **689 ms** |
| 50 KB (inline-init fires) | **10,759 ms** |
| 200 KB (streams, no inline-init) | not observed by the probe (see caveat) |

689 ms is well past the perceptual threshold, and **10.8 s** for a mid-band document is not a
flicker — it is most of the open. Option (b) would delete visible content from exactly the documents
it was proposed for. **Rejected on evidence, not preference.**

## Decision

**Option (c): the current behaviour is the correct tradeoff, now documented with real numbers**
instead of the estimate that motivated the task. No threshold moved, no mechanism changed — the two
caps are unaligned in the sense the audit noticed, and that turns out to be fine, because the thing
being "double-shipped" is earning its bytes for the entire time it is on screen.

## Named follow-ups (measured, NOT done here)

- **`MAX_PRERENDER_CHARS` (10 KB) may be oversized.** It produces ~79 KB of HTML, but the teaser only
  ever needs to look right for the FIRST SCREEN. A smaller prefix would cut the fixed cost roughly
  proportionally. Not changed here: the task explicitly puts the thresholds' own rationale out of
  scope, and "how much markdown fills a first screen" depends on viewport and font size — it needs
  its own perceptual check, not a guess.
- **A 50 KB document sits under the overlay for ~10.8 s.** That is a much larger finding than this
  task's subject and belongs to the open-latency work, not here. Recorded so the number is not lost.

## Caveat on the third row

The 200 KB leg reported `everSeen: false` — the probe attached to the frame after the overlay was
already gone, in a session that had opened two documents before it. That is a probe artifact, not a
claim that huge documents show no teaser; the streaming path manages the overlay through its own
hooks (`onFirstChunk`). The two rows the decision rests on are the ones where the overlay WAS
observed.

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

- [x] Decide the alignment approach — DECIDED: **(c)**, on the measurement above, with (b) actively ruled out rather than merely not chosen. Options, pick one after reading task 38's original
      reasoning in full: (a) lower `InlineInitMax` closer to `MAX_PRERENDER_CHARS` so the overlap
      band shrinks (loses some of the inline-payload's round-trip-skipping benefit for
      medium docs); (b) make the prerender-teaser generation aware of whether the inline payload
      will ALSO fire for this document, and skip/shrink the teaser when it will (avoids the
      double-ship without touching the inline-payload's own size benefit); (c) confirm the
      current behavior is intentionally acceptable and just document the tradeoff more precisely
      (if profiling shows the actual byte/time cost is negligible for typical doc sizes).
- [x] Whichever direction: the fix should be small — it turned out to be NO code change at all — this is a tuning/alignment task, not a
      redesign of either mechanism.

## Out of scope

- The 10KB and 100KB thresholds' own rationale (why THOSE specific numbers) — not revisited here
  unless the chosen fix requires it.
- Any change to streaming (task 49, separate threshold/mechanism for genuinely huge docs).

## Verification

- [x] Measured across the whole band and beyond it (table above). No "after" row, because nothing changed — and the measurement is what showed the premise was wrong in both magnitude and location.
- [x] Real-VS-Code: the overlay-lifetime probe opens 5 KB / 50 KB / 200 KB documents through the real pipeline and all three boot. Not a regression net (nothing changed to regress) — it is the measurement that rejected option (b).
