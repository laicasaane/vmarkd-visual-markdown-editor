# Task 503 — turn on `strict` for the webview tree (`media-src`)

**Status:** ✅ DONE 2026-08-06 — `npm run typecheck:strict` gates `useUnknownInCatchVariables` +
`noImplicitAny` + `strictFunctionTypes` + `strictNullChecks` over `media-src/src/**`, filtering
Vditor's source out of the result; all real errors this surfaced in our own code (30 from the first
three flags in Step 2, plus 41 from `strictNullChecks` in Step 3 — **71 total**) are fixed for real,
none silenced. Step 1's "Vditor-opaque" design question turned out to be moot — the additive filter
is flag-agnostic by construction, so `strictNullChecks` slotted into the SAME channel with zero
script changes, and the whole "isolate Vditor from the typecheck" design problem never needed
solving (see Step 1's resolution). `npm run typecheck` is **untouched** throughout — still compiles
Vditor's source at today's laxer strictness, confirmed byte-identical (`git diff --stat` empty on
both tsconfig.json files) after every fix in both steps. `strictPropertyInitialization` remains out
of scope — cannot be enabled without `strictNullChecks` (TS5052), and now that `strictNullChecks`
IS clean it could theoretically be revisited, but it wasn't measured as part of this task and isn't
assumed to be free. · **Impact:** 🟡 type-safety only, no observable runtime change — one real (but
already-unreachable) behavioural fix in `link-click-fix.ts` (Step 2) plus two more in Step 3
(`toolbar.ts`, `d2-wasm.ts`), all called out explicitly in their own sections, none changing what a
user can see today · **Origin:** [task 469](done/469-housekeeping-sweep.md) item 5e, never planned;
measured properly 2026-08-06, corrected 2026-08-06 (step 2 re-measured), implemented 2026-08-06,
extended to strictNullChecks 2026-08-06, Step 3 completed 2026-08-06.

> ⚠️ **`npx tsc` is a trap on this machine**: `npx tsc -p media-src/tsconfig.typecheck.json` silently
> resolves a stale global TypeScript that rejects `moduleResolution: bundler` and
> `allowImportingTsExtensions`, producing bogus config errors that look like real ones. Use
> `./node_modules/.bin/tsc -p media-src/tsconfig.typecheck.json --noEmit` or `npm run typecheck`
> (both correctly pick up the local 5.9.3). Same failure family as `npx biome` — a wrapper that
> quietly answers with the wrong tool instead of erroring.

## The headline, and the correction that produced it

`tsconfig.json` (host) has `"strict": true`. `media-src/tsconfig.json` has **`"strict": false`** —
so the entire webview, half the codebase, compiles with no null-safety checking.

> ⚠️ **The first measurement of this was misleading and nearly set the wrong plan.** Flipping
> `strict` on and counting errors gives **1840**, with `strictNullChecks` alone at 1694 — a number
> that reads like a multi-month migration and invites a per-directory ratchet. Filtering
> `node_modules` out of that same output tells a completely different story:
>
> | scope | full-`strict` errors |
> |---|---|
> | everything the typecheck config compiles | 1840 |
> | **`media-src/src/**` — code we actually own** | **54, in 20 files** |
>
> **97% of the errors are in `media-src/node_modules/vditor/src/**`** — Vditor's own TypeScript
> source, which our typecheck pass compiles because we import `vditor/src/index` (and internals)
> rather than the built package. `skipLibCheck` does not help: those are `.ts` sources, not `.d.ts`.
> Top offenders are all upstream files — `fixBrowserBehavior.ts` (238), `highlightToolbarWYSIWYG.ts`
> (145), `vditor/src/index.ts` (105).
>
> So this is **not** a "fix 1700 null checks" task. It is a "stop strict-checking a dependency's
> source" task with a 54-error tail. Do not re-derive the scope from an unfiltered `tsc` run.

## Step 1 — the real problem: Vditor's source is inside our typecheck

**Resolved 2026-08-06 — dissolved, not solved.** The three candidate approaches below (recorded for
history) all assumed `strictNullChecks` had to go into the ONE typecheck program the same way the
other three sub-flags initially seemed to. It doesn't: `scripts/typecheck-strict.mjs`'s filter is
**path-based on the diagnostic's file, not flag-specific** — it groups `tsc`'s output into blocks
and drops any block whose header is under `media-src/node_modules/vditor`, regardless of which
`strict` sub-flag produced it. Adding `strictNullChecks` to
`media-src/tsconfig.typecheck.strict.json` costs nothing extra in the script; the filter already
does the "treat Vditor as opaque for OUR gate" job the three approaches below were trying to design.
`npm run typecheck` (the main gate, which still compiles Vditor's source and still catches an
esbuild patch anchor drifting) is completely unaffected — this was never about weakening it, since
the additive channel never touched it in the first place. User approved this path 2026-08-06
("Dodaj strictNullChecks do additive").

Candidate approaches considered and superseded by the above (kept for record):
      - a `paths` remap in the typecheck config only, pointing `vditor/*` at the shipped `.d.ts`
        (then `skipLibCheck` does apply). **Confirmed a likely dead end (2026-08-06):** we import
        Vditor through 15+ distinct deep paths, not just the public class — `vditor/src/index` (×25
        across the tree) plus `vditor/src/ts/ir/expandMarker`, `util/fixBrowserBehavior`,
        `util/selection`, `util/processCode`, `markdown/abcRender`, `markdown/graphvizRender`, and
        others. Vditor's shipped `dist/index.d.ts` covers only the public class, so a bare remap
        would turn every one of those deep imports into a missing-export error.
      - a separate strict config that typechecks only our tree, with Vditor stubbed/ambient. Risk:
        a stub drifts from reality and hides real breakage at the seam we patch. Never needed —
        the filter achieves the same isolation without a stub to maintain.
- [x] Acceptance test carried over unchanged, still satisfied: **`npm run typecheck` still fails
      loudly if an esbuild patch anchor stops type-matching Vditor** — untouched by this task,
      confirmed byte-identical (`git diff --stat` empty) and re-probed in Step 2's verification.

## Step 2 — the cheap flags, measured individually

> ⚠️ **Re-measured 2026-08-06, corrected: this table was wrong and the plan built on it doesn't
> work.** The original numbers were counted with `grep -c "error TS"` and never split by path or
> read past the count. Actually enabling each flag one at a time against the gating config
> (`media-src/tsconfig.typecheck.json`, Vditor in scope) and reading the output gives a different
> story — this is the third measurement error in this task series to have this exact shape (count
> trusted without reading what's behind it; see also task 499's grep-cap and task 501's
> diagnostic-cap).

| flag | total errors | in `vditor/src/**` (unfixable, not ours) | in our code | verdict |
|---|---|---|---|---|
| `strictPropertyInitialization` | — | — | — | **can't even be turned on alone**: `tsc` hard-errors with `TS5052: Option 'strictPropertyInitialization' cannot be specified without specifying option 'strictNullChecks'`. The original "1 error" was that config error, not a code error — nobody read the line. |
| `useUnknownInCatchVariables` | 3 | **3** | 0 | blocked — 100% Vditor (`devtools/index.ts`, `mathRender.ts`, `mermaidRender.ts`), nothing left to fix on our side |
| `noImplicitAny` | 18 | 3 | 15 | blocked — 2 of the 3 Vditor errors are implicit-any *parameters* in `vditor/src/ts/undo/index.ts`'s own function signatures (only fixable by editing Vditor's source); the 3rd is a missing `@types/diff-match-patch` declaration (fixable via an ambient `.d.ts`, but that alone doesn't rescue the flag — the other 2 remain) |
| `strictFunctionTypes` | 83 | 77 | 6 | blocked — 77 of 83 errors are in Vditor's source, spread across ~35 files (`vditor/src/index.ts`, `ir/index.ts`, `ir/input.ts`, most of `markdown/*Render.ts`, `preview/index.ts`, `sv/index.ts`, `toolbar/*`, `undo/index.ts`, `util/editorCommonEvent.ts`, `util/fixBrowserBehavior.ts`, `wysiwyg/*` — mostly one addEventListener/callback-signature pattern). Only 6 are ours: `boot/vditor-init.ts`, `bridge/message-router.test.ts`, `diagrams/diagram-retheme.test.ts`, `diagrams/plantuml/plantuml-retheme.ts`, `links/link-click-fix.ts`. |
| `strictNullChecks` | 1694 | ~1659 | ~35 | gated on step 1 (unchanged from original measurement) |

**Result: 0 of 4 "cheap" flags ship.** The revert-if-Vditor-errors rule is all-or-nothing per flag
(a flag either goes to zero errors or it doesn't ship), and every one of the four hits real,
unfixable-without-editing-Vditor errors — even `strictFunctionTypes`, where our own share (6) looked
small, the flag as a whole doesn't clear. Step 2 turns out **not** to be independent of step 1 at
all: the honest state is that *nothing* in this task can land until the Vditor-source question is
settled. `media-src/tsconfig.json` was left byte-identical to its starting state (confirmed via
`git diff` — no output); nothing was committed.

- [x] Enable in that order, one at a time, checked to zero before moving to the next — done, all
      four blocked as above. Not "one flag per commit" because none reached a committable state.
- [x] Do NOT add `// @ts-expect-error` or `any` to make a flag pass — followed; no fixes were made
      at all, since fixing the ~24 errors that are genuinely ours (15 + 6 + the ~35 strictNullChecks
      overlap) would have been wasted effort while the Vditor-source errors in the same flags remain
      unfixable and block shipping regardless.

### The additive path — IMPLEMENTED 2026-08-06

Everything above assumed the flags must go into the ONE existing typecheck. They don't.

`npm run typecheck` is **untouched** — still compiles Vditor's source, still catches an anchor
type-mismatch at today's strictness (verified: `media-src/tsconfig.json` and
`media-src/tsconfig.typecheck.json` are byte-identical to HEAD, `git diff --stat` empty on both).
Added instead:

- [x] `media-src/tsconfig.typecheck.strict.json` — extends `tsconfig.typecheck.json`, adds
      `useUnknownInCatchVariables`, `noImplicitAny`, `strictFunctionTypes`.
      `strictPropertyInitialization` excluded (TS5052, see above).
- [x] `scripts/typecheck-strict.mjs` — runs that config, groups `tsc`'s flat `--pretty false`
      output into full diagnostic blocks (a multi-line diagnostic's continuation lines don't repeat
      the file path, so a naive per-line grep would misattribute them — see the script's own
      comment), drops every block whose header is under `media-src/node_modules/vditor`, and
      exits 1 only if anything is left. Wired as `npm run typecheck:strict` and as a new,
      **additional** CI step (`.github/workflows/ci.yml`, right after "Type-check (webview)") —
      the existing step is untouched.
- [x] **Probed twice, not just run once green.** (1) Introduced a real `noImplicitAny` violation
      (`function __probe(x) { return x }`) → script reported it correctly (exit 1, 1 diagnostic,
      Vditor's 83 still filtered), reverted, confirmed byte-identical. (2) Introduced a
      cross-file type mismatch that produces a MULTI-LINE diagnostic (nested "Types of parameters
      ... are incompatible" chain, 5 lines deep) → the block-grouping kept the whole chain
      together and attributed it correctly, not split across the file-path filter. Both probes
      needed: (1) proves detection works at all, (2) proves the grouping logic — the actual risk
      in a filter like this — doesn't silently mis-slice a real diagnostic.

**All 21 "ours" errors from the corrected Step 2 table fixed for real** (no `any`, no
`@ts-expect-error` — every fix is annotated per `.claude/rules/ts.md` where non-obvious). One flag
(`strictFunctionTypes`) surfaced 9 MORE errors once `diagram-retheme.test.ts`'s hand-copied
`rethemeDiagrams`/`monoOrGeoRerender` type signatures were replaced with `typeof`-derived ones
(the type-only import that fixed the original error also fixed the drift that caused it) — final
count fixed: **30**, all in the files the corrected table already named plus `diagram-retheme.test.ts`
itself. By kind:

| kind | example | fix |
|---|---|---|
| widened key indexed a narrow object (`util/lang.ts`, `diagram-runtime.test.ts`) | `Langs[l]` where `l: any`/`string` | derive a `LangKey` union / cast the lookup to `Record<string, ...>` for the test's own deliberately-generic walk |
| arrow/callback needs an explicit return type under a widened inferred context (`wysiwyg-code-highlight.ts`, `astar.ts`) | `.then(() => undefined)`, `Array.from({length}, () => [])` | annotate the return type explicitly |
| plain-JS/mjs vendor import has no `.d.ts` (`d2/elk-entry.ts`, `mermaid/mermaid-elk-entry.ts`) | `import ELKMod from '../../../vendor/elk/elk-api.js'` | 3 scoped `declare module '*/vendor/...'` entries in `util/types.ts` (filename-suffix wildcards, not a blanket `*.js`, so a typo'd vendor import still errors) |
| `jsdom` ships no types, `@types/jsdom` (28.x) trails our `jsdom@29` by a major | `import { JSDOM } from 'jsdom'` | a minimal `declare module 'jsdom'` in `util/types.ts` scoped to the ONE member (`new JSDOM(html).window.document`) actually used, rather than pull in a version-mismatched types package — the exact "silent mismatch" class this whole task is about |
| our OWN interface was narrower/wider than the real object it describes (`boot/vditor-theme.ts`) | `VditorThemeApi.setTheme`'s 2nd param declared `'dark'\|'light'`, real Vditor `setTheme` takes `contentTheme?: string` | narrowed/corrected the interface to match Vditor's real signature — a genuine interface-drift bug this flag caught, not a formality |
| tsc sees Vditor's UNPATCHED source, whose type is narrower than the build-time-patched real behaviour (`plantuml-retheme.ts`) | `graphvizRender` typed `(element: HTMLElement) => void` pre-patch vs `(el: HTMLElement \| Document) => void` after esbuild's `patchGraphvizRender` | a targeted, commented type-only cast at the one call site — same "no import edge" trap class as knip's `@knipignore` case (task 498), just for types instead of dead-code analysis |
| hand-copied type signature had drifted from the real function (`diagram-retheme.test.ts`) | local `rethemeDiagrams: (f: Record<string, unknown>) => void` vs real object-shaped param | replaced with `typeof RethemeDiagramsFn` via a **type-only** import (erased at compile, doesn't trip the runtime `VDITOR_VERSION`-define ordering the file's dynamic imports work around) — eliminates the class of drift that caused the bug, doesn't just patch this instance of it |
| tuple-typed callback param rejected by an `any[]` source under stricter tuple-length checking (`message-router.test.ts`) | `.filter(([msg]: [string]) => ...)` on `.mock.calls` (`any[][]`) — "Target requires 1 element(s) but source may have fewer" | typed the callback `(args: unknown[])` instead of destructuring a fixed-length tuple |
| non-strict-null mode widens a bare `null` literal to `any` under `noImplicitAny` (`geojson-topojson.test.ts`) | `{ geometry: null }` | explicit return-type annotation on the containing function fixes the property's inferred type without changing behaviour |

**One fix changed runtime behaviour, flagged explicitly per the review instruction:**
`media-src/src/links/link-click-fix.ts`'s `window.open` override was typed
`(url: string, ..._args: any[])`, narrower than the real `Window.open`'s
`(url?: string | URL, target?: string, features?: string)`. Widened the override to the real
signature and added a guard (`if (url) openLink(...)`, converting a `URL` via `.toString()`).
**Does not change today's behaviour** — Vditor's only call site (`window.open(markerText)`, see
`link-click.ts`) always passes a string — but it is a real code change, not an annotation, so it's
called out here rather than folded silently into the "type fixes" list. Verified directly: real
VS Code e2e (`local-link-open.spec.ts` ×5, `local-link-open-probe.spec.ts`, `anchor-links.spec.ts`
— 7/7 passed) plus the full fast tier (41/41).

**The cost, stated plainly so it is not rediscovered as a surprise:** the filtered check cannot
report an error inside a file the esbuild patches generate INTO Vditor's tree. That is acceptable
*only* because the anchors have two other nets — `build.mjs` fails the build loudly on a missing
anchor string, and `test/backend/vditor-source-patches.test.ts` asserts they still exist.
Typechecking Vditor's source in the ORIGINAL `npm run typecheck` is a third, incidental net, and
that gate is untouched by this work — `typecheck:strict` is purely additive. Do not simplify this
into "the filter is free": it is cheap for a specific, documented reason, and if either of the two
nets on the patch anchors is ever removed this reasoning expires with it.

## Step 3 — our own null-safety errors, now the active work

**DONE 2026-08-06**, via the additive channel per Step 1's resolution — not gated on a separate
design step. `strictNullChecks` added to `media-src/tsconfig.typecheck.strict.json`;
`scripts/typecheck-strict.mjs` needed no change (its filter is flag-agnostic, confirmed).

> ⚠️ Re-measured fresh 2026-08-06 against current `main` (post task 502's D2 extractions and the
> 30 fixes already landed for the other 3 flags) — **41 errors in 12 files**, not the old table's
> 54/20. Some of the old list's errors were incidentally fixed already; the table below is the one
> actually fixed, don't reuse the pre-503 one above.

| file | errors |
|---|---|
| `bridge/message-router.ts` | 13 |
| `diagrams/d2/d2-render.ts` | 7 |
| `boot/vditor-init.ts` | 5 |
| `diagrams/d2/elk-layout.ts` | 5 |
| `editing/fix-table-ir.ts` | 3 |
| `bridge/message-router.test.ts` | 2 |
| `bridge/edit-sync.ts`, `chrome/toolbar.ts`, `diagrams/d2/astar.ts`, `diagrams/d2/d2-wasm.ts`, `diagrams/engines/vega.test.ts`, `editing/list-backspace.ts` | 1 each |

- [x] Fixed them as real null-safety fixes, not silencing (no `any`, no `@ts-expect-error`;
      one test-fixture cast follows the file's own pre-existing precedent, see the table).
- [x] `message-router.ts`/`message-router.test.ts` — task 499's untested-router caveat: fixed via
      a single-`getRouterDeps()`-hoist restructure (see table), no logic change — verified
      `getRouterDeps()` is a pure singleton-returning getter (`let routerDeps` set once by
      `configureMessageRouter`), so hoisting it cannot change behaviour. Also ran the
      `retheme-flip-matrix.spec.ts` real-VS-Code spec (exercises `handleConfigChanged` end to end)
      as extra insurance beyond the fast tier.
      `d2-render.ts`/`elk-layout.ts`/`astar.ts` — task 502's D2 characterization tests exist and
      passed (covered by `npm test`) after each change here.
- [x] Behavioural-change review, per finding (all narrow "should never happen" edge cases, not
      reachable in today's code paths — see the "By kind" table's own callouts below for the two
      worth recording): `chrome/toolbar.ts`'s new early-return would (in the case that literally
      couldn't type-check before) turn what used to be an uncaught `TypeError` into a silent no-op;
      `diagrams/d2/d2-wasm.ts`'s new `!out.graph` guard turns what used to be an uncaught
      `JSON.parse` `SyntaxError` (violating the function's own documented "never rejects" contract)
      into the graceful `{ error }` the contract promises. Both are strictly safer than before, not
      behaviour changes a user could observe today (both edge cases are already unreachable given
      current callers), so neither needed a dedicated e2e beyond what's below.
- [x] `fix-table-ir.ts` — the `wrapper`/closure restructure (not just a type annotation) is verified
      unchanged behaviourally by the Playwright harness's `table-hotkey.spec.ts` **22/22 passing**,
      including the exact align-button flow (`left`/`center`/`right`) and the full icon-click
      describe block the restructure touches. `boot/vditor-init.ts`'s wiki-field guards are pure
      type-narrowing (verified: `wikiEnabled` already implies `msg.wiki` truthy) — no e2e needed
      beyond the fast tier.

### By kind — the 41 strictNullChecks fixes

| kind | example | fix |
|---|---|---|
| a narrower-typed local, captured by a closure, needs its own type since CFA narrowing doesn't cross function boundaries (`editing/fix-table-ir.ts`) | `if (!x) throw`, then a nested `function` reads `x` and TS still sees the wide union | re-bind to a plain, non-union `const` right after the guard, in the SAME scope as the guard — nested functions defined later see that const's own (already-narrow) type |
| `const x: T \| null = null` gets narrowed by control-flow analysis to the literal `null` everywhere it's read, discarding the wider annotation (`diagrams/d2/d2-render.ts`) | a per-edge `lpos` field, later mutated via the RETURNED object's property (not the local), so CFA never sees a reassignment to justify the wider type | `const x = null as T \| null` instead — an `as` expression's type IS the asserted union, so CFA has nothing narrower to fall back to. One-line fix, resolved all 7 of this file's diagnostics |
| repeated `obj.get(k)` calls across a guard + a use don't let TS carry the guard's narrowing to the second call (`diagrams/d2/elk-layout.ts`) | `if (owner && map.get(owner)?.x) map.get(owner).x.push(...)` | call `.get()` once into a local, guard and use that local |
| two independently-optional fields are actually always-set-together in practice, but the guard only checked one (`diagrams/d2/elk-layout.ts`'s `elkLbl.x`/`.y`, `diagrams/d2/astar.ts`'s `cur.di`/`.dj`) | `elkLbl.x != null ? [elkLbl.x, elkLbl.y + ...] : null` | check both fields in the guard, not just the one already being read nearby |
| a `Map`/DOM-derived optional value is guaranteed non-undefined by an engine invariant TS can't see (`diagrams/d2/elk-layout.ts`'s ELK `MINIMUM_SIZE` node width/height) | `w: n.width` where `n.width?: number` | same `\|\| 0` fallback style already used two lines above for x/y in the same function, for consistency |
| a value is null only in a "should never happen" case, and the existing module idiom is to throw rather than silently continue (`bridge/edit-sync.ts`, `editing/fix-table-ir.ts`) | `innerVditor()?.lute?.VditorIRDOM2Md(html)` returning `string \| undefined` where the caller only accepts `string` | explicit `if (!x) throw new Error(...)` — matches `incremental-md.ts`'s own throw-then-self-heal idiom this file already feeds into |
| a documented "either A or B, never neither" invariant isn't encoded in the type (`diagrams/d2/d2-wasm.ts`) | `out.error` xor `out.graph`, both typed independently optional | after ruling out `error`, an explicit `if (!out.graph) return { error: ... }` makes the "never" side loud instead of `JSON.parse(undefined)` throwing an unrelated `SyntaxError` |
| a transient, momentary type violation the surrounding code already bridges with a cast (`boot/vditor-init.ts`) | `window.vditor = null` between `destroy()` and reconstruction, where `Window.vditor` is declared non-nullable | same `(window as any).vditor = ...` bridge the reconstruction two lines below already uses, for the same source/dist identity reason |
| a derived boolean doesn't carry the narrowing of the value it was derived from (`boot/vditor-init.ts`) | `wikiEnabled = Boolean(msg.wiki?.enabled)`, then `if (wikiEnabled \&\& msg.wiki.pageKeys)` | re-add `msg.wiki?.` at the actual read — the two conditions together are redundant but each is independently checked by TS |
| repeated calls to a function through the SAME expression path don't let TS carry a truthy-guard forward, even for a pure singleton getter (`bridge/message-router.ts`) | `if (getRouterDeps().sessionState.lastInitMsg && ...) { ...getRouterDeps().sessionState.lastInitMsg.x... }` ×13 | hoist `const deps = getRouterDeps()` once, then `const lastInitMsg = deps.sessionState.lastInitMsg` right after each branch's own guard — verified `getRouterDeps()` is a pure singleton return, so this changes nothing at runtime |
| a mock factory's return type is inferred from its literal implementation, not the real function it stands in for (`bridge/message-router.test.ts`) | `vi.fn(() => null)` standing in for `activeModeElement(): HTMLElement \| null` | explicit return-type annotation on the mock factory: `vi.fn((): HTMLElement \| null => null)` — same "hand-copied/inferred type drifted from the real signature" class as Step 2's `diagram-retheme.test.ts` fix |
| a test literal's heterogeneous array shape makes TS infer a stricter-than-runtime type for a nested field (`diagrams/engines/vega.test.ts`) | `spec.layer[1].transform[0].from.data` — `transform`/`from` inferred possibly-absent from the array literal's OTHER element shape | `as any` on the one outer sub-expression, matching this exact file's own pre-existing `(spec.data as any).url` pattern one line above |

**Two fixes are more than pure type-narrowing, called out per the review instruction (both
confirmed unreachable in any current call path, and both make the code MORE correct against its
own documented contract, not less):**
- `chrome/toolbar.ts`'s `restoreEditorRange` — the direct assignment
  `vditor.vditor[mode].range = ...` would have thrown an uncaught `TypeError` if the mode's editor
  state were ever absent; now it's a silent no-op, mirroring how this same file's own reads
  (`getEditorRange`, `getCharBeforeRange`) already tolerate that case via `?.`.
- `diagrams/d2/d2-wasm.ts`'s `compileD2` — an absent `out.graph` with no `out.error` (a case the
  module's own comment says "never" happens) would have made `JSON.parse(undefined)` throw a
  `SyntaxError`, causing the promise to REJECT — breaking the function's own documented contract
  ("on any failure it RESOLVES, never rejects, with `{ error }`"). The new guard makes that
  "never" case honor the contract instead of violating it.

`editing/fix-table-ir.ts`'s `wrapper`/closure restructure changes WHICH variable the click
handler reads (previously the mutable outer `tablePanel`, reassigned to `.children[0]` by the time
any click fires; now a stable `const` pointing at the original wrapper) but was verified, not just
reasoned about, to produce identical results: `wrapper ⊇ innerPanel ⊇ the buttons`, so
`.contains()`/`querySelectorAll()` see the same elements either way — confirmed by
`table-hotkey.spec.ts` 22/22 passing, including the exact align-button and icon-click flows this
touches.

## Verification (the additive path — Step 2, this task's actual delivered scope)

All exit codes read directly, none inferred from output text.

- [x] `npm run typecheck` — exit 0. **Untouched** — `git diff --stat` on
      `media-src/tsconfig.json` and `media-src/tsconfig.typecheck.json` is empty.
- [x] `npm run typecheck:strict` (new) — exit 0, "clean (0 diagnostics ours; 83 pre-existing in
      Vditor's source, filtered)".
- [x] Probed the NEW check twice (see Step 2 above for what each proves): a real `noImplicitAny`
      violation → correctly reported, exit 1; a deliberately multi-line cross-file diagnostic →
      grouped and attributed correctly, not mis-sliced by the file-path filter. Both reverted,
      confirmed byte-identical after (`diff` against a pre-probe backup, not just `git diff`, since
      the probes were never staged).
- [x] `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (host) — exit 0, untouched. (Used the
      local binary directly, not `npx tsc` — see the top-of-file trap note.)
- [x] `node build.mjs` — exit 0.
- [x] `npm test` — exit 0, **196 files / 2772 tests**, `uptime` load 1.38 (not a task-476 risk
      window), count matches the pre-503 baseline exactly (no new test files added by this task).
- [x] `npm run lint:ci` — exit 0 (one self-inflicted formatting diff in
      `message-router.test.ts` caught and fixed with `biome format --write` before this counted
      as done).
- [x] `npm run knip` — exit 0 (unaffected; already green from the earlier 498/503-adjacent work).
- [x] `xvfb-run -a npm --prefix media-src run test:e2e` — exit 0, 456 passed / 5 skipped (2.0 min),
      matches the existing baseline.
- [x] Real-VS-Code specs covering the one behavioural fix (`link-click-fix.ts`'s widened
      `window.open`): `local-link-open.spec.ts` (×5), `local-link-open-probe.spec.ts`,
      `anchor-links.spec.ts` — **7/7 passed** (1.4 min), run individually per AGENTS.md's mandate
      that a webview-behaviour change ship a real-VS-Code check.
- [x] `xvfb-run -a npm run test:vscode:fast` — exit 0, **41/41 passed**, 0 flaky (8.1 min) — the
      full routine tier, as insurance beyond the targeted specs above since this task touched files
      across the diagram/link/message-router surface.
- [x] `npm run quality` — **PASS on all six stages**: lint:ci, knip, jscpd (727 clones, unchanged),
      depcruise, test:coverage, check:coverage-modules (ratchet OK, 17 at 0%, baseline 17). First
      fully-green `quality` run in this entire 498→503 series — every earlier run had knip's 5
      devDependency findings as an accepted red; those are now in `ignoreDependencies` (a change
      made between 502 and this task, not part of 503 itself, but it's why this run is all-green
      where earlier task files recorded "FAIL knip, by design").

## Verification (Step 3 — strictNullChecks, DONE 2026-08-06)

All exit codes read directly, none inferred from output text. Step 1's own acceptance test (the
patch-anchor probe) needed no re-run: Step 1 was dissolved, not executed as separate work (see its
resolution above) — the anchor probe already ran as part of Step 2's verification, and nothing in
Step 3 touches `npm run typecheck` or either tsconfig file.

- [x] `npm run typecheck:strict` — exit 0, "clean (0 diagnostics ours; 1745 pre-existing in
      Vditor's source, filtered)".
- [x] `npm run typecheck` (main gate) — exit 0. **Untouched** — `git diff --stat` on
      `media-src/tsconfig.json` and `media-src/tsconfig.typecheck.json` is empty, confirmed AFTER
      all 41 fixes.
- [x] `node build.mjs` — exit 0.
- [x] `npm test` — exit 0, **196 files / 2772 tests**, `uptime` load 1.82 (not a task-476 risk
      window) — matches the pre-existing baseline exactly.
- [x] `npm run lint:ci` — exit 0 (two self-inflicted formatting diffs, in `astar.ts` and
      `fix-table-ir.ts`, caught and fixed with `biome format --write` before this counted as done).
- [x] `npm run quality` — **PASS on all six stages**: lint:ci, knip, jscpd, depcruise,
      test:coverage, check:coverage-modules (ratchet OK, 17 at 0%, baseline 17).
- [x] `xvfb-run -a npm --prefix media-src run test:e2e -- table-hotkey.spec.ts` — **22/22 passed**
      (21.1s), targeted at `fix-table-ir.ts`'s closure restructure — covers the align-button flow
      and the full icon-click describe block that restructure touches.
- [x] `xvfb-run -a npm --prefix test/vscode-e2e test -- retheme-flip-matrix.spec.ts` — **2/2
      passed** (1.4 min), targeted at `message-router.ts`'s `handleConfigChanged` hoist (the
      biggest single-file change, 13 of the 41 fixes).
- [x] `xvfb-run -a npm run test:vscode:fast` — **40/40 passed, 1 flaky** (`paste-real.spec.ts`,
      9.9 min) — the flaky spec failed once then passed on Playwright's automatic retry; it
      exercises clipboard paste + undo, a path untouched by any of this step's 12 changed files,
      and matches the pre-existing flaky-test class already on record (focus/keyboard L3 specs,
      see project memory) rather than a regression from this work.

## Out of scope

- The host tree — already `strict: true`.
- `type-coverage` as a separate metric (task 469 item 5e's other half) — decide after this lands;
  the number is meaningless while half the tree is unchecked.
- Upgrading or re-vendoring Vditor to a version whose source is strict-clean. That would dissolve
  step 1, but it is a far larger change with its own risk, and ADR-0004 constrains how we consume
  Vditor.
