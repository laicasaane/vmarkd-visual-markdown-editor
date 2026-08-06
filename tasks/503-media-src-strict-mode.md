# Task 503 — turn on `strict` for the webview tree (`media-src`)

**Status:** TODO · **Impact:** 🟡 type-safety only, no runtime change — but it touches the
typecheck config both trees are gated by, so getting the Vditor question wrong breaks the gate for
everyone · **Origin:** [task 469](done/469-housekeeping-sweep.md) item 5e, never planned; measured
properly 2026-08-06.

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
        before committing to it.
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

Per-flag error counts against the gating config (`media-src/tsconfig.typecheck.json`), i.e.
**including** Vditor's source, so these are the pessimistic numbers — they hold even if step 1
finds no way to exclude Vditor:

| flag | errors (with Vditor in scope) | verdict |
|---|---|---|
| `strictPropertyInitialization` | **1** | do it first |
| `useUnknownInCatchVariables` | **3** | trivial |
| `noImplicitAny` | **18** | small |
| `strictFunctionTypes` | **83** | a real but bounded afternoon |
| `strictNullChecks` | 1694 (**~35 ours**) | gated on step 1 |

- [ ] Enable in that order, **one flag per commit**, each with its error count fixed to zero before
      the next is turned on. Four of the five are ~105 errors total — that is most of `strict` for
      a modest cost, and it is worth banking even if step 1 stalls.
- [ ] Do NOT add `// @ts-expect-error` or `any` to make a flag pass. If a site genuinely needs an
      escape hatch, it needs a comment saying why, per `.claude/rules/ts.md`.

## Step 3 — our own 54 errors under full `strict`

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
