# 491 — a D2 leg of the theme-flip specs is flaky under full-suite load

**Status:** 🟢 FIXED + verified red→green 2026-08-11. Root-caused (DOM chronology), fixed in
`render-cache-client.ts` (two changes), unit test red→green, and the previously-3/3-failing real
VS Code specs pass with the fix. Full record below. Was OPEN since 2026-08-01 with two sightings and
no mechanism.

## The two sightings (same day, same machine, two full-suite runs)

| run | spec | failure | on retry | solo |
|---|---|---|---|---|
| before the 456/490 fixes | `retheme-preview-surface.spec.ts` | `d2 redrew after the flip` → `TIMED OUT` | passed | — |
| after them (252/1/1/2, 43.6 min) | `diagram-retheme-viewport-gate.spec.ts` | `D2 block 1 re-themed` (retry 1), `D2 block 0` (retry 2) | failed both retries | **2/2 green**, 26 s each |

Shared shape: **the D2 leg of a theme-flip assertion**. Every other engine in the same specs
(mermaid, echarts, plantuml, wavedrom, geo) passed in both runs. The instability MOVED between
sibling specs rather than disappearing — the first one is green in the run where the second is red.

The block index also moved between retries of the same run (block 1, then block 0), which is the
signature of a timing/ordering flake rather than one wrong block.

## Not this task's cause — already checked, do not repeat

- **Not a too-short poll budget.** Raising `retheme-preview-surface`'s per-language d2 budget to
  120 s (and the test ceiling to 240 s) still produced `TIMED OUT`. The change was REVERTED rather
  than left in place justified by a disproven mechanism. Do not re-raise timeouts as a first move.
- **Not the 456/490 fixes.** They land in `escape-toolbar.ts` and `focus-restore.ts` — caret and
  focus. The re-theme path (`diagram-retheme.ts` + its `IntersectionObserver`) touches neither, the
  focus-restore change only makes that module do LESS on `focusout`, and the escape retry loop only
  runs after an Escape+Tab (and cancels on any keydown/pointerdown), which these specs never send.
  Stated as an argument from mechanism, NOT as a measurement: `diagram-retheme-viewport-gate` WAS
  green in the previous full run, so there is exactly one observation per run either way.

## Where to look first

Task 412's viewport gate defers a diagram's re-render when it sits more than ~200 px outside the
window, queueing it on a shared `IntersectionObserver`. A spec that reads a post-flip value without
scrolling its target in gets the STALE pre-flip render, silently — no error, no timeout. Both specs
DO scroll (that is the whole subject of `diagram-retheme-viewport-gate`), so the question is not
"do they scroll" but whether the observer keeps up under load: the known rule is to scroll targets
ONE AT A TIME with a short pause, because a bulk pass moves the viewport past earlier elements
before the observer fires for them. Under full-suite contention the same starvation could hit a
per-element loop that is fast enough on an idle machine.

That is a hypothesis. It has not been tested.

## Investigation log (2026-08-10)

**Not yet reproduced, but the D2-only asymmetry in the retheme chain is now concrete and the
observer coalescing is proven real.** Deep code reading + 3 negative repro attempts. No fix
shipped; this task stays OPEN.

**UPDATE (same day, evening) — REPRODUCED 3/3 in a full real-VS-Code suite run, root-caused by
DOM chronology. No fix shipped yet; task OPEN.**

### The confirmed repro (2026-08-10 full suite)

`retheme-preview-surface.spec.ts` (sv mode, `.vditor-preview`) D2 leg failed **3/3** (original +
2 retries), every time with `outcomes: {"mermaid":"redrawn","echarts":"redrawn","plantuml":"redrawn",
"wavedrom":"redrawn","d2":"TIMED OUT"}` — all four non-D2 engines redrew correctly in the SAME
surface, only D2 timed out. `diagram-retheme-viewport-gate.spec.ts` PASSED in that run (the flake
moved to the sibling spec, matching the 2026-08-01 pattern). A solo re-run after the suite ALSO
failed 3/3 — the machine's post-suite state now triggers it deterministically, giving a fast repro.

### Root cause — DOM chronology proves it (throwaway diag spec, `MutationObserver` on the block)

