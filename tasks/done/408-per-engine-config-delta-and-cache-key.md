# Task 408 — Three parallel hand-maintained enumerations of "what a diagram render depends on"

**Status:** 🟢 DONE (2026-07-28) — descriptor/delta/cache-key work + both required real-VS-Code
e2e checks all green · **Impact:** 🟠 med-high (an omission = stale render or a dead cache; both
silent) · **Origin:** Codex branch review

> **e2e verification (2026-07-28, same day, after the e2e slot freed):**
> 1. **`diagram-cache.spec.ts`, run UNCHANGED first** (per the team-lead's explicit ordering —
>    isolate "did the cache-key change break the reopen guarantee" from "did I write the new
>    assertion correctly"). 2/2 green, twice in a row: "reopen serves every diagram from cache:
>    zero engine render, correct size, byte-identical save" and "editing one diagram does not
>    evict the other diagrams from the cache." Task 184's guarantee holds after both cache-key
>    changes this task made (the per-engine fragment, then the NUL-separator restore).
> 2. **`retheme-flip-matrix.spec.ts` extended** with a new test, `'a D2-only setting change
>    invalidates D2 alone on reopen, not mermaid (task 408 cache scope)'`. First attempt (written
>    before consulting the team-lead's framing carefully enough) asserted the LIVE, single
>    config-changed round trip — caught on review (mine, re-reading the team-lead's own
>    instruction to verify the assertion would fail pre-408) that this doesn't actually
>    discriminate: `rethemeDiagrams`' hand-written `mermaid` flag was ALREADY independent of
>    `d2Layout` before this task, so a live-DOM-touch assertion passes identically pre- and
>    post-408 and proves nothing about what changed. The REAL regression only shows up ACROSS A
>    REOPEN, since it's the persisted CACHE HASH that used to fold every engine's settings into
>    one flat string. Rewrote using `diagram-cache.spec.ts`'s own fixture (`diagram-cache.md`,
>    which already has 3 d2 diagrams + mermaid/graphviz/abc/flowchart) and open/close/reopen
>    pattern, with a `vmarkd.diagram.d2Layout` config change inserted between close and reopen:
>    open with `d2Layout='dagre'` (populate the cache), close, flip to `d2Layout='vmarkd'`,
>    reopen. Asserts: every d2 block correctly MISSES (own setting changed → live re-render,
>    `data-d2-engine` present) AND mermaid — unrelated to d2Layout — still HITS
>    (`data-vmarkd-cache-hit='1'`, no live re-render needed). Confirmed by direct reasoning through
>    the pre-408 code path that this assertion WOULD have failed then (the flat `themeKey` folded
>    `d2Layout` into mermaid's hash too, so mermaid would have missed and paid a needless
>    re-render) — this is what makes it an actual regression test for 408, not a vacuous one.
>    Hit one authoring bug along the way, caught by the test itself: mermaid is a NATIVE (not
>    custom/findBlocks) engine, so its editable IR-marker copy and its rendered preview copy share
>    the same tag/class (`code.language-mermaid`) — an unscoped `document.querySelector` can grab
>    either one, and grabbed the WRONG (marker) copy on the first run, reading `cacheHit: false`
>    unconditionally. Fixed by filtering to the copy that actually contains an `<svg>` (mirrors
>    `render-cache-client.ts`'s own preview-pane-scoping discipline). Green, twice in a row, after
>    the fix. `node build.mjs` run fresh immediately before this e2e pass, per the team-lead's
>    note that the tree had moved (an unrelated warn-only origin-log landed from another agent).
(2026-07-27), finding 3

> **Progress (2026-07-28):** All four scope items landed, each its own TDD RED→GREEN cycle:
>
> 1. **Per-engine `configKeys`** on `EngineDescriptor` (`engine-registry.ts`) + a pinned
>    `DIAGRAM_CONFIG_KEYS` exhaustiveness anchor. Every one of the 17 engines classified: mermaid
>    → `['mermaidTheme','mermaidLayout']`, echarts/mindmap → `['echartsTheme']` (mindmap shares
>    echarts' retheme strategy), geojson/topojson → `['geoBasemap']`, d2 →
>    `['d2Layout','d2Theme','d2Sketch']`, every other engine → `[]` (only the global contentTheme
>    affects it). `engine-registry.test.ts` pins the union bidirectionally + the exact per-engine
>    values (deliberate, not incidental).
> 2. **`diagramConfigDelta(prev, next)`** + **`rethemeFlagsFor(delta)`** + **`engineCacheKeyFragment
>    (lang, options)`**, new pure module `media-src/src/diagram-config-delta.ts` (100% statement/
>    branch coverage, 19 unit tests). `rethemeFlagsFor` derives the 8 diagram flags generically:
>    a strategy group flips on `contentTheme` changing (global) OR any engine sharing that
>    strategy having one of its OWN `configKeys` in the delta — reduces to byte-identical output
>    vs. the old 8 hand-written `xxxChanged || contentThemeChanged` expressions for every
>    single-setting case (proved by the message-router pin test, see below).
>    **Exhaustiveness net beyond the task's own ask:** a forcing-literal test
>    (`ALL_OPTION_KEYS: Required<{[K in keyof VmarkdConfigOptions]: true}>`) in
>    `diagram-config-delta.test.ts` asserts `DIAGRAM_CONFIG_KEYS ∪ KNOWN_NON_DIAGRAM_KEYS` covers
>    **every** `VmarkdConfigOptions` key — this catches the birth of a brand-new option that
>    nobody classified at all, which the engine-registry-only exhaustiveness check (item 4 below)
>    cannot see (added on review feedback; the plain union check alone only catches an engine
>    claiming/losing a key relative to `DIAGRAM_CONFIG_KEYS`, not a wholly new field).
> 3. **Per-engine cache key.** `render-cache-client.ts`'s `RenderCacheConfig` gained an `options`
>    field; `hashOf` now folds `engineCacheKeyFragment(lang, cfg.options)` into the key alongside
>    the (now-reduced) global `themeKey`. `vditor-init.ts`'s `renderCacheThemeKey` narrowed from 9
>    fields to 3 (`mode, contentTheme, fontSize` — the genuinely GLOBAL determinants); the 6
>    per-engine fields it used to carry (mermaidTheme/mermaidLayout/echartsTheme/d2Layout/
>    d2Theme/d2Sketch) moved to the per-lang fragment. Both `initVditor` and `handleConfigChanged`
>    now pass the live `options` snapshot through to `setRenderCacheConfig`. Coordinated with
>    task 406 (already-landed 64-bit-class widening) — confirmed by direct code read that my
>    change is a content-reshuffle (same width, different ingredients), not a further width
>    change, so it needs no host-side `version`-tag bump; added an explicit code comment
>    distinguishing the two classes of change next to the existing task-406 comment (which only
>    warned about width changes) so a future reader doesn't conflate them.
>    `setRenderCacheConfig`'s eager `localSvgByHash.clear()` now fires only on `version`/`themeKey`
>    change (the two GLOBAL fragments) — an `options`-only change needs no explicit clear, because
>    the affected engine's own hashes naturally change (its old entries become unreachable
>    orphans, bounded by the existing LRU cap) while every OTHER engine's entries keep hashing
>    identically and stay reusable. This is the concrete fix for the coarseness problem section 
>    describes: a D2-only setting change no longer touches mermaid's/vega's/etc. cache entries at
>    all, in-memory or (transitively, since the webview is the sole hash authority) on the host
>    disk store.
> 4. **Exhaustiveness check** (engine-registry-level): `engine-registry.test.ts` asserts
>    `DIAGRAM_CONFIG_KEYS` is exactly the union of every engine's `configKeys` (bidirectional) —
>    an engine claiming a key outside the list, or a list entry no engine claims, both fail.
>
> **TDD discipline:** every RED confirmed for the expected reason before implementing (missing
> `configKeys` field, "Cannot find module './diagram-config-delta'", the old 9-field
> `renderCacheThemeKey` output, the pre-fragment `hashOf` not differentiating on `options`).
> `handleConfigChanged`'s rewrite followed the advisor-recommended order: wrote a **pin test**
> characterizing the EXISTING hand-written dispatch first (`message-router.test.ts`, "task 408
> pin" describe block — 7 cases: lone d2Layout/mermaidLayout/geoBasemap/codeTheme changes, a
> contentTheme change, a no-op, and the `options` forwarding to `setRenderCacheConfig`), confirmed
> it passed against the OLD code (characterizing, not RED), refactored to use
> `diagramConfigDelta`/`rethemeFlagsFor`, then confirmed the SAME pin test still passes
> byte-for-byte — proving the rewrite is behavior-preserving rather than merely "looks right."
>
> **Verified:** `npm test` 1915/1915 green (+11 net vs. baseline: 19 new in
> `diagram-config-delta.test.ts`, 3 new pinned cases + 1 forwarding case in
> `message-router.test.ts`, 3 new cases in `render-cache-client.test.ts`, 3 new cases in
> `engine-registry.test.ts`, minus the 4 old `renderCacheThemeKey` cases replaced by 5 new ones —
> net arithmetic doesn't round to a clean per-file count because several existing tests were
> edited in place, not just added). `npm run typecheck` clean. `node build.mjs` green (no errors).
> Coverage ratchet: `node scripts/check-coverage-modules.mjs` → 28/28, unchanged baseline, **no
> new `BASELINE_ZERO` entries** — `diagram-config-delta.ts` itself measured 100%
> statements/100% branches (`coverage/coverage-summary.json`, read directly, not inferred from the
> summary table). `npm run lint:ci` (whole tree, 535 files) clean — one biome format-only
> auto-fix pass applied to the 6 files I'd just written/edited (indentation of multi-line object
> literals; no logic change, re-verified green after).
>
> **Correction (2026-07-28, same day): the "NUL bytes" were NOT an encoding accident — reverted my
> own mistake.** I initially found 3 `\x00` bytes inside `hashOf`'s pre-existing key template,
> assumed they were stray corruption (an `Edit` call had failed to match against them, which is
> how I noticed), and replaced them with plain spaces. **This was wrong and the team-lead caught
> it before it shipped.** `git show HEAD:media-src/src/render-cache-client.ts` confirms the NULs
> were **committed**, predating this entire session — they are the deliberate field separator for
> the hash-key template literal, not an artifact of anyone's edit. The reason: a concatenation-
> based key needs a separator that CANNOT occur inside any field, or field boundaries become
> ambiguous — `themeKey="T X"` + `fragment="Y"` and `themeKey="T"` + `fragment="X Y"` both join to
> the identical string under a space, which is a hash **collision** (the wrong cached SVG gets
> painted), not merely a miss. `\x00` can't appear in any field, so NUL makes the split
> unambiguous by construction — and this is exactly the class of bug task 406's width-widening
> does NOT protect against (two inputs that serialise to the same string collide at any width).
> **Fixed properly, TDD:** wrote a regression test first
> (`render-cache-client.test.ts`, "NUL-delimited fields prevent boundary-shift collisions")
> constructing the exact boundary-shift pair above, confirmed it failed under the space separator
> (both hashes were `e8b0ef365b6562ad` — a real, reproduced collision, not a hypothetical), then
> restored `\x00` as the join separator for ALL 5 fields (`lang`, `version`, `themeKey`,
> `engineFragment`, `source` — `engineFragment` is new in this same key, from item 3 above, so it
> was folded into the NUL scheme from the start rather than added as a 6th space-joined field),
> added an explicit "DELIBERATE — do not clean this up" comment at the site pointing at the
> regression test, confirmed GREEN (38/38 in that file). **Key format note:** this key gained a
> 4th field (`engineFragment`) as part of this same task, on top of the restored separator — like
> task 408's other cache-key changes, this is a content reshuffle (old `(lang,source)` pairs hash
> to a different string and become unreachable orphans), not a width change, so no host-side
> `version`-tag bump is needed, consistent with the framing already recorded above.
>
> **Deliberately NOT done — awaiting the e2e slot:**
> - The task's own required extension of `retheme-flip-matrix.spec.ts` with the cache-scope
>   assertion (a D2-only setting change → non-D2 blocks are NOT re-rendered) — this is a TEST-FILE
>   edit I have not yet written, not just an unrun spec.
> - Confirming task 184's zero-render-on-reopen guarantee still holds under the new per-engine key
>   (`diagram-cache.spec.ts` is the existing coverage for that guarantee).
>   Both require a real-VS-Code e2e run, which the team-lead's standing instruction requires me to
>   ask for before starting — flagged to team-lead alongside this status update rather than run
>   unilaterally.

