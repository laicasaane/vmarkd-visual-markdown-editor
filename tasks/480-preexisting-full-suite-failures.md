# Task 480 — The full real-VS-Code suite has ~11 PRE-EXISTING failures

**Status:** 🔴 OPEN — measured and attributed 2026-07-31 · **Impact:** 🔴 high on process, unknown on
users — the nightly/tag gate is red, so it cannot signal anything, and nobody currently knows which
of these represent real user-facing breakage · **Origin:** the first full-suite run in a long while

## The finding, and how it was attributed

The full suite (`npm run test:vscode`, 247 tests) came back with 11 failures. The obvious suspicion
was the day's work — ~250-file module decomposition (460), CSS source-patch conversions (464), 85
unexports (469), a keyboard dispatcher (457/459), writeback serialization (477).

**It is none of those.** Measured by building a `git worktree` at `443576b` — the last commit of
2026-07-30, before any of that landed — and running the same specs there:

| spec | HEAD | baseline `443576b` (verified build) |
|---|---|---|
| `bottom-gap` | ✘ 3/3 | **✘ 3/3** |
| `flip-skip` | ✘ 3/3 | **✘ 2/2** |
| `abc-flip-cache-hit` | ✘ 3/3 | **✘ 3/3** |
| `diagram-cache-mermaid` | ✘ 3/3 | **✘ 3/3** |
| `parity` | ✘ 3/3 | ✘ 3/3 *(first attempt only — see the build caveat below)* |

Identical. These are **pre-existing**, not regressions.

**Provenance of these numbers, because the first attempt was unsound.** The initial baseline run
used a symlinked `media-src/node_modules`, which made the baseline build FAIL silently — its result
was reported before that was noticed, and had to be retracted. The four rows marked *verified build*
above were re-measured on a baseline that built with exit 0 and produced its own
`media/dist/main.js` (426 KB, distinct from HEAD's 443 KB, confirming it really is the older code).
`parity` has only the first, unsound measurement so far and must be re-run. See the reproduction
box below for the trap.

## The failing set (baseline run, 2026-07-31 against `443576b`)

- `bottom-gap.spec.ts:28` — the document ends with a gap in BOTH IR and Preview
- `d2-feature-parity.spec.ts:18` — D2 feature parity renders in the real webview
- `flip-skip.spec.ts:24` — mermaid + echarts SKIP re-render on a mode-independent flip (task 164)
- `font-parity.spec.ts:103` — vscode-dark-2026 **and** vscode-light-2026 prose typography vs VS Code's preview
- `mode-switch-parity.spec.ts:104 / :170 (×2) / :303` — anchor pairing, scroll anchoring, cumulative creep
- `parity.spec.ts:56` — IR (collapsed) renders at the same size/spacing as Preview
- `wysiwyg-parity.spec.ts:163 / :181 / :197` — byte-identical diagrams across panes, render reuse, callout height

On HEAD the same run additionally showed `plantuml.spec.ts`, `plantuml-cache.spec.ts`,
`plantuml-phase-timing.spec.ts`, `diagram-cache-mermaid.spec.ts` and `abc-flip-cache-hit.spec.ts`
failing; those were **not** re-run against the baseline yet, so their attribution is still open —
do that before assuming they are also pre-existing.

## What this means, stated plainly

The nightly/tag gate is red and has been for some unknown length of time. A permanently-red gate
is worse than no gate: it cannot signal a new regression, and it trains everyone to ignore it. The
day's work happened to be verified by targeted spec runs instead, which is why nothing was noticed
sooner.

Note the shape of the set: it is almost entirely **geometry parity** (IR vs WYSIWYG vs Preview
spacing/anchoring/height) and **render-reuse/cache** assertions. That clustering suggests a small
number of shared causes rather than 11 independent bugs, and it is the first thing to test.

## Scope

- [ ] Re-run the 5 unattributed specs (`plantuml*`, `diagram-cache-mermaid`, `abc-flip-cache-hit`)
      against `443576b` to finish the attribution. Cheap, and it decides whether anything here IS
      today's.
- [ ] Group the confirmed pre-existing failures by suspected shared cause before fixing any of
      them individually. The parity cluster in particular looks like one or two root causes.
- [ ] For each: decide **bug or stale assertion**. Several of these pin contracts from older tasks
      (164's flip-skip, the 2026 theme font parity); a contract may have legitimately changed and
      the spec never followed. A stale assertion is fixed in the spec, not the product — but that
      call must be made per spec, with evidence, not assumed to make the red go away.
- [ ] Only then fix. Do not batch-fix a red gate; that is how a wrong assertion gets frozen in.

## How to reproduce the attribution — and the trap in it

> ### ⚠️ Do NOT symlink `media-src/node_modules` into the baseline worktree
>
> The first attempt did, to save 178 MB, and **the baseline build silently failed** — the result was
> reported before the failure was noticed. `build.mjs` patches the *vendored Vditor sources inside
> `media-src/node_modules/vditor/src/`* with **relative** imports like
> `../../../../../src/html-comment`. Through a symlink those resolve back into the MAIN repo's
> `media-src/src/` — i.e. the post-460 module layout, not the baseline's flat one — so esbuild fails
> on three unresolvable imports and `media/dist/main.js` is never produced for the worktree.
>
> A second hazard from the same shortcut: that patching **writes into the shared `node_modules`**, so
> building a baseline can leave the main tree's vendored sources pointing at the wrong layout.
> `build.mjs` re-patches on every run so it self-heals, but do not rely on that.
>
> `media/dist/` and `media/vditor/dist/` are gitignored, so a fresh worktree has neither — a failed
> build means the suite runs against nothing, and every result from it is worthless.

```bash
git worktree add tmp/baseline 443576b
ln -sfn "$PWD/node_modules" tmp/baseline/node_modules
ln -sfn "$PWD/test/vscode-e2e/node_modules" tmp/baseline/test/vscode-e2e/node_modules
# media-src/node_modules must be a REAL COPY, not a symlink — see the box above.
mkdir -p tmp/baseline/media-src/node_modules
cp -r media-src/node_modules/. tmp/baseline/media-src/node_modules/
cd tmp/baseline && node build.mjs          # MUST exit 0 — check it, don't assume
ls media/dist/main.js                      # must exist, and differ in size from HEAD's
cd test/vscode-e2e && xvfb-run -a npx playwright test <spec>.spec.ts
```

Run it **alone** — see `scripts/e2e-lock.mjs` and DEVELOPMENT.md for why two concurrent real-VS-Code
runs corrupt each other's cache-hit and timing specs. (The baseline worktree predates that lock, so
it will not stop you; the discipline is yours.)