The test tags the `.vditor-preview .language-d2` child svg with `data-preflip-491` BEFORE the flip,
then polls `wasRedrawn` = "the tagged child was replaced". The block's observed timeline:

| step | render-key | data-processed | cache-reserve | miss-comment | svg | tag |
|---|---|---|---|---|---|---|
| 0 | light | ✓ | – | – | ✓ | ✓ |
| 1 | light | ✓ | **✓** (reserved) | – | ✓ | ✓ |
| 2 | light | ✗ | ✗ | **✓** | ✓ | ✓ |
| 3 | **∅** | ✗ | ✗ | ✓ | ✓ | ✓ |
| 4 | **dark** | ✗ | ✗ | ✓ | **✓ LIGHT** | ✓ |
| 5+ | dark | ✓ | ✗ | ✓ | **LIGHT, never repainted** | ✓ |

The chain: `rethemeCacheFirst` reserves (step 1) → host replies MISS → `resolveRequest` un-reserves
+ appends `vmarkd-cache-miss` comment (step 2) → `findBlocks`/`renderD2` clears the render-key
(step 3) → **`reportRenders`' PUT path stamps `RENDER_KEY_ATTR = cfg.themeKey` (dark) on the block
while its svg is STILL the light one (step 4)** → the block is left `data-processed` + dark-stamped
but with light pixels; `wasRedrawn` keeps seeing the tag on the light svg → TIMED OUT. `data-d2-error`
is null — `renderD2` did not fail loudly; it just never overwrote innerHTML after the premature stamp.

