# Task 528 — Restore section-anchored split-view scroll synchronization

> **Status:** 📋 planned · **Impact:** 🟡 split-view orientation is visibly wrong on documents with
> uneven source/rendered block heights · **Origin:** user report and real-VS-Code reproduction,
> 2026-08-30 · **Regression of:** [Task 48](done/48-split-view-line-scroll-sync.md)

**Goal:** Restore Task 48's source-to-Preview contract: when an ATX heading is at the vertical
center of the source pane in `sv` mode, the matching rendered heading is centered in the Preview
pane. Preserve heading-segment interpolation between anchors so long documents do not fall back to
Vditor's total-height proportional drift.

**Architecture:** Keep the existing `alignByHeadings` interpolation and one-directional
source-to-Preview scroll owner. Replace only the invalid source-anchor discovery: derive real
document headings from the current SV source text with the shared fence-aware Markdown scanner,
map their source positions to live DOM ranges/elements, and pair them in document order with the
top-level rendered headings. Cache or coalesce anchor rebuilding so a scroll frame does not
serialize or reparse the whole document unnecessarily.

**Related:** [Task 187](done/187-sv-split-mode-polish.md) owns broader split-mode polish and mode
switch preservation. [Task 518](done/518-dependency-vendor-security-upgrades.md) refreshed Vditor
and Lute in one atomic dependency batch; it is the likely regression boundary, but exact historical
attribution is not required to repair the current invariant.

## 1. Confirmed regression and root cause.

The tracked fixture `test/vscode-e2e/fixtures/all-renderers.md` reproduces the user's screenshot in
the current built extension. A temporary real-VS-Code geometry probe centered the literal source
heading `## 12. WaveDrom — timing diagrams` and measured:

- source heading offset from viewport center: `0 px`;
- rendered heading nearest the Preview center: `8. Graphviz / Viz.js — DOT, SVG post-processing
  theme`, `83 px` above center;
- source pane geometry: `scrollTop=4269`, `scrollHeight=20690`, `clientHeight=750`;
- Preview geometry: `scrollTop=3438`, `scrollHeight=17263`, `clientHeight=750`; and
- Task 48 source anchors: `1`, versus `22` top-level rendered heading anchors.

`media-src/src/nav/split-scroll-sync.ts` currently treats every direct child of `.vditor-sv` as a
separate source block and filters those children with `/^#{1,6}\s/`. The current real SV DOM has one
direct wrapper `<div>` containing the entire syntax-highlighted document. Its text starts with the
document's H1, so the implementation misclassifies that whole wrapper as one heading. The rendered
pane still exposes 22 direct `h1`-`h6` children. `alignByHeadings` correctly rejects the `1 != 22`
anchor mismatch, leaving Vditor's proportional scroll write untouched—the exact drift Task 48 was
intended to replace.

The existing tests do not detect this failure:

- `media-src/e2e/split-scroll.spec.ts` passes 5/5 while checking only pane visibility,
  scrollability, nonzero Preview movement, and top/bottom proximity; proportional scrolling
  satisfies every assertion.
- `test/vscode-e2e/sv-split.spec.ts` passes while checking rendering, mode reporting, Preview DOM
  preservation, and nonzero scroll restoration; it never compares centered section identities.

The temporary diagnostic probe was removed after reproduction. This task must turn its semantic
heading-identity assertion into permanent coverage.

## 2. Product contract.

- In split (`sv`) mode, scrolling the source pane aligns matching ATX headings at the two panes'
  vertical centers, within a small geometry tolerance appropriate for real-webview fonts and
  fractional layout.
- Between adjacent headings, interpolate the viewport center between the matching source and
  rendered anchor pair. Preserve the virtual document-top and document-bottom anchors.
- Discover headings from authored Markdown semantics, not from the number or tag names of SV DOM
  children. A heading-looking line inside backtick or tilde fences—including Markmap and D2
  Markdown-label examples—must not become a document anchor.
- Support the current single-wrapper syntax-highlighted SV DOM and nested text spans. Do not depend
  on a particular token-span layout or require one DOM element per Markdown block.
- Continue pairing only top-level rendered document headings. Headings nested inside renderer DOM,
  SVG, `foreignObject`, callouts, or other generated content are not document anchors.
- Keep the current source-to-Preview direction and animation-frame ordering. Do not introduce a
  reverse Preview-to-source owner or a scroll feedback loop.
- Preserve exact Markdown bytes, the current caret/selection, undo history, edit/save behavior,
  split Preview rendering, mode-switch scroll restoration, and Task 188's large-file SV behavior.
- Retain a safe fallback for documents whose authoritative heading lists genuinely cannot pair,
  but do not silently exercise that fallback for a valid document such as `all-renderers.md`.
- Add no setting, command, host protocol, authored DOM wrapper, or vendored Vditor/Lute patch.

## 3. Implementation constraints.

Expected implementation surface:

- `media-src/src/nav/split-scroll-sync.ts` — replace direct-child source heading discovery and keep
  read-before-write scroll ordering;
- `media-src/src/nav/split-scroll-sync.test.ts` — focused pure/jsdom coverage for fence-aware
  source heading positions, DOM-range mapping, and cache invalidation;
- `media-src/e2e/split-scroll-harness.ts` and `media-src/e2e/split-scroll.spec.ts` — make the
  Chromium fixture and assertions distinguish heading anchoring from proportional movement; and
- `test/vscode-e2e/sv-split.spec.ts` — add the real `all-renderers.md` centered-section assertion
  inside the existing single VS Code boot.

