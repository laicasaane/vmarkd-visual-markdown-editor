# Task 470 — SOLID/KISS review residue (from the retired 2026-06-02 review doc)

**Status:** 📋 OPEN — four small, independent, low-priority readability notes · **Impact:** 🟢
cosmetic/readability only, no behaviour change · **Origin:** `docs/code-review-solid-kiss-2026-06-02.md`
was retired as part of [task 469](469-housekeeping-sweep.md) item 2; this file rehomes the findings
that were still open at retirement time so none are lost with the doc.

## Why this exists

The review doc's two headline structural findings (the `extension.ts` and `main.ts` god-files) and
all six of its "verified bugs / quick wins" have since shipped — see "Resolved, checked at retirement"
below. What's left is its "Lower-priority notes (not actioned)" section: four items that were
explicitly deprioritized at review time. Three are still true of the code as of 2026-07-31; the fourth
(`vscode-api.ts`'s import-time side effect) turned out to be only half-fixed on closer inspection. None
is urgent; they're recorded here instead of deleted along with the doc.

## Still open

All four items below were closed out 2026-07-31.

- [x] **`vscode-api.ts` — import-time `acquireVsCodeApi()` side effect.** Fixed: `vscode-api.ts`
      now exports `initVsCodeApi()` (idempotent — a module-level `initialized` flag makes a second
      call a no-op, since `acquireVsCodeApi()` throws if actually invoked twice per webview) instead
      of running the acquisition at import time; the module itself is now side-effect-free on
      import. The call lives in `preload.ts` — the one module every real entry point (`main.ts`)
      and every e2e harness already `import`s first (it already carries the same shape of
      bootstrap side effect for `patchLuteGapRepair`, task 370), rather than at each entry point
      individually: a first pass had `main.ts` + 6 harness files each call `initVsCodeApi()`
      separately, which a multi-angle review flagged as the same "every future author has to
      remember a step nothing checks" problem in a new shape — folding it into the existing shared
      bootstrap slot removes all 7 repeated call sites (and the comment-drift across them) in favour
      of one. The payoff materialized: `raw-href.ts`'s avoidance comment was genuinely stale
      (importing `vscode-api.ts` is no longer unsafe under the plain-`node` vitest env, only
      unnecessary for a module with no host dependency) and has been rewritten to say so;
      `link-click.ts` / `link-open-policy.ts` needed no change (they never imported it — pure
      logic / callback-injection design, not avoidance of a crash). Verified with a real-VS-Code
      e2e added to `test/vscode-e2e/inline-init.spec.ts`'s existing boot test (one VS Code boot, no
      new `test()`): flips `vmarkd.editor.toolbar` (an `INIT_ONLY_OPTIONS` setting) to force
      `message-router.ts`'s `handleConfigChanged` to call `initVditor()` again in the same page — a
      real second `new Vditor(...)`, the "re-initialises on the streaming path" scenario — then
      asserts `window.vscode` is the SAME object reference afterwards (belt-and-suspenders) and,
      load-bearing, that no page error mentioning `acquireVsCodeApi`/"already been acquired" was
      thrown. Passed 3/3 runs. The chromium harness suite (`link`, `mouseops`, `save-flush`,
      `incremental-md`, `wiki-click`, `wiki-hint`, `webview-behaviors` specs — 76 tests) also
      passed after the harness-entry updates, as did `webview.spec.ts` / `local-link-open.spec.ts`
      / `image-upload-wire.spec.ts` (real-VS-Code, exercise `link-click-fix`/`upload-handler`
      through the new `preload.ts` bootstrap path).
- [x] **`fix-table-ir.ts` — HTML built via a large template literal nested in a closure.** Extracted
      the ~70-line `innerHTML` template literal (was inline inside `insertTablePanel`) to a
      module-level `buildTablePanelHtml()` function; the call site is now
      `tablePanel.innerHTML = buildTablePanelHtml()`. Byte-identical markup (confirmed via `git
      diff` — the moved block shows no content changes, only relocation).
- [x] **`toolbar.ts` — inline SVG icon strings, no `icons.ts`.** Extracted all 5 inline SVG strings
      (`editInVsCodeIcon`, `wikiPagesIcon`, `backIcon`, `outlineIcon`, plus the inline
      `link`-toolbar-item icon, now named `linkIcon`) to a new `media-src/src/toolbar-icons.ts`,
      imported into `toolbar.ts`. Values unchanged.