## Problem

Three separate places each hand-enumerate *what a diagram's output depends on*, and all
three must be updated together when an engine gains an option. None of them fails loudly
when one is forgotten.

1. **`renderCacheThemeKey`** (`media-src/src/vditor-init.ts:78-93`) — a fixed list of 9
   values folded into one string: `mode, contentTheme, mermaidTheme, mermaidLayout,
   echartsTheme, d2Layout, d2Theme, d2Sketch, fontSize`.
2. **`rethemeDiagrams`** (`media-src/src/diagram-retheme.ts:186-197`) — a fixed record of 9
   booleans, one per re-theme strategy: `code, mermaid, echarts, smiles, flowchart, vega,
   monoGroup, geo, d2`.
3. **`handleConfigChanged`** (`media-src/src/message-router.ts:116…`) — independently
   compares the Mermaid / ECharts / D2 / Geo settings to decide which of those flags to set.

Two distinct failure modes, both silent:

- **Forget the cache key** → the hash doesn't change on a config change → a **stale cached
  SVG** is painted and the live re-render never happens.
- **Forget the retheme flag** → the cache correctly misses, but nothing triggers the
  re-render for that engine → stale until the next edit.

There is also a **coarseness** problem the code itself documents. `renderCacheThemeKey`'s
comment says the cache *"is engine-agnostic, so it folds them all into one string."*
Consequence: changing a **D2-only** setting flips the key for **every** engine, discarding
the entire cache — every mermaid, plantuml, graphviz and vega render in the document is
re-computed for a change that could not have affected them. That is precisely the cost
task 184 exists to avoid, and it gets worse with each engine added.

