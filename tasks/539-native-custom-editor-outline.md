# Task 539 — Feed VMDE headings to VS Code's native Outline

**Status:** planned (platform-gated) · **Impact:** 🟡 medium-high navigation/VS Code integration ·
**Origin:** Project Owner request and expected-outcome screenshots, 2026-08-31

## Goal

When a Markdown document is active in the VMDE custom editor, populate VS Code's built-in **Outline**
view with that document's heading hierarchy. Once the native integration is proven end to end,
retire the separate **Markdown Outline** TreeView contributed to Explorer.

The expected result is the same Outline surface users already get with VS Code's Text Editor, while
the active editor remains VMDE. Selecting an Outline entry must navigate the existing VMDE webview;
it must not reopen or switch the document to Text Editor.

## Confirmed platform constraint

Task 78 added the separate TreeView because VS Code did not ask a `DocumentSymbolProvider` for an
active custom editor. That remains true at task-definition time:

- [microsoft/vscode#97095](https://github.com/microsoft/vscode/issues/97095) is closed as not planned;
- [microsoft/vscode#304909](https://github.com/microsoft/vscode/pull/304909), the attempted custom-
  editor outline support, is also closed; and
- current VS Code mainline's
  [`DocumentSymbolsOutlineCreator`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/codeEditor/browser/outline/documentSymbolsOutline.ts)
  matches code and diff editor controls, not custom-editor webviews.

Registering another Markdown `DocumentSymbolProvider` therefore does not by itself feed the native
Outline while VMDE is active. The implementation is gated on a stable, Marketplace-usable VS Code
API or stable built-in behavior that closes all of the integration requirements below.

## Product contract

- Use VS Code's built-in Outline view. Do not rename, restyle, or relocate a VMDE-owned TreeView to
  imitate it.
- Keep the document open in `vmde.editor` while the native Outline is populated and while navigating.
- Show the same heading hierarchy and source order that VS Code's Markdown language features expose,
  including ATX and Setext headings and excluding heading-like text inside fenced code.
- Selecting an entry scrolls and flashes the corresponding rendered VMDE heading through the existing
  `scroll-to-heading` path. It must not create a source-editor tab, change editor association, steal
  focus permanently, or mutate the selection or document.
- Heading add, rename, level change, reorder, and removal refresh the native Outline after the
  authoritative `TextDocument` changes. Stale asynchronous results must never overwrite a newer
  document revision, active URI, or panel.
- Support `.md`, `.markdown`, file and untitled documents, tab switches, split VMDE editors, reopen,
  and one document shown in multiple VMDE panels.
- Preserve exact Markdown, undo/redo, dirty state, save/reopen, caret, scroll, and editor mode.
- Preserve the in-editor Vditor outline. “Retire the separate Markdown Outline” refers only to the
  Explorer TreeView named **Markdown Outline**.
- Use only stable extension APIs available to normal VS Code Marketplace extensions. Do not ship an
  Insiders-only proposal, import workbench internals, monkey-patch VS Code, require `--enable-proposed-api`,
  or maintain a VS Code fork.
- Do not add a compatibility TreeView, legacy setting alias, dual provider, or fallback view after
  native integration ships. This is a clean replacement.

Native Outline behaviors that VS Code supplies automatically—filtering, sorting, collapse state,
icons, keyboard navigation, and accessibility—remain owned by VS Code. VMDE v1 does not add a second
caret/viewport-to-active-row tracker unless the eventual stable API requires one for basic outline
operation; Task 290 separately owns VMDE's caret heading breadcrumb.

## 1. Hard platform gate

Before editing production code, probe both the repository's supported VS Code engine floor and the
current stable VS Code release available when implementation begins. Record the exact versions and
evidence in this task.

The gate passes only if a stable API or stable built-in path can prove all of the following in a
minimal disposable extension fixture:

1. With a custom text editor active, the built-in Outline requests and displays extension-supplied
   outline data for that custom editor's `TextDocument`.
2. The integration exposes a supported invalidation mechanism so document edits update Outline
   without closing or reopening the custom editor.
3. Selecting and previewing an Outline item can be handled by the custom editor so VMDE can reveal
   its webview heading instead of VS Code opening the resource in a code editor.
4. The API can be declared under `engines.vscode` and used by an ordinary packaged Marketplace
   extension without proposed-API flags or product allowlisting.
5. The behavior works in the repository's real-VS-Code Playwright harness, not only in TypeScript
   declarations, source inspection, or a browser harness.

If any condition fails:

- stop before production changes;
- keep `vmde.outline`, `vmde.outline.tree`, and the current Explorer TreeView functional;
- mark this task blocked with the tested versions, commands, observed behavior, and upstream issue or
  proposal that owns the gap; and
- do not substitute a native-looking custom view or remove working navigation.

A future stable API may require raising `engines.vscode` and `@types/vscode`. If so, record the exact
first stable version and make that bump part of this task; do not raise the floor speculatively.

## 2. Native outline architecture after the gate passes

### 2.1. Symbol source and identity

Add a focused host module, expected at `src/markdown/native-outline.ts`, that adapts the eventual
stable custom-editor outline contract without owning Markdown parsing.

- Obtain symbols from VS Code's Markdown language features through the supported document-symbol
  execution/provider path exposed by the passing platform probe.
- Normalize hierarchical `DocumentSymbol[]` into one nested, source-ordered heading tree. Sort siblings
  by selection-range start and validate that child ranges remain inside their parents. Preserve symbol
  names, levels/kinds, full ranges, and selection ranges supplied by VS Code. If the stable path
  exposes only flat `SymbolInformation[]` without enough range/level metadata to reconstruct the exact
  Markdown hierarchy deterministically, the platform gate fails; do not guess from duplicate-prone
  `containerName` strings.
- Flatten the normalized headings in source order once per accepted result and assign each item its
  rendered-heading ordinal. That ordinal is the existing `scroll-to-heading` identity and naturally
  covers both ATX and Setext headings returned by the native Markdown provider.
- Key cached/active state by document URI plus document version. Cancel or generation-reject work
  after edits, URI/panel switches, provider disposal, or extension deactivation.
- Do not call `document.getText()` or serialize the webview merely to decide whether an ordinary edit
  needs a refresh. Rely on the native provider and its invalidation contract; debounce/coalesce only
  the host notifications that the passing probe shows can arrive in bursts.

If VS Code returns no Markdown provider result, expose an empty native outline and allow the next
provider/document invalidation to retry. Report unexpected provider failures through the existing
host logging path without closing the editor or retaining stale rows.

### 2.2. Reveal routing

Each native outline item must retain the target document URI and rendered-heading ordinal. On native
selection/reveal:

1. Resolve the active or matching VMDE panel through the existing panel registry.
2. Post `{ command: 'scroll-to-heading', index }` to that panel.
3. Reveal the already-open VMDE panel only when the stable API requires it, preserving its column and
   focus semantics.
4. Never call `showTextDocument`, `vscode.openWith` for Text Editor, or synthesize a text selection as
   the native path's fallback.

Retain `src/shared/protocol.ts`, `media-src/src/bridge/message-router.ts`, and
`media-src/src/nav/outline.ts` for `scroll-to-heading`: same-document/cross-document anchors and other
navigation consumers use the same protocol independently of the retired TreeView.

### 2.3. Lifecycle composition

Register the native custom-editor outline integration from `src/app/extension.ts` and dispose it with
the extension context. Coordinate with `MarkdownEditorProvider`/`EditorSession` only through a small
URI/panel/revision interface; do not move Markdown parsing or VS Code API ownership into the webview.

The integration must follow the active custom editor across initial resolve, view-state changes, tab
switches, split panels, document edits, rename/reopen, and disposal. Multiple panels for one URI share
document-symbol results while reveal targets the correct active/matching panel.

## 3. Retire the Explorer Markdown Outline atomically

Only after the focused real-VS-Code native acceptance is green, remove the old path in the same
implementation candidate:

- delete `src/markdown/outline-tree.ts` and `test/backend/outline-tree.test.ts`;
- remove `MarkdownOutlineProvider`, its debounce/listeners, `setContext('vmde.hasOutline', ...)`, and
  `registerTreeDataProvider` wiring from `src/app/extension.ts`;
- remove `setOutlineRefresher`/`refreshOutline` and their tests from
  `src/platform/host-session-state.ts` and the `EditorSession` start/view-state calls;
- remove `vmde.outlineReveal` and the `HeadingItem` dependency from `src/app/commands.ts`;
- remove `OutlineViewId` and its identity assertion;
- remove the `views.explorer` contribution for `vmde.outline` and the `vmde.outline.tree` setting from
  `package.json`;
- remove obsolete TreeView gate/manifest tests while adding explicit negative assertions that the
  view, context key, command, and setting are absent; and
- update `README.md`, `CHANGELOG.md`, `docs/adr/0008-module-decomposition.md`, Task 290's obsolete
  platform claim, and Task 78's historical record to point to Task 539's superseding native path.

Do not delete shared Markdown scanners or heading navigation helpers merely because the old provider
used them; confirm all remaining consumers first. Do not change Task 536's in-webview ToC/outline
invalidation or Task 517/521's Vditor outline viewport projection.

`tasks/README.md` remains unchanged while this task is planned or blocked. Move this file under
`tasks/done/` and update the index only after implementation and all required evidence are complete.

## 4. Test-first implementation sequence

> **For agentic workers:** Use `superpowers:test-driven-development` before production changes,
> `superpowers:systematic-debugging` for unexpected platform or test behavior, and
> `superpowers:verification-before-completion` before commits or completion claims. Apply the
> repository's `vmde-testing` skill and use `DEVELOPMENT.md` as the command authority.

### 4.1. Disposable platform probe

Create the smallest fixture needed under `test/vscode-e2e/` or a temporary ignored directory. It must
activate a custom text editor, provide two nested headings to native Outline, update one label, and
record which callback runs when the child row is selected. Run it against the engine floor and
current stable VS Code with `workers: 1` and no retries.

The probe is evidence, not production code. Delete throwaway files after recording the result unless
they become the first failing acceptance test for a passing stable API.

### 4.2. Host unit coverage

Create `test/backend/native-outline.test.ts` for the adapter/lifecycle seam. Write failing tests for:

- nested and skipped-level `DocumentSymbol` trees normalized in source order;
- deterministic rejection of a flat `SymbolInformation` result when it lacks the hierarchy/level
  metadata required by the product contract;
- ATX and Setext items receiving the correct rendered-heading ordinals without reparsing text;
- empty provider results and provider rejection;
- edit bursts coalescing into the supported native invalidation mechanism;
- stale version, URI, cancellation, panel replacement, and disposal results being ignored;
- one document shared by multiple panels without duplicated symbol acquisition; and
- native selection posting exactly one `scroll-to-heading` message to the correct panel without a
  Text Editor/open command.

Extend activation, manifest, configuration, product-identity, host-session-state, and command tests
for the new registration and complete removal of the old view/setting/context/command lifecycle.
Inspect changed-line coverage for every new branch.

### 4.3. Focused real-VS-Code acceptance

Add `test/vscode-e2e/native-outline.spec.ts` with a sanitized fixture containing nested ATX headings,
a Setext heading, a fenced `# not a heading`, duplicate labels, and enough prose to require scrolling.
Keep compatible checks in one VS Code boot:

1. Open the fixture directly in `vmde.editor` and assert the editor picker still identifies VMDE.
2. Open/focus VS Code's built-in Outline and prove it does not show “The active editor cannot provide
   outline information.”
3. Assert the exact nested heading rows, source order, Setext inclusion, fence exclusion, and duplicate
   heading preservation.
4. Select a deeply nested row and prove the existing VMDE iframe scrolls/flashes the corresponding
   rendered heading while the active editor remains VMDE and no Text Editor tab appears.
5. Rename and change the level of one heading, add one heading, and remove another through real VMDE
   edits; assert native Outline converges to the new hierarchy without stale rows.
6. Exercise tab switching, a split VMDE view, and an untitled Markdown document, proving each active
   pane owns the correct outline and reveal target.
7. Save, close, reopen, and assert exact extension-host, webview, and on-disk Markdown bytes plus
   preserved undo/caret/editor-mode behavior.
8. Assert the Explorer contributes no **Markdown Outline** view and Settings contains no
   `vmde.outline.tree` entry, while VMDE's in-editor Vditor outline still opens and navigates.

Use semantic workbench/ARIA locators and exact condition polling. Screenshots may aid diagnosis but
are not the acceptance oracle. Run `node build.mjs` first and use
`env -u ELECTRON_RUN_AS_NODE xvfb-run -a` with `workers: 1` and final `--retries=0` evidence.

No Chromium spec is required for this task: a browser harness cannot host VS Code's built-in Outline,
and the existing webview `scroll-to-heading` behavior is retained rather than changed. If
implementation changes that webview handler, add focused unit and Chromium coverage for the changed
branch instead of relying only on real VS Code.

## 5. Verification and closure

Use the exact current commands from `DEVELOPMENT.md`. At minimum, after source/build inputs stabilize:

```bash
npx vitest run --config test/vitest.config.ts \
  test/backend/native-outline.test.ts \
  test/backend/extension.test.ts \
  test/backend/host-session-state.test.ts \
  test/backend/manifest.test.ts \
  test/backend/product-identity.test.ts
COLUMNS=2000 npx vitest run --config test/vitest.config.ts --coverage \
  --coverage.include='src/markdown/native-outline.ts' --coverage.reporter=text \
  test/backend/native-outline.test.ts
node build.mjs
npm run check:bundle-size
npm run check:startup-cost
npm run typecheck
npm run typecheck:strict
npm run typecheck:vscode-e2e
env -u ELECTRON_RUN_AS_NODE xvfb-run -a \
  npm --prefix test/vscode-e2e test -- native-outline.spec.ts --retries=0
npm run quality
git diff --check
```

Adjust only filenames or command syntax that `DEVELOPMENT.md` has authoritatively changed by
implementation time. Do not duplicate a final passing `npm run quality` with its constituent broad
gates, and do not run unrelated full Chromium or full real-VS-Code suites unless changed shared code
or a live task requirement makes them necessary.

Before the implementation commit, inspect the complete diff and staged paths. Exclude generated
artifacts, temporary probe files, private documents, unrelated working-tree changes, and
`LOCAL_AGENT_TASK.md`. Create one focused local commit and do not push.

## Out of scope

- Replacing or redesigning VMDE's in-editor Vditor outline.
- Implementing Task 290's sticky caret breadcrumb or mirroring viewport section highlights into the
  native Outline.
- Rewriting VS Code, depending on private workbench modules, or publishing an Insiders-only build.
- Introducing a VMDE Markdown parser/AST solely for Outline when VS Code's Markdown symbols are the
  requested native authority.
- Reworking heading slug semantics, anchor-link routing, embedded `[toc]`, Task 536 invalidation, or
  unrelated navigation commands.

## Completion checklist

- [ ] A stable Marketplace-usable custom-editor Outline path passes every hard-gate condition on the
      supported engine floor and current stable VS Code.
- [ ] Native Outline shows and live-refreshes the correct Markdown heading hierarchy while VMDE stays
      active.
- [ ] Native selection scrolls/flashes the correct VMDE heading without opening Text Editor.
- [ ] File/untitled, `.md`/`.markdown`, tabs, splits, multiple panels, edits, save/reopen, undo, caret,
      mode, and exact bytes are covered.
- [ ] The Explorer **Markdown Outline** view, setting, context key, identity, provider, command, and
      refresh lifecycle are removed with no compatibility fallback.
- [ ] The in-editor Vditor outline and shared heading/anchor navigation remain functional.
- [ ] Focused unit coverage, build/budgets, typechecks, no-retry real-VS-Code acceptance, final quality,
      and diff/staged-path inspection pass.
- [ ] The task record contains exact platform versions, commands, outcomes, retries, and residuals;
      it is moved to `tasks/done/`, indexed, and locally committed without a push.
