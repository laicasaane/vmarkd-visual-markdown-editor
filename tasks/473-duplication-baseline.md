# Task 473 — Duplication baseline (jscpd), tracked for ratcheting down

**Status:** 📋 OPEN — baseline recorded, no target set yet · **Impact:** 🟢 no behaviour change ·
**Origin:** [task 469](469-housekeeping-sweep.md) item 5c, `jscpd`'s first run, 2026-07-31/08-01.

## What was found

`jscpd` (config: `.jscpd.json`), scanning `src`, `media-src/src`, `media-src/e2e`, `test` (TypeScript
only; `media-src/node_modules`/`media`/`out`/`tmp`/`.worktrees` excluded):

| metric | value |
|---|---|
| files analyzed | 625 |
| total lines | 109,508 |
| total tokens | 581,377 |
| clones found | 743 |
| duplicated lines | 10,500 (**9.59%**) |
| duplicated tokens | 66,305 (**11.40%**) |

Run it yourself: `npm run jscpd` (console reporter; add `-r json` / `-r html` locally for a
file-by-file breakdown — not checked in, this task only records the summary).

## What this task is — and isn't

**Is:** a baseline. Task 469 explicitly scoped item 5c to "add the tool + record the baseline," not
a de-duplication pass, and this task inherits that scope. The number above exists so a *future*
change in it is meaningful — "duplication went from 9.59% to 11%" is a real regression signal;
"duplication is 9.59%" in isolation isn't actionable on its own.

**Isn't:** a mandate to go de-duplicate 743 clones. Some of this is very likely legitimate
(near-identical test setup boilerplate across `test/vscode-e2e/*.spec.ts`'s many probe/repro specs,
parallel per-engine renderer functions that are *supposed* to look similar — see `d2-render.ts`'s
per-shape draw functions — and vendored-adjacent glue). A mass dedup pass without first triaging
which clones are "real duplication" vs "structurally similar code that's clearer left alone" would
risk exactly the kind of unreviewed churn this repo's testing/coverage discipline pushes against.

## Suggested next step (not started)

Run `jscpd` with the HTML or JSON reporter locally, sort clones by size, and triage the top 10-20 by
hand: which are worth extracting into a shared helper (real duplication, e.g. copy-pasted parsing
logic) vs which are intentional parallel structure that shouldn't be collapsed (e.g. per-engine
render functions, per-probe-spec boilerplate)? That triage is what would turn this baseline into an
actual ratchet (a `jscpd` threshold flag, or a tracked "don't exceed N%" the way
`scripts/check-coverage-modules.mjs` ratchets coverage) rather than a number nobody revisits.

## Checklist

- [ ] Triage a sample of the largest clones: real duplication vs intentional parallel structure.
- [ ] Extract shared helpers for the ones that are real duplication.
- [ ] Decide on and wire up an actual ratchet (threshold that fails on regression) once the baseline
      has been triaged at least once — don't wire one blind, per task 469 item 6's "only wire in once
      each tool runs clean, or is deliberately baselined."
- [ ] Re-run `npm run jscpd` after any change and update the numbers in this file.