Coverage note (verified): the new `message-router.test.ts` covers routing, `handleUpdate`,
caret and diff paths — but **not** `handleConfigChanged`, which is the largest and most
enumeration-heavy branch in the file.

## Scope

- [x] Let each engine declare, in one place, (a) the config keys that affect its output and
      (b) its **cache-key fragment**. The natural home is the engine descriptor — this is
      the same "metadata drives derived behaviour" move that
      [task 404](404-renderer-runtime-adapter-registry.md) proposes for lifecycle hooks, and
      the two should share a design (do 404 first, or design them together). **Done:**
      `EngineDescriptor.configKeys` (engine-registry.ts) + `engineCacheKeyFragment` (diagram-
      config-delta.ts) builds (b) from (a).
- [x] Derive a pure `diagramConfigDelta(prev, next)` returning **which engines/capabilities
      are affected** — replacing `handleConfigChanged`'s hand-written comparisons. Pure and
      synchronous, so it is trivially unit-testable, which is the main payoff. **Done:**
      `diagramConfigDelta` + `rethemeFlagsFor` (diagram-config-delta.ts), wired into
      `handleConfigChanged` behind a pin test proving byte-identical dispatch vs. the old code.
- [x] Make the cache key **per-engine** rather than one global string: a block's hash should
      fold in *its own* engine's fragment plus the genuinely global determinants (light/dark
      mode, content theme, font size). Then a D2 setting change invalidates D2 blocks only.
      **Coordinate with [task 406](406-diagram-cache-hash-width-and-hydration.md)** — that
      task changes the hash *width* in the same function (`hashOf` in
      `render-cache-client.ts`); doing both at once is one cache-format break instead of two.
      **Done:** `hashOf` now folds the reduced global `themeKey` + `engineCacheKeyFragment`;
      confirmed by direct read that 406's width change and this content-reshuffle are additive,
      not conflicting (see the progress note above).