Why the stale-render guard failed: `reportRenders`' condition-2 (`lastPutMarkup.get(el) ===
svgMarkup`) did not hold because (a) a `.vditor-preview` element painted from the local cache has no
`lastPutMarkup` entry (paintCached doesn't populate it), and (b) the test's `data-preflip-*` tag
changed `svg.outerHTML`, so `svgOnly` differs from the last reported markup — exactly the class of
"filing a pre-flip svg under the post-flip key" the task-436 stale-render guard exists to stop, now
shown to have a hole for cache-painted preview elements. This is a product-side race in
`render-cache-client.ts`'s `reportRenders` (line ~260-264) + the cache-miss→observer re-fire chain
(`observeCustomDiagrams`), D2-specific because D2 is the only engine in these specs that is
`cacheable` AND async-WASM-rendered AND goes through the full reserve→host→miss→comment→observer chain.

**Status: root-caused, not yet fixed.** Candidate fixes: (1) `reportRenders` must not stamp a block
as the current theme while its svg is still the previous theme (guard on `data-vmarkd-cache-reserve`
or re-check `svgOnly` against the pre-flip markup); (2) `paintCached` should populate `lastPutMarkup`
so a cache-painted preview element is not treated as "never reported"; (3) the miss-comment re-fire
should be robust when `renderD2` is mid-async. Each needs a red→green proof in the real webview.

### What makes D2 unique in these two specs (code-level, established)

Both failing specs' D2 leg is the ONLY engine in the SAME spec that is BOTH `cacheable: true`
(custom family) AND **asynchronously rendered** (WASM compile ~365 ms). The retheme chain is:

1. Flip → `reThemeGeoAndD2` → **single** `setTimeout(run, 400)` (one deferred fire, no re-poll).
2. `gateAndRender` → `diagramGate.partition` defers offscreen blocks on the shared IntersectionObserver.
3. Scroll-in → observer fires → `fire(el)` → `cacheFirstThen(scope, 'd2', …)`.
4. `cacheFirstThen` → `rethemeCacheFirst(scope, ['d2'])` → D2 IS cacheable → **reserves the block
   + posts a host `diagram-cache-get`, returns TRUE → the live `reRenderD2` is SKIPPED**. The block
   now waits on a host round-trip.
5. In E2E (`VMARKD_E2E=1` → DiagramCache freshStart wipes the store per test) the GET is always a
   MISS → `resolveRequest` un-reserves + appends a `vmarkd-cache-miss` comment → MutationObserver
   (`observeCustomDiagrams`) re-fires → `renderD2` → async WASM compile → swap.

So D2's deferred re-render is a LONG async chain: **IntersectionObserver → cache reserve → host
round-trip → miss-comment → MutationObserver → rAF → renderD2 → WASM**. Every hop is an extra
place a render can be lost under contention.

The engines that PASS in the same specs are NOT like this:
- **plantuml** (`cacheable: false`): `rethemeCacheFirst` returns false immediately → live
  `reRenderPlantuml` runs DIRECTLY in the observer callback (one hop, no host, no re-fire).
- **wavedrom/nomnoml** (custom+cacheable like D2, but the spec shows them passing): their re-render
  is SYNCHRONOUS (no WASM), so even if the cache round-trip is slow, the eventual `renderWavedrom`
  is a fast inline SVG build — nothing to lose mid-async.
- D2 alone stacks reserve+host+observer-re-fire+WASM.

### The IntersectionObserver miss is REAL (proved, not assumed)

A throwaway chromium probe (real IntersectionObserver, 200px rootMargin — same as the gate) showed
that an element scrolled into the margin and back out **within one observer-callback delivery** is
reported with **zero** `isIntersecting:true` entries — the browser coalesces the transient entry
away. The gate's callback does `if (!e.isIntersecting) continue` and **never re-queues** — so an
element that scrolls past while the main thread is busy (observer callback delayed past the
element's in-margin window) is **permanently deferred**, exactly the "stale pre-flip render, no
error, no timeout" failure the specs read. This is the mechanism the task's "where to look first"
hypothesised, now confirmed to exist at the browser level.

### Negative repro attempts (all green — did NOT reproduce)

| attempt | what | result |
|---|---|---|
| solo baseline | `diagram-retheme-viewport-gate` alone | green 33 s |
| CPU load 1 | 6 busy workers, machine load ~6.5 | green 39 s |
| CPU load 2 | 12 busy workers, machine load 7→11 | green (both specs, 1.6 min) |
| fast scroll | spike with 50 ms scroll pauses instead of 600 ms | green 26 s |
| main-thread block | spike with 900 ms busy-loop injected in the webview between scroll-ins | green 38 s |

Conclusion: plain machine-CPU contention and shortened/blocked scroll timing do not reproduce it.
The full-suite-specific trigger (which exact hop loses the race under 40+ min of accumulated
contention) is still unidentified. A full suite is the only known repro and should be run to
confirm, or the task parked with this mechanism record.

## Fix (shipped 2026-08-11, `render-cache-client.ts`)

Two changes, both needed (the flake needs both — the chronology showed the miss-comment surviving
AND the stamp cleared, so condition 1 and condition 2 both had to be blocked):

1. **`paintCached` now records `lastPutMarkup`.** A block painted from the cache (paintLocalHits on
   a mode switch / the deferred cache-first re-theme HIT) previously had NO `lastPutMarkup` entry —
   the stale-render guard's condition 2 (`lastPutMarkup.get(el) === svgOnly(el)`) could never hold
   for it, so the block read as "changed" the instant anything mutated it. Painting now sets the
   baseline its own bytes were painted under.
2. **`put()` skips any block still carrying a `vmarkd-cache-miss` comment.** That comment is the
   miss branch's re-fire trigger, appended by resolveRequest and surviving until the engine replaces
   innerHTML — so its presence means "not re-rendered yet, whatever else changed in the markup".
   The spec's pre-flip `data-preflip-*` tag mutates `svg.outerHTML`, which would otherwise fool
   condition 2 into filing the pre-flip svg under the post-flip key. The comment check closes it.

Unit test: `render-cache-client.test.ts` "a miss-comment still present beats a changed svg markup
(task 491)" — **red without the fix** (assertion "a pre-flip-tagged svg with a pending miss-comment
is not filed under the new key" fails exactly on the stale-file, verified by git-stashing the fix),
green with it. All 51 unit tests in the file pass.

Real-VS-Code verification (xvfb, the exact spec that had failed 3/3 solo AND 3/3 in a full suite):
- `retheme-preview-surface.spec.ts` → **1 passed (35.3 s)**, D2 leg `redrawn`.
- Second run (both flaky specs) → **2 passed (1.0 m)**, `EXIT=0`, D2 `redrawn` in preview-surface.

## Do not

- Do not re-raise the poll budgets (tried, disproven, reverted — see above; the root cause is the
  premature render-key stamp, not a short wait).
- Do not revert the fix on a single green full suite either direction without re-reading this file:
  it took a DOM-chronology dump to see the premature stamp; a solo green was the red herring all along.
