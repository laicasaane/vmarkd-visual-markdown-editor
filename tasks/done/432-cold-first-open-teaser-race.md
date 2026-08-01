# Task 432 — Does the FIRST open of a session get no instant-paint teaser at all? (prewarm race)

**Status:** ✅ **DONE (2026-07-29) — probe ran, finding NOT confirmed. Closed as checked-and-fine, no fix.** ·
**Impact:** ⚪ nil — the race does not bite ·
**Origin:** Opus open-path analysis, 2026-07-29 (finding 1)

## Result — measured, negative

`prerender-first-open.spec.ts` opens two documents in one VS Code session and reads
`window.__vmarkdHadTeaser` (recorded in `main.ts` at module-eval time, while the teaser still exists —
`after()` removes it within ~150 ms, so a later DOM query cannot tell "never emitted" from "already
swapped"). Measured: **`first-open=true second-open=true`** — the first document of a session DOES get
its instant-paint teaser.

Why the race doesn't happen: `activationEvents` includes `onCustomEditor:vmarkd.editor`, so VS Code
activates the extension and *then* resolves the custom editor, and that hop gives the
`setTimeout(0)`-deferred `loadLute` its turn before the first document's HTML is built. The spec
deliberately does NOT pre-`activate()` (that would hand over the same turn and answer a different
question) — it goes straight to `vscode.openWith`, which is the tightest ordering available here.

**Kept as a standing net**, not deleted: the flag and the spec are cheap, and the failure mode they
guard against is invisible in the UI (you get a slower open, not a broken one). If someone ever moves
prewarm, changes the activation events, or makes `loadLute` slower, this goes red.

⚠️ Honest limit: this measures the harness's activation→resolve ordering, which is the same code path
but not literally a user's cold VS Code window restoring a `.md` tab from a previous session. If the
symptom is ever reported for real, re-open with that scenario.

## Problem

`prewarmLute` defers `loadLute` via `setTimeout(…, 0)` (`src/lute-host.ts:113-116`). `loadLute`
(`:73-109`) is a **synchronous** `vm.runInContext` of the 3.8 MB GopherJS Lute blob, ~150–250 ms of host CPU,
cached in a module-level singleton (`:60-68`). If it has not completed by the time the first document's HTML
is built, `renderForMode` returns `undefined` immediately (`:203-206`) → `buildPrerenderOverlay` returns
all-empty strings (`src/html-builder.ts:123-125`) → **no `#vmarkd-prerender` in the HTML at all.**

Both `activate()` (`src/extension.ts:38`, prewarm at `:46`) and the first `resolveCustomTextEditor`
(`src/markdown-editor-provider.ts:121`) are driven by the same user action — opening VS Code on a markdown
file, or opening the first `.md` of a session. So the instant-paint mechanism that exists specifically to mask
a slow open may be racing the very cold start it is meant to cover, leaving the ~670 ms cold webview-side Lute
cost (task [42](42-rendering-profiling-harness.md), measured) **fully unmasked exactly once per session** — on
the worst-experienced open there is.

**This is inference from reading the code.** Whether VS Code's activation→resolve sequencing lets a
`setTimeout(0)` land in between is an empirical question about VS Code's own event loop, not answerable from
this repo's source. Opus flagged it as unverified; so does this task.

## Probe (done)

- [x] Real-VS-Code spec: assert whether `#vmarkd-prerender` is present in the webview HTML on the **very first**
      custom-editor open in a fresh window, and again on the **second** file's open. Presence on both ⇒ close
      this task as checked-and-fine (a useful negative result — record it, don't manufacture a fix).
- [x] If absent on the first open, also record what the user actually sees in that window (blank editor area vs.
      VS Code's own loading state) — that determines whether this is a real perceived regression or cosmetic.

## Fix shape, if this is ever re-opened (NOT applied — the probe came back negative)

Run `loadLute` **synchronously** the moment `resolveCustomTextEditor` fires for the *first* document, before
building its HTML — trading a few hundred ms of host CPU (which the user is already waiting through) for a
teaser that works on file #1 too.

⚠️ **Must stay scoped to the "prewarm apparently hasn't landed yet" case.** Task 42 already measured that
pulling Lute work into the open path as a general policy is a **net loss** for `open.total` (its rejected
preload prototype: `init.construct` 230→130 ms, `open.total` 806→796 ms, i.e. noise). Do not turn this into
un-prewarming.

## Also surfaced by the same analysis (minor, not this task's subject)

- **`document.getText()` is called 3× in `EditorSession.start()`** — `:334` (via `writeback.setCleanBaseline`),
  `:364`, `:424`. Three full-document string materializations per open. Not measured; noted for completeness,
  not worth its own task unless a large-doc profile says otherwise.
- **Unverified:** whether `WikiSession.buildInitPayload` (`src/editor-session.ts:103`) does meaningful async
  work for a **non-wiki** file on every open. `wiki-session.ts` was not read. If it is non-trivial, that is
  real per-open cost paid when the wiki feature is unused.

## Settled by the same analysis — do not re-open

The **shared single webview** lever (task 42's own named idea) was re-examined and the verdict is
**do not pursue**, with a stronger argument than before: `CustomTextEditorProvider` hands one `WebviewPanel`
per tab and Lute's cost is per **webview realm**, so two markdown tabs in a split cannot share a realm without
abandoning that provider model entirely — an editor-architecture change fighting VS Code's tab/split model,
not merely a per-doc-state refactor (though that is real too: `webview.options` is per-document at
`editor-session.ts:378-381`, and `baseHref` binds relative-image resolution to the document's own path at
`markdown-editor-provider.ts:175-177`). And the payoff after file #1 is only the residual ~80–130 ms
V8-code-cached construct, since the code cache already amortises the rest.
