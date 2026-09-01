# Task 542 — Restore Markdown link activation in the split-source pane

**Status:** planned · **Impact:** 🟠 medium-high navigation regression ·
**Origin:** Project Owner report plus isolated real-VS-Code investigation, 2026-09-01 ·
**Related:** Tasks 62, 359, 191 · **Blocks:** Task 541 release candidate

## Goal

Make Markdown links in split view's editable source pane follow the same configured activation
policy as links in IR, WYSIWYG, and Preview:

- with `vmde.editor.modifierClickLinks: true` (default), plain click edits/places the caret and
  Ctrl+Click on Windows/Linux or Cmd+Click on macOS opens the link;
- with `vmde.editor.modifierClickLinks: false`, plain click opens the link; and
- every accepted target reuses the existing `openLink` → `open-link` → `AssetLinkActions.onOpenLink`
  route for same-document anchors, relative/local files, `mailto:`/`tel:`, and external HTTP(S).

Do not change Markdown bytes, link syntax, source selection, or the behavior of IR, WYSIWYG,
Preview, wiki links, code references, images, footnotes, or reference-definition authoring.

## Investigation and root cause

The issue is isolated to **split view's source pane** (`.vditor-sv`), not the adjacent rendered
Preview pane.

A disposable real-VS-Code probe was run from the isolated worktree
`.worktrees/task-534-modifier-click-links-regression` against both committed `dev` (`0b1ec63`) and
the Project Owner's already-built dirty Task 534 candidate. It stubbed the host's
`vscode.env.openExternal`/`showErrorMessage` boundaries, used trusted Playwright clicks, and ran
with one worker and `--retries=0`.

Controls were green:

- IR, WYSIWYG, and full Preview each routed trusted Ctrl+Click under the default policy;
- the same three surfaces routed trusted plain click when `modifierClickLinks` was false;
- the tracked 94,711-byte `large-structured-synthetic.md` fixture routed both plain click and
  Ctrl+Click after its complexity-aware incremental seed reached `ready`; and
- the active dirty Task 534 candidate produced the same green results, so the performance work and
  incremental seed are not the cause.

The failing split-source comparison produced this shape for an inline link:

```html
<span class="vditor-sv__marker--bracket">[</span>
<span class="vditor-sv__marker--bracket" data-type="link-text">External</span>
<span class="vditor-sv__marker--bracket">]</span>
<span class="vditor-sv__marker--paren">(</span>
<span class="vditor-sv__marker--link">https://example.com/ir</span>
<span class="vditor-sv__marker--paren">)</span>
```

There is no enclosing `<a href>` and no link identity joining the flat label and destination
siblings. Ctrl+Click on the destination span had `defaultPrevented: false`, posted no `open-link`,
and never reached `vscode.env.openExternal`. Ctrl+Click on the corresponding real `<a>` in the
adjacent `.vditor-preview` reached the host immediately.

The production gap is exact:

- `media-src/src/links/link-click-fix.ts` delegates only wiki chips, code references, and real
  `a[href]` elements;
- the Vditor IR/WYSIWYG source patches in `media-src/esbuild-shared.mjs` provide their own link
  activation gates, but Vditor has no equivalent SV source click route; and
- `media-src/src/links/link-open-policy.ts` includes `.vditor-sv` in the policy scope, but that
  predicate is never reached because split-source links are spans, not anchors.

This is a historical contract/coverage hole rather than a regression introduced by the current
performance changes. Task 62 said “SV follows the same policy” but meant SV's **Preview** pane.
Task 359 explicitly measured that the SV source pane contains no anchors and skipped its click
loop. Task 191 later recorded SV link-click coverage as partial. No maintained real-VS-Code test
ever required source-pane activation, so the dead interaction survived.

The disposable probe and fixture were removed after recording this evidence; they are not the
permanent regression net required below.

## Implementation contract

### 1. Resolve a clicked SV source link without changing the DOM

Add one focused, unit-testable source-link resolver under `media-src/src/links/`. It must derive a
raw Markdown destination from the current Lute SV DOM shape without replacing spans with anchors,
injecting serialization-visible attributes, or reparsing the whole document on every pointer move.

- Accept clicks on the visible link label (`[data-type="link-text"]`) and on its destination marker
  (`.vditor-sv__marker--link`). Clicking brackets/parentheses may remain normal caret placement.
- Keep resolution inside the clicked logical link. The flat sibling layout can contain several
  links in one `data-block`; never walk into the next link or across a newline/block boundary.
- Preserve the raw destination bytes that the existing host classifier expects. Do not use a
  browser-resolved URL and do not percent-decode, normalize, or strip fragments in the webview.
- Characterize Lute's current SV DOM for inline links, angle-bracket autolinks, titled destinations,
  escaped/parenthesized destinations, reference links, image destinations, link-reference
  definitions, and footnotes before finalizing the resolver. Handle genuine Markdown links and
  reject marker lookalikes that are not activatable links. Do not use a broad Markdown regex whose
  matches can cross code, images, definitions, or sibling links.
