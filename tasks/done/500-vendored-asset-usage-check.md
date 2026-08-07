# Task 500 — detect when a vendored engine bundle stops being used

**Status:** ✅ DONE 2026-08-06 (check + baseline; wiring into `npm run quality` deliberately
deferred, see below) · **Impact:** 🟡 new maintenance check — no runtime change, but it closes a
blind spot no existing tool covers and could flag shippable dead weight in the VSIX ·
**Origin:** [task 498](498-knip-baseline-cleanup.md), raised by the user while reviewing that
task's "script-loaded modules" blind spot.

## The gap

`knip` and `dependency-cruiser` traverse the TS import graph only. Every vendored engine under
`media-src/vendor/` is a **pre-built bundle loaded into the webview by `<script src>`** at runtime,
so neither tool has any opinion about it. Concretely: if the `wavedrom` engine were deleted from
the source tree tomorrow, `media-src/vendor/wavedrom/` would stay in the repo — and, because the
sync step copies it into `media/vditor/dist/js/`, keep shipping inside the VSIX — **forever, with
zero tool complaining**. The same asymmetry already bit us in the other direction twice
([task 471](471-dead-vendored-devdependencies.md), [task 481](481-dependency-audit-triage.md)):
static analysis says nothing useful about assets consumed off the import graph.

There are ~18 vendored directories: abcjs, d2, echarts, elk, leaflet, lute, markmap, mermaid,
mermaid-layout-elk, nomnoml, plantuml, plantuml-stdlib, smiles-drawer, threejs, topojson, vega,
viz, wavedrom.

## The anchor that makes this tractable

`media-src/vendor/vendored-assets.mjs` already holds a **declarative `VENDORED_ASSETS` table** —
one row per asset, driving `syncVendored()` (sha-verify → copy bytes → copy LICENSE). It is the
single list of what gets shipped, so it is the natural left-hand side of the check. Its header
comment is worth reading first; the table also underpins the shipped-license invariant guarded by
`test/backend/vendored-licenses.test.ts`, which is a good model for how this check should be
shaped and where it should live.

## The hard part: defining "used"

This is the design decision the task turns on, and it should be settled explicitly rather than
discovered halfway through. A vendored bundle is reachable in several distinct ways, and a naive
check will produce false "dead" verdicts — the exact failure mode that made task 471's devDependency
finding wrong:

- referenced by name in a `getCdn()`/script-injection call in `media-src/src/**`;
- named in the engine registry (`media-src/src/diagram-kit/engine-registry.ts`) — likely the
  strongest signal for the diagram engines specifically;
- pulled in transitively by ANOTHER vendored bundle (precedent: the vendored mermaid-layout-elk
  chunk needs d3 at build time — task 481 — so bundle-to-bundle edges are real);
- loaded by the host rather than the webview (`src/webview-host/html-builder.ts` builds its own
  `<script>` tags);
- not an engine at all — `plantuml-stdlib` is data consumed by the pre-inline expander
  (task 136), and `lute` is the markdown core, not a diagram engine.