- [x] **`custom-renderer.ts` — shared global-flag regex needs defensive `lastIndex` resets.** Proved
      the footgun was real before fixing it: temporarily removed the pre-loop `.lastIndex = 0` reset
      and reran the existing unit tests — 5 of them failed (e.g. "renders a single link as a chip"
      started returning the literal `[[Page]]` text instead of a chip), because `exec()` resumed
      from wherever the preceding `.test()` call had left `lastIndex`, silently skipping the first
      match. Root cause was broader than one call site: the SAME mutable `/g` `WikiLinkPattern`
      (`src/wiki-core.ts`) is also read/exec'd by `wiki-serialize.ts`, `lute-host.ts`, and
      `wiki-core.ts`'s own `extractWikiTargets` — a first pass fixed only `custom-renderer.ts` (by
      building a fresh `RegExp` on every call), which a multi-angle review correctly flagged as
      leaving the other 2-3 consumers exposed to the same footgun, and as a hot-path allocation
      regression (`wikiTextToHtml` runs once per Lute text token). Fixed at the source instead:
      `wiki-core.ts` now exports a `newWikiLinkPattern()` factory, and all four consumers hold
      their OWN instance created ONCE at module scope (not per call) — cross-module leakage is now
      structurally impossible (each module has a different object), leaving only the ordinary
      "reset `.lastIndex = 0` before each use" a stateful `/g` regex needs regardless, paid once at
      compile time rather than reallocated per call. `wikiTextToHtml`'s fast path was also restored
      (`!text.includes('[[')` instead of the removed `.test()` pre-check — cheaper, and doesn't
      touch `lastIndex`). Two regression tests added to `custom-renderer.test.ts`: one simulates
      another consumer leaving the shared `WikiLinkPattern` mid-match and confirms `wikiTextToHtml`
      is unaffected (now trivially true — different objects — but still a meaningful pin); one runs
      `wikiTextToHtml` three times back-to-back and checks every call renders both links.

## Resolved, checked at retirement (2026-07-31) — do NOT re-open

- **`extension.ts` god-file** — was ~1400 lines / `resolveCustomTextEditor` ~560 lines. Now 147
  lines; split into `markdown-editor-provider.ts` (241 lines) + `editor-session.ts` (679 lines) +
  `asset-link-actions.ts`, `commands.ts`, `status-bar.ts`, `html-builder.ts`, `wiki-*.ts`, etc.,
  per ADR-0005.
- **`main.ts` god-module** — was ~500 lines. Now 191 lines; split into `message-router.ts`,
  `vditor-init.ts`, `vditor-theme.ts`, `prerender-overlay.ts`, `editor-caret.ts` as proposed.
- **`lute-host.ts` `prerenderPrefix` fence guard** — fixed on the review branch itself (doc already
  said so); anchor mismatch verified gone, `prerenderPrefix` still uses one matcher for count+cut.
- **`extension.ts` upload handler fallthrough** — now `AssetLinkActions.onUpload`
  (`src/asset-link-actions.ts:56-61`): `createDirectory` failure `return`s (no fallthrough to
  `writeFile`) and logs via `this.deps.debug`, not raw `console.error`.
- **Option-key duplication** — `collectConfigOptions`-shaped helper now shared (`editor-config.ts`,
  `panel-config.ts`, `protocol.ts`, `editor-session.ts`, `vditor-options.ts`,
  `diagram-config-delta.ts` all reference the one collection point).
- **Duplicated DOM helper** — `diff-markers.findEditorElement` no longer exists anywhere in the
  tree; `diff-markers.ts` now imports and uses the shared `activeModeElement` from `source-map.ts`.
- **Mac detection duplicated across `main.ts`, `fix-table-ir.ts` (×2), `undo-keybind.ts`** —
  consolidated into `media-src/src/platform.ts`'s `isMac()`; verified zero residual inline
  `navigator.platform`/`navigator.userAgentData` copies anywhere outside `platform.ts` itself, and
  all four named call sites (plus `save-flush.ts`, `link-open-policy.ts`) import the shared helper.
- **`fontSizeCss` nested ternary** — extracted to `resolveFontSizeCss` in `src/extension.ts`.
- **Wiki-link resolution re-walking the tree per click** (from "Lower-priority notes") — `wiki.ts`
  now resolves through a shared precomputed `WikiCache` (`src/wiki-cache.ts`, `getOrBuildCache`),
  not a per-click full tree walk.

## Out of scope

Re-opening or re-litigating any of the "Resolved" items above without new evidence they regressed.

## Verification

Each "Still open" item, when picked up: fix, add/adjust a unit test if the extraction changes an
interface, run `npm run lint:ci` + `npm test`. These are cosmetic — no e2e is expected to be needed
unless the fix touches rendered DOM behaviour.