- If reference-style links require resolving a definition elsewhere in the document, use a
  source-derived/Lute-derived mapping with explicit invalidation. Do not call a full-document
  serializer synchronously on every click and do not cache stale destinations across edits,
  external replacements, mode switches, or streamed SV rebuilds.

### 2. Route through the existing policy and opener

Extend the document-level click delegation in `link-click-fix.ts` (or a small helper composed by it)
before the generic `a[href]` branch:

1. identify a genuine link in `.vditor-sv` source;
2. apply the shared `shouldOpenLink(event)` policy;
3. when opening, call the existing `openLink(rawHref)` so fragments and host-routed targets keep
   their current security, containment, editor-choice, and error behavior; and
4. prevent default/propagation only when activation is accepted.

Under the default modifier policy, a plain click must remain a normal editable-source click with
its caret/selection behavior untouched. Do not double-post from the paired Preview pane or from
IR/WYSIWYG. Modifier detection remains Ctrl on Windows/Linux and Cmd on macOS through the existing
policy; do not add a second platform check.

### 3. Keep the behavior local and source-faithful

- Do not patch Vditor merely to turn editable source into anchors; the source DOM must remain Lute's
  syntax-highlighted, contenteditable representation.
- Do not make image destinations, footnotes, link-reference definitions, code spans/fences, or
  escaped Markdown accidentally navigable.
- Do not change `AssetLinkActions.onOpenLink`, `classifyHref`, the scheme allowlist, containment
  checks, same-document scrolling, or cross-file VMDE editor selection unless a focused red test
  proves a separate defect in that existing route.
- Preserve exact source bytes, focus, selection/caret, scroll, undo/redo, dirty/save state, source
  streaming, incremental serialization, and mode round-trips.

## Required regression coverage

### Unit

- [ ] Add a DOM-shape matrix for the pure SV resolver covering label and destination clicks, two
      links in one block, titles/escapes/parentheses, autolinks, reference links, and rejection of
      images, definitions, footnotes, code, incomplete syntax, detached nodes, and cross-link walks.
- [ ] Keep `link-open-policy` platform/policy coverage green; add only missing policy cases rather
      than duplicating its existing matrix.
- [ ] Verify raw href fidelity for local paths, percent escapes, query/fragment text, and external
      URLs.

### Chromium

- [ ] Extend `media-src/e2e/link.spec.ts`/`link-harness.ts` to cover the `sv` mode the harness type
      already advertises but its test loop currently omits.
- [ ] Use trusted clicks where possible and prove: default-policy plain click does not post;
      Ctrl+Click posts exactly once; click-policy plain click posts exactly once; label and
      destination activate the same raw href; the paired Preview link does not double-post.

### Real VS Code (mandatory)

- [ ] Add one focused `test/vscode-e2e/` spec, preferably one `test()` boot, using a real Markdown
      fixture and the actual split-view toolbar path. Establish it red on pre-fix `dev` before
      implementation.
- [ ] In the editable SV source pane, prove default-policy plain click preserves editing without a
      host open, Ctrl+Click opens an external link through a host-side `openExternal` spy, and
      click-policy plain click opens a real relative Markdown target as `vmde.editor`.
- [ ] In the same journey, prove the paired Preview link still opens exactly once and source bytes,
      caret/selection, dirty state, and saved file remain unchanged.
- [ ] Include one structurally rich or streamed-SV case if the chosen resolver keeps any
      per-document mapping/cache. Assert readiness by condition; do not add fixed settle sleeps for
      positive completion.
- [ ] Build first, run under `env -u ELECTRON_RUN_AS_NODE xvfb-run -a` with `workers: 1`, and obtain
      final focused `--retries=0` evidence.

## Acceptance criteria

- [ ] Split-source links follow `vmde.editor.modifierClickLinks` for trusted mouse input on every
      supported platform modifier.
- [ ] Both the visible label and destination of a genuine SV Markdown link resolve to the correct
      raw href and route through the existing secure opener exactly once.
- [ ] Default-policy plain click remains an editing/caret action and never opens a link.
- [ ] Inline, autolink, and reference-style cases have an explicit supported result; images,
      definitions, footnotes, code, and malformed syntax are not misclassified.
- [ ] IR, WYSIWYG, full Preview, SV Preview, wiki-link, code-reference, local-link, and anchor-link
      behavior remains green with no duplicate post or browser navigation.
- [ ] Exact Markdown, caret/selection, scroll, undo/redo, dirty/save/reopen, source streaming, and
      incremental serialization remain unchanged.
- [ ] Focused unit/changed-line coverage, Chromium, and real-VS-Code specs pass; applicable
      typechecks, build, bundle/startup budgets, and one final `npm run quality` pass are recorded.
- [ ] The task record is moved to `tasks/done/` and `tasks/README.md` is updated only after all
      acceptance and verification evidence is complete.

## Out of scope

- Changing the product's link-open policy, setting name/default, or platform modifiers.
- Adding hover previews, link popovers, middle-click/new-window semantics, command/file/vscode URI
  permissions, or broad source-editor navigation features.
- Replacing SV syntax spans with anchors, changing Lute/Vditor serialization, or refactoring the
  host link classifier without a separately reproduced defect.