- [x] Decide the "used" predicate and write it down before implementing. A string-name search
      across `media-src/src/**` + `src/**` + the other vendor dirs is probably the honest baseline;
      anything cleverer needs justification.

  **The predicate, settled before writing the script:** a `VENDORED_ASSETS` row with dir `D` counts
  as USED iff either literal substring appears anywhere in a fixed corpus:
  - `` dist/js/D/ `` — the runtime path every `getCdn()`-based `<script src>` / `addStylesheet` call
    in `media-src/src/**` builds (confirmed by grep for every one of the 12 assets our OWN code
    fetches: wavedrom, threejs, nomnoml, leaflet, topojson, vega, mermaid-layout-elk, d2, elk, viz,
    plantuml, plantuml-stdlib).
  - the SAME `dist/js/D/` pattern, but the corpus also has to include
    `media-src/node_modules/vditor/dist/{index,method}.js` — Vditor's own bundled library. Six
    assets (**lute, mermaid, echarts, markmap, abcjs, smiles-drawer**) have **zero** `getCdn()` call
    anywhere in our source; Vditor fetches them itself, internally, via its own `cdn` option, with
    the exact same `${cdn}/dist/js/<dir>/<file>` string hardcoded inside its bundled
    `dist/index.js` (confirmed by grepping `media-src/node_modules/vditor/dist/index.js` — it
    contains literal `dist/js/lute/`, `dist/js/mermaid/`, `dist/js/echarts/`, `dist/js/markmap/`,
    `dist/js/abcjs/`, `dist/js/smiles-drawer/`). **Without this corpus member all six would
    false-report DEAD** — exactly the failure mode task 471 hit (a real consumer existing outside
    the grep'd tree). This is also why `lute` (the markdown core, not a diagram engine) and
    `plantuml-stdlib` (data for the pre-inline expander, not an engine at all) both still resolve
    cleanly: the predicate doesn't care WHAT kind of consumer it is, only whether a literal
    reference exists.
  - `` vendor/D/ `` — a real relative import straight from `media-src/src/**` into the vendor dir,
    the build-time-bundled shape task 481 flagged for `mermaid-layout-elk`→`d3`. Concretely:
    `media-src/src/diagrams/d2/elk-entry.ts` imports `../../../vendor/elk/{elk-api.js,elk-worker.min.js}`
    and `media-src/src/diagrams/mermaid/mermaid-elk-entry.ts` imports
    `../../../vendor/mermaid-layout-elk/mermaid-layout-elk.core.mjs` directly; esbuild inlines those
    bytes into the generated `elk-main.js` / `mermaid-elk-main.js` (the `copy: []` rows in
    `vendored-assets.mjs`). Both are ALSO reachable via `dist/js/D/` (the generated bundle's own
    runtime path), so this pattern is currently redundant for the two rows it was written for — kept
    anyway as an independent signal for a future build-time-only asset that has no runtime cdn path
    of its own.
  - Checked directly: no vendor dir's own bundled `.js` currently references another vendor dir by
    string (`grep -rn "dist/js/" media-src/vendor --include=*.js` → 0 hits outside `.map` files), so
    `media-src/vendor/**` is not itself part of the search corpus — vendor dirs are only ever
    IMPORTED FROM, never grepped, in the current predicate.
  - Corpus, concretely: `media-src/src/**/*.ts`, `src/**/*.ts`,
    `media-src/node_modules/vditor/dist/index.js`, `media-src/node_modules/vditor/dist/method.js`.
    If the vditor dist tree is missing (fresh checkout, no `npm ci` yet) the script prints an
    explicit caveat instead of silently false-reporting the 6 Vditor-internal engines dead.

- [x] Prefer reporting over failing at first. A check that hard-fails the build on a heuristic will
      be disabled the first time it is wrong.

  Implemented as report-only by default (always exits 0, prints a USED/DEAD table); a `--strict`
  flag exists for future opt-in gating (exits 1 iff anything is DEAD) but nothing invokes it yet.

## Steps

- [x] Write the check (a `scripts/*.mjs` in the existing plain-Node style, or a
      `test/backend/*.test.ts` alongside `vendored-licenses.test.ts` — pick one and say why).
      Cross `VENDORED_ASSETS` against the "used" predicate; report any asset with no live consumer.

  **Chose `scripts/check-vendored-usage.mjs`** (plain Node, no deps), not a `test/backend/*.test.ts`.
  Reasoning: `vendored-licenses.test.ts` guards a HARD invariant (license files must exist — a
  binary yes/no with no judgment call). This check is a HEURISTIC (string-presence across a fixed
  corpus) whose "dead" verdict explicitly requires human judgment before acting on it (see
  Verification below) — a vitest `it.each` that turns any heuristic miss into a red test suite is
  exactly the shape the task warns will get disabled the first time it's wrong. A script that prints
  a report and exits 0 by default fits the "prefer reporting" instruction directly, and matches the
  existing `scripts/check-bundle-size.mjs` / `scripts/check-coverage-modules.mjs` convention (a
  standalone, manually-invokable report/gate with an opt-in strict mode). Confirmed the file lands
  **outside biome's lint tree**, same as its siblings: `biome.json`'s `files.includes` only lists a
  bare `*.mjs` (root-level files) and `media-src/*.mjs`, not `scripts/**/*.mjs` — verified directly
  with `./node_modules/.bin/biome check scripts/check-vendored-usage.mjs` → *"No files were
  processed… ignored by the configuration"* (same result for the two existing sibling scripts).

- [x] Run it and record the CURRENT verdict for all ~18 assets in this file — including, for each
      asset reported dead, whether it is genuinely dead or a false positive and why. That baseline
      is the real deliverable; the script is just how it is produced.

  **Baseline (2026-08-06, `node scripts/check-vendored-usage.mjs`): 18/18 USED, 0 reported dead.**

  | asset | verdict | evidence |
  |---|---|---|
  | lute | USED | `src/lute/lute-host.ts` (host-side Node Lute, hardcodes `media/vditor/dist/js/lute/lute.min.js`) |
  | mermaid | USED | Vditor's own `dist/index.js` (native renderer, no `getCdn()` call of ours) |
  | echarts | USED | Vditor's own `dist/index.js` (native renderer + mindmap share it) |
  | plantuml | USED | `media-src/src/diagrams/plantuml/plantuml-render.ts` |
  | plantuml-stdlib | USED | `media-src/src/diagrams/plantuml/plantuml-render.ts` (the `!include` expander, task 136 — data, not an engine, still a real reference) |
  | viz | USED | `media-src/src/diagrams/graphviz-render.ts` (shared by plantuml too) |
  | abcjs | USED | Vditor's own `dist/index.js` (native renderer) |
  | smiles-drawer | USED | Vditor's own `dist/index.js` (native renderer) |
  | wavedrom | USED | `media-src/src/diagrams/engines/wavedrom.ts` |
  | nomnoml | USED | `media-src/src/diagrams/engines/nomnoml.ts` |
  | leaflet | USED | `media-src/src/diagrams/engines/geojson-topojson.ts` |
  | topojson | USED | `media-src/src/diagrams/engines/geojson-topojson.ts` |
  | vega | USED | `media-src/src/diagrams/engines/vega.ts` (vega-lite shares it) |
  | threejs | USED | `media-src/src/diagrams/engines/stl.ts` |
  | markmap | USED | Vditor's own `dist/index.js` (native renderer) |
  | d2 | USED | `media-src/src/diagrams/d2/d2-entry.ts` |
  | elk | USED | `media-src/src/diagrams/d2/boot-elk.ts` (+ build-time import from `elk-entry.ts`) |
  | mermaid-layout-elk | USED | `media-src/src/diagrams/mermaid/mermaid-elk-entry.ts` (build-time import + its own generated bundle's runtime path) |

  No false positives to adjudicate — the predicate (with the Vditor-internal corpus member) leaves
  nothing unexplained. Nothing here is a surprise: every asset maps to a real, currently-shipping
  feature.

- [ ] Only if something is genuinely dead: propose its removal as a SEPARATE task. **N/A — nothing
      reported dead in the baseline.**

- [x] Decide whether to wire it into `npm run quality` / `scripts/quality.mjs`. Note that quality
      is not a `&&` chain (every stage runs, summary at the end), so adding a stage is cheap —
      but only add it once its output is clean or its noise is documented, per ADR-0005's
      philosophy and task 469's precedent of filing a baseline before gating on it.

  **Decision: NOT wired in yet, deliberately.** The output IS clean (18/18), which would make wiring
  cheap, but `scripts/quality.mjs` is shared/high-traffic (owned by task 469, actively read by other
  agents this session) and this check has had exactly one real-world run — one baseline is not
  enough runway to be confident the predicate won't need a second corpus member for some
  not-yet-imagined reachability shape (the same way this task's own predicate needed the
  Vditor-`dist/index.js` corpus member added only after checking the 6 native engines by hand).
  Recommend revisiting after this baseline has survived a few more real edits (e.g. the next time an
  engine's consumer genuinely moves) rather than wiring it in on day one. `node
  scripts/check-vendored-usage.mjs` remains runnable by hand today; wiring into `npm run quality` in
  report mode (no `--strict`) is a safe, cheap follow-up whenever someone wants it.

## Verification

- [x] The check itself runs clean and is deterministic (no network, no ordering surprises). Re-ran
      twice back-to-back: identical output both times (pure `fs.readFileSync` over a fixed file
      list, no external calls, no unordered `Set`/`Map` iteration in the output path).
- [x] Deliberately probe it: temporarily remove a real consumer of one engine and confirm the check
      REPORTS that engine, then revert. A check has never been seen to fire is not verified — same
      lesson as task 498's `@knipignore` probe.

  **Probe (2026-08-06):** confirmed `media-src/src/diagrams/engines/wavedrom.ts` was clean
      (`git status --short` empty) before touching it. Temporarily changed its `getCdn()` call from
      `` `${cdn}/dist/js/wavedrom/wavedrom.min.js` `` to
      `` `${cdn}/dist/js/PROBE-REMOVED/wavedrom.min.js` `` (i.e. simulated "wavedrom's last real
      consumer is gone"). Re-ran the check:

      ```
      DEAD  wavedrom               no reference found in the corpus
      17/18 assets have a live reference; 1 reported dead.
      ```

      `--strict` mode against the same probe state exited 1 (confirmed with `echo $?`). Reverted the
      one-line change immediately after; `git status --short` / `git diff` on the file both empty
      again afterward — confirmed the probe left no trace. The check is verified to actually fire,
      not just to have never been seen to fail.

- [x] `npm run lint:ci` — 0 warnings (note: `media-src/scripts/*.mjs` are outside biome's tree by
      the existing "maintenance tooling" convention; confirm where your new file lands).

  New file confirmed outside biome's tree (see Steps above). `npm run lint:ci` full-tree run: **1
  error**, in `src/shared/mermaid-palettes.ts` (a formatting diff) — pre-existing, **not caused by
  this task** (that file was not touched here; `git status --short` shows it modified by a different
  concurrent agent in this shared session, consistent with the team-lead's note that t499-clamp is
  editing `src/**` concurrently). Confirmed no error attributable to `scripts/check-vendored-usage.mjs`
  (it's outside the linted tree entirely, so it structurally cannot contribute).

- [ ] `npm test` if implemented as a backend test. **N/A — implemented as a `scripts/*.mjs`, not a
      backend test**, per the Steps rationale above. No new test file was added, so there is nothing
      for `npm test` to pick up; not run for this task (avoided per the team-lead's note that another
      agent may be running gates concurrently, and it would exercise zero new code either way).

## Known limitation: the predicate cannot tell code from a comment

Reviewed after the fact by the team lead, and worth stating plainly because it is the failure mode
that would make this check quietly worthless rather than merely noisy.

The predicate is **literal string presence** in the corpus. It has no idea whether `dist/js/<dir>/`
appears in executable code or in a comment. So it is asymmetric:

- **False DEAD** — the dangerous direction on day one — is well defended: the corpus was chosen
  specifically to include Vditor's own bundled dist, which is what rescues the six engines our
  source never fetches, and the probe confirmed a genuinely removed consumer IS reported.
- **False USED** is undefended. If an engine's last real consumer were deleted but any comment
  anywhere in `media-src/src/**` or `src/**` still mentioned its `dist/js/<dir>/` path, the check
  would keep reporting USED forever and the dead bundle would go on shipping — the exact outcome
  this task exists to prevent.

That is not hypothetical in this repo: [task 498](498-knip-baseline-cleanup.md) hit the
comment-vs-usage trap **four separate times** (`themeNomnomlSvg`, `renderD2`, `initLeafletMap`,
`graphvizRender` all had `test/vscode-e2e/*.spec.ts` "consumers" that turned out to be prose), and
this codebase's comment density is unusually high by convention (`.claude/rules/ts.md` requires a
comment on every workaround and override).

**The 2026-08-06 baseline is not affected** — spot-checked independently: the evidence line for
`wavedrom` (`engines/wavedrom.ts:109`), `nomnoml` (`engines/nomnoml.ts:80`), `plantuml` /
`plantuml-stdlib` / `viz` (`plantuml-render.ts:207,1373,1374`) and `lute` (`lute-host.ts:31`) are
all real template literals / string constants in executable code, not comments. So every current
USED verdict is genuinely evidenced.

**If this check is ever wired into `quality` or otherwise trusted to gate**, fix this first — the
cheap version is to strip `//` and `/* */` comments from each file before searching, which is
imperfect for strings-inside-comments but removes the whole realistic false-USED class. Until then,
treat a USED verdict as "a reference exists somewhere", not as "this engine is live".

## Out of scope

- Actually deleting any vendored bundle (see above — separate task, deliberately).
- Fixing the comment-blindness above. It does not affect the current baseline (verified), and the
  check is report-only and ungated, so it is a real but non-urgent gap — it becomes a prerequisite
  the moment anyone proposes gating on this.
- Re-pinning / upgrading any vendored engine.
- Extending the idea to non-vendored script-loaded assets (hljs, vditor-icons, i18n) unless it
  falls out for free.