- [x] Add an exhaustiveness check (in the spirit of `engine-registry.test.ts`, which already
      asserts several derived lists) so a new engine option that is declared nowhere fails a
      test rather than shipping silently. **Done, two layers:** `engine-registry.test.ts` pins
      `DIAGRAM_CONFIG_KEYS` against the union of every engine's `configKeys`; a second,
      stronger net in `diagram-config-delta.test.ts` pins `DIAGRAM_CONFIG_KEYS ∪
      KNOWN_NON_DIAGRAM_KEYS` against every `VmarkdConfigOptions` key (catches a wholly new
      option nobody classified, which the first check alone cannot).

## Out of scope

- Changing which settings exist or their defaults.
- The re-theme *mechanism* per engine (palette pairing vs. monochrome — ADR-0006 /
  [task 146](146-theming-coherence.md) settled that policy). This task is about *what
  triggers* a re-theme, not *how* it repaints.

## Verification

- [x] **Unit** — `diagramConfigDelta` returns exactly the affected engines for a
      single-setting change (one case per engine), and the empty set for a no-op change;
      a per-engine cache key changes for its own setting and is **stable** for another
      engine's. This is the test that would have caught the whole class. **Done:**
      `diagram-config-delta.test.ts` (19 tests, 100%/100% statement/branch coverage) +
      `render-cache-client.test.ts`'s "per-engine cache-key fragment" describe block (3 tests:
      D2-only leaves mermaid's hash unchanged, D2-only DOES change d2's own hash, an engine with
      no configKeys — vega — is unaffected by any diagram setting).
