# Task 473 — Duplication baseline (jscpd), tracked for ratcheting down

**Status:** ✅ DONE 2026-08-01 — triaged, the one real production clone extracted, ratchet wired at
`"threshold": 9.8` in `.jscpd.json`. The two deferrals are split out as their own tasks with the
measurements that justify them ([483](483-vscode-e2e-shared-helper-module.md) for the 79 %,
[484](484-callout-arrow-nav-untested.md) for a coverage gap found on the way) — not left implicit ·
**Impact:** 🟢 no behaviour change ·
**Origin:** [task 469](469-housekeeping-sweep.md) item 5c, `jscpd`'s first run, 2026-07-31/08-01.

## What was found

`jscpd` (config: `.jscpd.json`), scanning `src`, `media-src/src`, `media-src/e2e`, `test` (TypeScript
only; `media-src/node_modules`/`media`/`out`/`tmp`/`.worktrees` excluded):

| metric | baseline 2026-07-31 | re-measured 2026-08-01 |
|---|---|---|
| total lines | 109,508 | 116,489 |
| total tokens | 581,377 | 611,934 |
| clones found | 743 | 781 |
| duplicated lines | 10,500 (**9.59 %**) | 10,975 (**9.42 %**) |
| duplicated tokens | 66,305 (**11.40 %**) | 69,162 (**11.30 %**) |

The re-measurement is the first evidence that this baseline does its job: the tree grew ~7 k lines in
a day and the **percentage went down** (9.59 → 9.42). Absolute clone count rising while the ratio
falls is what healthy growth looks like; had only the absolute number been recorded, this would have
read as a regression.

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

## The triage — done 2026-08-01

Method: `npx jscpd --config .jscpd.json --reporters json --output tmp/jscpd-report`, then every clone
bucketed by the **directory pair** it spans. Bucketing by pair rather than eyeballing the top-N is
what makes the result actionable — the top 25 clones by size are all one bucket, so a hand-triage of
"the biggest 10-20" would have described 79 % of the problem as if it were 25 separate findings.

| bucket | dup lines | share | clones | verdict |
|---|---:|---:|---:|---|
| `test/vscode-e2e` ↔ itself | 9291 | **79.0 %** | 552 | **real duplication** — see below |
| `media-src/src/diagrams/d2` ↔ itself | 417 | 3.5 % | 33 | **intentional** — per-shape draw fns |
| `test/backend` ↔ itself | 361 | 3.1 % | 36 | intentional — per-case table setup |
| `diagrams/render-cache-client.test.ts` ↔ itself | 121 | 1.0 % | 15 | intentional — per-case setup |
| `editing/callout-nav.ts` ↔ `hr-nav.ts` / `gap-paragraph.ts` | 113 | 1.0 % | 8 | **real, production** — see below |
| everything else | ~1450 | 12.4 % | ~130 | long tail, nothing over 0.7 % |

### The 79 %: `test/vscode-e2e` has no shared-helper module at all

**187 of 190 spec files** carry their own inline copy of the same four helpers — `wf()` (the
`iframe.webview` → `iframe[title="vMarkd"]` frameLocator chain), `ev()`, `settle()` and `docText()`.
**Zero** spec files import a shared module, because no such module exists in that directory.

This is not the "per-probe-spec boilerplate that's clearer left alone" this file originally guessed
at. It is genuinely copy-pasted code, and the sibling harness proves it: **`media-src/e2e` factors
its shared code into 34 `*-harness.ts` modules plus `mouseops-helpers.ts`.** The same team, the same
kind of suite, the opposite convention. That asymmetry — not the raw percentage — is the finding.

**It is deliberately NOT fixed here.** Split out as
[task 483](483-vscode-e2e-shared-helper-module.md), for one measured reason:
`test/vscode-e2e` has **no `tsconfig.json`** — Playwright transpiles the specs via esbuild at run
time, so there is no `tsc` net over that tree. A 187-file mechanical extraction would therefore have
**no static verification whatsoever**; its only validator is the full real-VS-Code suite, which costs
1–2 h and currently carries known-red specs ([480](480-preexisting-full-suite-failures.md)). Landing
that sweep alongside other work would make the next suite run un-attributable, which is precisely
the "unreviewed churn" this file warned against. It needs its own pass and its own clean suite.

### The 1 %: the nav cluster is the only real *production* duplication

`editing/callout-nav.ts` overlaps `hr-nav.ts` and `gap-paragraph.ts` across 8 clones / 113 lines.
These three files each implement "a keydown handler that steps the caret across a void or
non-editable block."

**Re-measured after [472](472-caret-gap-paragraph-circular-dep.md) landed: unchanged — still 8
clones, 113 lines, only the line numbers moved.** 472 extracted the trailing-paragraph *shape*
logic, which is a different concern; this cluster is independent of it. Worth recording because the
opposite was plausible and assuming it would have been wrong.

Broken down, the 8 clones are **two pure functions plus two pieces of handler structure**, and they
are not the same kind of thing:

| duplicated piece | shape | verdict |
|---|---|---|
| `caretLineRect(range)` | pure — `Range` → `DOMRect`, no writes | **extract** |
| `topLevelBlock(editor, node)` | pure — DOM walk to the top-level block | **extract** |
| the keydown guard preamble (Arrow key + no modifiers + collapsed + `editor.contains`) | handler structure | leave — parallel structure |
| the edge-detection tail (`caretLineRect` + tolerance + `onEdge`) | handler structure | leave — parallel structure |

The two pure functions are the safe, worthwhile half: no side effects, no caret writes, fully
unit-testable, and verified to be **semantically identical in all three files** —
`topLevelBlock` is byte-identical across the three, and the only difference between the three
`caretLineRect` copies is brace style (`if (x) { y }` vs `if (x) y`), i.e. formatting, not
behaviour. Checked by diffing the bodies rather than assuming, because a *drifted* copy would have
been a bug to preserve, not duplication to collapse.

The two handler pieces are deliberately left alone: they read as three sibling implementations of
the same interaction, and collapsing them behind a parameterised abstraction would trade the
clarity of "here is what ArrowDown does next to a collapsed callout" for a metric.

**Extracted 2026-08-01.** Both pure functions now live in `media-src/src/editing/nav-geometry.ts`
— a new module in the same `editing` module both files already belonged to (zero
`WEBVIEW_ALLOWED_EDGES` change; only the manifest-totality id list). `callout-nav.ts`, `hr-nav.ts`
and `gap-paragraph.ts` all import `caretLineRect`/`topLevelBlock` from it instead of carrying their
own copy. `nav-geometry.test.ts` gives both functions their first direct unit tests (they were
file-private before) — `caretLineRect`'s zero-height fallback in both directions plus its
element-box last resort, and `topLevelBlock`'s direct-child and outside-the-editor cases.

Re-measured after the extraction: clones 781 → **780**, duplicated lines 10,975 (9.42 %) →
**10,967 (9.37 %)**, duplicated tokens 69,162 (11.30 %) → **69,022 (11.24 %)**. Verified the
specific removal directly rather than trusting the aggregate delta alone (this tree has other
agents' concurrent in-flight work landing throughout, so a whole-tree before/after diff is not on
its own attributable to one change): grepping the new `jscpd` output for `callout-nav`/`hr-nav`/
`gap-paragraph` shows exactly 3 remaining clones in the cluster, all lines matching the keydown
guard preamble and edge-detection tail — the two handler-structure pieces this file explicitly
decided to leave alone. The `caretLineRect`/`topLevelBlock` pairs are gone from the report.

### Confirmed intentional — do not collapse

`diagrams/d2`'s per-shape draw functions (417 lines) and the per-case setup blocks in `test/backend`
and `render-cache-client.test.ts` (482 lines) are parallel structure that reads *better* repeated.
Collapsing them behind a parameterised abstraction would trade clarity for a metric. Recorded here so
the next person does not re-open the question.

## Checklist

- [x] Triage a sample of the largest clones: real duplication vs intentional parallel structure.
      Done by directory-pair bucketing (table above) rather than top-N, which is what made the 79 %
      concentration visible.
- [ ] Extract shared helpers for the ones that are real duplication.
      → the `test/vscode-e2e` sweep is split out as
      [483](483-vscode-e2e-shared-helper-module.md) (reason above, still open); the nav cluster
      half is **done** (`nav-geometry.ts`, see "Extracted 2026-08-01" above) — left unticked at
      the top level because 483 is the other half of this same line item and is not done.
- [x] **Ratchet wired: `"threshold": 9.8` in `.jscpd.json`.**

      *Mechanism*, measured rather than read off the docs: `jscpd` exits non-zero when the threshold
      is exceeded, and it gates on the **duplicated-LINES percentage, not tokens**. Proven by
      discrimination, not assumption — at lines 9.36 % / tokens 11.24 %, a threshold of `10` exits
      **0**, so the token figure is demonstrably not what is compared.

      *Placement*: as a key in `.jscpd.json` rather than a CLI flag, so `npm run jscpd` — and
      therefore `npm run quality` — inherits it with no script change. Confirmed the **config key**
      is honoured and not silently ignored: temporarily setting it to `9.0` makes a full 657-file
      scan exit **1**; back at `9.8` it exits **0**.

      ⚠️ One trap worth recording, because it produced a false green first: a copy of the config
      placed elsewhere (e.g. `tmp/`) resolves its relative `path` entries **against the config
      file's own location**, so it scans 0 files and passes trivially. A threshold test that
      reports `Found 0 clones` is testing nothing. Always verify the file count in the output.

      *Why 9.8 and not tighter*: current is 9.36 %, so this is ~0.44 pp of headroom. Every new
      `test/vscode-e2e` spec adds roughly 40–140 duplicated lines on today's conventions
      (≈0.03–0.12 pp each), so this absorbs a handful of new specs and then trips — which is the
      intended behaviour, not a flaw. When it trips, the answer is
      [483](483-vscode-e2e-shared-helper-module.md), not a raised threshold.
- [x] Re-run `npm run jscpd` after any change and update the numbers in this file.
      Final, on the settled tree with all six of the day's tasks landed: **657 files, 117,113 lines,
      780 clones, 10,967 duplicated lines (9.36 %), 69,022 duplicated tokens (11.24 %)** — down from
      the 9.59 % baseline while the tree grew ~7.6 k lines.