Reuse `ATX_HEADING` and `createFenceTracker` from `src/shared/md-scan.ts`, or extend an existing
shared heading scanner without duplicating its fence rules. Source anchors must carry positions
that can be resolved into the current `.vditor-sv` text-node tree with `Range` geometry. Do not use
heading display text as the pairing identity when document order already supplies the stable 1:1
mapping; duplicate heading text is valid Markdown.

Do not call `vditor.getValue()`, serialize Markdown, or rebuild a whole-document anchor map on every
raw scroll event. Anchor discovery may be cached and invalidated by SV content/DOM changes, or
rebuilt lazily at most once for a coalesced animation-frame update. Geometry reads for both panes
must complete before the Preview `scrollTop` write. Preserve the current listener's mode-switch
survival and idempotent one-time installation.

If implementation reveals that source `textContent` and the authoritative Markdown offsets differ
for a supported construct, add a narrow, tested mapping rule rather than mutating the SV DOM or
falling back to heading-text search without fence awareness.

## 4. Test-first acceptance.

> **For implementation agents:** use `superpowers:test-driven-development` before production
> changes, `superpowers:systematic-debugging` for unexpected behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-testing` and `vmde-visual-debugging` skills.

### 4.1. Unit coverage.

Write RED tests before changing production code. Cover:

- the current one-wrapper SV shape with headings split across nested syntax spans;
- multiple direct source blocks as a compatibility shape, without depending on that shape;
- backtick and tilde fences containing `#` lines, including list-indented fences;
- duplicate heading text and mixed H1-H6 levels paired strictly by document order;
- CRLF and a terminal newline without offset drift;
- missing/unresolvable DOM positions fail safely rather than producing a wrong anchor;
- cached/lazy anchor invalidation after an SV edit or DOM replacement; and
- the existing interpolation, mismatch fallback, clamping, top, bottom, and between-heading
  behavior in `test/backend/heading-align.test.ts` remains green.

Inspect changed-line coverage for every new scanner, DOM-position, invalidation, and fallback
branch.

### 4.2. Chromium regression.

Strengthen the existing split-scroll harness so proportional synchronization cannot pass by
accident. Include uneven source/rendered geometry—for example, a run of link-reference definitions
that occupies source height but renders no Preview block—between otherwise ordinary headings.

The focused spec must:

- prove the harness exposes the current one-wrapper `.vditor-sv` shape;
- center at least one middle source heading and assert the matching rendered heading identity and
  center offset;
- repeat across another heading segment and near the document end;
- prove fenced heading-looking lines are excluded from the pair count;
- prove scroll-back-to-top and bottom clamping remain stable; and
- fail on the pre-fix implementation even though the old "Preview moved" assertions pass.

Use DOM geometry and heading identity assertions, not screenshots or scrollTop-only assertions.

### 4.3. Real-VS-Code acceptance.

Extend the existing single-test `test/vscode-e2e/sv-split.spec.ts`; do not add another expensive VS
Code boot solely for this behavior. Use the unchanged tracked `all-renderers.md` fixture.

After all asynchronous renderer geometry has quiesced:

1. center the literal source heading `## 12. WaveDrom — timing diagrams` through its live DOM text
   range;
2. wait for Task 48's animation-frame write;
3. assert the rendered center heading is the same WaveDrom heading, not Graphviz or another
   proportional neighbor;
4. assert the source and rendered heading center offsets agree within a documented numeric
   tolerance; and
5. continue the existing morph, mode-report, and return-to-IR assertions to prove the stronger
   synchronization check does not weaken Task 187 coverage.

The fixture contains multiple asynchronous diagram engines, so a documented geometry-quiescence
wait is valid here; a first-true element-presence poll must not create a transient-plateau false
pass. Run the final focused real-VS-Code candidate with `--retries=0`.

## 5. Completion and verification.

Use current `DEVELOPMENT.md` as command authority. Avoid duplicating unchanged broad suites: run
focused RED/GREEN checks during implementation, then one final aggregate quality gate.

```bash
npx vitest run --config test/vitest.config.ts \
  test/backend/heading-align.test.ts \
  media-src/src/nav/split-scroll-sync.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
xvfb-run -a npm --prefix media-src run test:e2e -- split-scroll.spec.ts
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- sv-split.spec.ts --retries=0
npm run quality
git diff --check
```

- [ ] The current one-wrapper SV DOM produces a complete, fence-aware source heading anchor list.
- [ ] Centered headings and interpolated segments align source and Preview without proportional
      drift.
- [ ] Chromium semantic assertions fail on the pre-fix implementation and pass after the repair.
- [ ] Real VS Code centers WaveDrom with WaveDrom in `all-renderers.md` on a no-retry run.
- [ ] Source bytes, caret/selection, undo/edit/save behavior, renderer DOM, and mode-switch scroll
      preservation remain unchanged.
- [ ] Changed-line coverage, typechecks, build, bundle/startup budgets, focused Chromium,
      real-VS-Code acceptance, quality, and diff checks pass with retries/residuals recorded
      honestly.
- [ ] The final diff excludes generated artifacts, `LOCAL_AGENT_TASK.md`, and unrelated user work.
- [ ] Only after every acceptance item is complete: mark this task done, move it to `tasks/done/`,
      add its completed entry to `tasks/README.md`, and create focused local implementation
      commit(s). Do not push.

## 6. Out of scope.

- Reverting or pinning Vditor/Lute, or bisecting Task 518 solely for historical attribution.
- Reverse Preview-to-source scrolling, bidirectional loop ownership, or synchronized caret
  placement.
- Setext-heading support, rendered-block-by-block alignment, or semantic anchors other than the ATX
  heading contract Task 48 already established.
- Changes to outline highlighting, section hoisting, Preview-only scroll preservation, or native
  VS Code editor groups.
- A broad source-map subsystem, Vditor fork, vendored patch, or unrelated split-view polish.