- [x] **Unit** — the exhaustiveness check fails when an engine option is added to the
      settings schema but declared in no descriptor. **Done** (both layers described above).
- [x] **Real-VS-Code e2e** — `retheme-flip-matrix.spec.ts` already covers the live-flip
      matrix across engines and must stay green; extend it with the cache-scope assertion
      (change a D2-only setting → non-D2 blocks are NOT re-rendered), since that is the
      behaviour change this task introduces. **Done** — see the dated progress note above;
      3/3 tests in the file green (the original theme-flip test unaffected, plus the new
      cache-scope test) across two consecutive runs.
- [x] Task 184's zero-render-on-reopen guarantee still holds. **Done** — `diagram-cache.spec.ts`
      run unmodified, 2/2 green, twice.

## See also

- `media-src/src/vditor-init.ts:78-93` (`renderCacheThemeKey`),
  `media-src/src/diagram-retheme.ts:186-197` (`rethemeDiagrams`),
  `media-src/src/message-router.ts:116` (`handleConfigChanged`),
  `media-src/src/render-cache-client.ts` (`hashOf`), `media-src/src/engine-registry.ts`.
- Tasks [404](404-renderer-runtime-adapter-registry.md) (shares the descriptor design —
  do first or together), [406](406-diagram-cache-hash-width-and-hydration.md) (same
  function, different axis — batch the cache-format break),
  [184](184-persistent-diagram-render-cache.md) (the cache contract),
  [152](152-decompose-orchestrator-state.md) item 3 (the earlier point-wise fix to the
  same duplication — it unified the two *call sites*, not the enumerations).
