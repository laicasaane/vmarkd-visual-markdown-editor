# Task 513 — An image replaced on disk keeps showing its old bytes

**Status:** ✅ DONE (2026-08-12) — red→green proven in real VS Code. · **Impact:** 🟡 med (silent
staleness — the editor shows a picture that no longer exists on disk) · **Origin:** user report
2026-08-12 ("podmieniłem settings.png in place i render nie widział podmiany")

## What was wrong

Replacing an image file under an unchanged path (`![shot](shot.png)`, then overwrite `shot.png`)
left the OLD image on screen in the open editor. Measured in real VS Code
(`test/vscode-e2e/image-swap-refresh-probe.spec.ts`, `naturalWidth` of the same `<img>`, the two
files being 1024 px and 2780 px wide):

| state | width |
|---|---|
| before the swap | 1024 |
| 3 s idle after the swap | 1024 |
| after an edit forced the block to re-render | 1024 |
| a **brand new** `<img>` element with the same `src` | 1024 |
| same file, cache-busted URL (`?probe=…`) | **2780** |
| `fetch(url, {cache:'reload'})`, then the same URL again | **2780** |

So the staleness is **not** in our DOM: the bytes are cached by Chromium against the
`https://file+.vscode-resource…/<path>` URL, and nothing in the webview re-fetches it. Two
independent gaps produced it:

- **No invalidation signal.** The host watches the document itself (`editor-session.ts`), wiki files
  (`wiki-cache.ts`) and external CSS (`panel-config.ts`) — nothing watched the images a document
  references.
- **No cache-busting on document assets.** `CACHE_BUST` in `html-builder.ts` covers only our own
  bundles (keyed on the `main.js`/`main.css` hash); images resolve through the `<base href>` with a
  bare path.

## What shipped

- [x] `src/session/image-asset-watcher.ts` — extracts the local image paths a document references
      (markdown `![](…)` incl. the `<…>` form and titles, raw `<img src>`; skips remote/data/blob
      URLs and drops any `?query#fragment`), resolves them against the document folder, and watches
      exactly those files (cap: 100 per document). `refresh()` is a no-op while the path set is
      unchanged, so it can run on every keystroke.
- [x] `assets-changed` host→webview message (`src/shared/protocol.ts`), routed in
      `media-src/src/bridge/message-router.ts`.
- [x] `media-src/src/links/image-refresh.ts` — revalidates the matching images with
      `fetch(url, {cache:'reload'})` (allowed: `connect-src ${cspSource}` is already in the CSP),
      then makes each element re-fetch by re-setting **the same attribute value**.
- [x] Wired in `src/session/editor-session.ts`: primed at start, refreshed on every text change and
      after a rename (relative paths resolve against the document's folder), disposed with the panel.

**Why not a `?v=` on the `src`.** Lute serializes IR/WYSIWYG back to markdown from the DOM, so a
cache-busting query written into the `src` attribute could land in the saved file as
`![shot](shot.png?v=123)`. The fetch route leaves the attribute byte-identical; the e2e asserts both
the attribute and that the document stays clean.

## Verification

- [x] Unit: `test/backend/image-asset-watcher.test.ts` (10 — extraction incl. HTML/`<…>`/query
      stripping/dedup/remote-skip, resolution incl. percent-decoding and a malformed escape),
      `media-src/src/links/image-refresh.test.ts` (8 — URL→path, matching incl. the Windows drive
      case, revalidate-and-reset, fetch failure, empty input).
- [x] Real VS Code: `test/vscode-e2e/image-swap-refresh.spec.ts` — swap on disk, image repaints with
      no edit/reopen/reload, `src` attribute unchanged, document not dirty. Added to the FAST tier
      (~8 s).
- [x] **RED→GREEN**: with the router handler short-circuited the spec fails on
      `expect.poll(width).toBe(2780)` (stays 1024); restored, it passes.
- [x] Measurement kept as `test/vscode-e2e/image-swap-refresh-probe.spec.ts` (`@probe`, excluded
      from every tier) so the next reader can re-measure instead of re-deriving.

## Known limits

- Reference-style images (`![alt][ref]`) are not watched — their path lives in a link definition the
  extractor does not resolve. Same limit the asset-link actions already carry.
- A document referencing more than 100 distinct images watches the first 100.
