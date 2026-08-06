# Task 503 — turn on `strict` for the webview tree (`media-src`)

**Status:** TODO — step 2: 0 of 4 flags shipped, every cheap flag turned out to be gated on step 1
after all (see step 2 below); steps 1 and 3 remain deferred by user decision until the Vditor-source
question is taken up. · **Impact:** 🟡 type-safety only, no runtime change — but it touches the
typecheck config both trees are gated by, so getting the Vditor question wrong breaks the gate for
everyone · **Origin:** [task 469](done/469-housekeeping-sweep.md) item 5e, never planned; measured
properly 2026-08-06, corrected 2026-08-06 (step 2 re-measured, see below — `media-src/tsconfig.json`
is unchanged, byte-identical to before this task touched it).

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

**Deferred by explicit user decision (2026-08-06): "bez źródeł vditora" — do not exclude Vditor's
source from the typecheck for now.** `strictNullChecks` stays off. Note this now sits on the
critical path harder than originally framed: step 2 turned out to have zero flags shippable without
it (see below), so this step is no longer just the "honest" or "gold-plated" path — it is the *only*
path to any further progress on this task.

This is the design question the task turns on, and it must be settled before any flag is flipped.
`media-src/tsconfig.typecheck.json` has `"include": ["./src"]`, but `include` does not stop TS from
compiling files our code *imports* — and importing `vditor/src/index` is deliberate (ADR-0004 and
the esbuild patch pipeline depend on consuming Vditor's TS source, not its dist).

- [ ] Establish whether the typecheck pass can treat Vditor as opaque while the BUILD keeps
      consuming its source. Candidate approaches, to be evaluated and the choice recorded with
      what was tried:
      - a `paths` remap in the typecheck config only, pointing `vditor/*` at the shipped `.d.ts`
        (then `skipLibCheck` does apply). Risk: our patches reference internals the dist types may
        not expose, so this could trade 1659 upstream errors for N missing-export errors — measure
        before committing to it. **Confirmed harder than it looks (2026-08-06):** we import Vditor
        through 15+ distinct deep paths, not just the public class — `vditor/src/index` (×25 across
        the tree) plus `vditor/src/ts/ir/expandMarker`, `util/fixBrowserBehavior`, `util/selection`,
        `util/processCode`, `markdown/abcRender`, `markdown/graphvizRender`, and others. Vditor's
        shipped `dist/index.d.ts` covers only the public class, so a bare remap would turn every one
        of those deep imports into a missing-export error — this is not a small measurement, it's
        a likely dead end for this option specifically.
      - a separate strict config that typechecks only our tree, with Vditor stubbed/ambient. Risk:
        a stub drifts from reality and hides real breakage at the seam we patch.
      - leaving `strict` off at the project level and enabling the sub-flags that are cheap even
        WITH Vditor in scope (see step 2) — the honest fallback if the above are worse than the
        disease.
- [ ] Whatever is chosen, the acceptance test is: **`npm run typecheck` must still fail loudly if
      one of our esbuild patch anchors stops type-matching Vditor.** That is what compiling
      Vditor's source buys us today, and it must not be silently traded away. Probe it: break an
      anchor's type on purpose, confirm the gate goes red, revert.

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

### The one path that remains, if this is picked up again

Everything above assumes the flags must go into the ONE existing typecheck. They don't. The additive
option, not yet attempted:

Keep `npm run typecheck` **exactly as it is** — still compiling Vditor's source, still catching an
anchor type-mismatch at today's strictness — and add a **second** script, `npm run typecheck:strict`,
that enables the three checkable flags and filters `node_modules/vditor` out of its output. Then the
21 errors that are genuinely ours (0 + 15 + 6) get fixed and gated, our own code gains most of
`strict`, and neither Vditor's source nor the existing gate is touched. `strictPropertyInitialization`
still cannot come along (TS5052 ties it to `strictNullChecks`), so this delivers 3 of 4, not 4.

**The cost, stated plainly so it is not rediscovered as a surprise:** a filtered check cannot report
an error inside a file the esbuild patches generate INTO Vditor's tree. That is acceptable *only*
because the anchors have two other nets — `build.mjs` fails the build loudly on a missing anchor
string, and `test/backend/vditor-source-patches.test.ts` asserts they still exist. Typechecking
Vditor's source is a third, incidental net here, not the primary one. Do not simplify this into "the
filter is free": it is cheap for a specific, documented reason, and if either of those two nets is
ever removed this reasoning expires with it.

## Step 3 — our own 54 errors under full `strict`

**Deferred by the same user decision as step 1** — this is `strictNullChecks`'s own-code tail, so it
is gated on step 1 exactly as before; nothing here changed by step 2's outcome.

Concentrated in 20 files; the top of the list is where the real work is:

| file | errors |
|---|---|
| `bridge/message-router.ts` | 13 |
| `diagrams/d2/d2-render.ts` | 7 |
| `boot/vditor-init.ts` | 6 |
| `diagrams/d2/elk-layout.ts` | 5 |
| `bridge/message-router.test.ts` | 4 |
| `editing/fix-table-ir.ts` | 3 |
| `util/lang.ts`, `diagrams/d2/elk-entry.ts` | 2 each |
| 12 more files | 1 each |

By error code: `TS2531`/`TS2532`/`TS18048` (possibly null/undefined) 23 · `TS2345`/`TS2322`
(assignability) 17 · `TS7053`/`TS7016` (implicit any / missing declaration) 6 · `TS2352` (unsafe
cast) 3.

- [ ] Fix them as real null-safety fixes, not silencing. Note the two D2 files here
      (`d2-render.ts`, `elk-layout.ts`) overlap with
      [task 502](502-production-duplication.md)'s D2 work and with the untested-router caveat task
      499 recorded — coordinate, and prefer landing 502's characterization tests first if both are
      in flight.

## Verification

- [ ] `npm run typecheck` — exit 0 after each flag.
- [ ] The patch-anchor probe from step 1 (break → red → revert), recorded with its output.
- [ ] `npm test`, `node build.mjs`, `xvfb-run -a npm --prefix media-src run test:e2e`,
      `xvfb-run -a npm run test:vscode:fast` — a null-check fix can change behaviour when the
      value really was null at runtime, so the e2e layers matter here more than for a typical
      type-only change.
- [ ] `npm run lint:ci`, then `npm run quality`.

## Out of scope

- The host tree — already `strict: true`.
- `type-coverage` as a separate metric (task 469 item 5e's other half) — decide after this lands;
  the number is meaningless while half the tree is unchecked.
- Upgrading or re-vendoring Vditor to a version whose source is strict-clean. That would dissolve
  step 1, but it is a far larger change with its own risk, and ADR-0004 constrains how we consume
  Vditor.
