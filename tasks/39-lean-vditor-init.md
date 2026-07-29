# Task: Lean Vditor init (gate features/renderers on content)

> **Source:** vMark performance audit (open latency — medium)
> **Value / Risk:** 🟧 MED open latency / medium
> **Engines:** none
>
> **Status (2026-07-28): ✅ DONE — resolved as "no init trim to make", plus the one durable
> deliverable (step 2's regression net).** The premise decayed: the *measurement* this task was
> waiting on had already been taken by [task 42](42-rendering-profiling-harness.md) (2026-05-30),
> which explicitly refutes the content-gating hypothesis, and steps 1/5 turned out to be already
> satisfied by the current code. Per-step resolution below. **Step 4 (toolbar trim) is the one item
> NOT closed unilaterally** — see its entry; it is a user-visible product decision, not a perf one.
>
> Note: `initVditor` moved out of `main.ts` — it now lives in `media-src/src/vditor-init.ts`
> (task 399 split), and the option mapping is `media-src/src/vditor-options.ts`.

## Per-step resolution (2026-07-28)

1. **Disable unused real-flag features — ⚪ already at defaults, no change.** Read against
   `vditor/src/ts/util/Options.ts` `defaultOptions`: `comment.enable` and `resize.enable` are
   **already `false` by default** (we never enable them), `counter` is explicitly `{enable:false}`
   in `vditor-init.ts` with its reason in a comment, and `outline`/`hljs` are **config-derived**
   (`showOutlineByDefault`, `codeBlockLineNumbers`, `codeTheme`) — not dead weight that can be
   switched off. The only remaining flag, `preview.render.media.enable` (default true), is
   render-time (media/embed link rewriting during a preview render), not init-time, and it is a
   feature we want. Nothing to trim here.
2. **Confirm the math engine + local cdn — ✅ VERIFIED, and pinned by a new e2e.**
   `test/vscode-e2e/local-assets-only.spec.ts` opens `all-renderers.md` in real VS Code, lets every
   engine render, then reads Resource Timing in the webview frame. Measured 2026-07-28:
   `cdn=https://file+.vscode-resource.vscode-cdn.net/…/media/vditor`, **38 local resources, 12 of
   them renderer assets, 0 remote, 0 MathJax**. It also asserts the two paths Vditor re-derives from
   `Constants.CDN` (`https://unpkg.com/vditor@…`) — `hint.emojiPath` and `preview.theme.path` — are
   rewritten to our base. MathJax is additionally impossible by construction: `build.mjs` deletes
   the `js/mathjax` asset dir (task 40).
   **RED-checked** (twice — the first check was invalid and the spec was changed because of it):
   with `cdn: this.vditorBaseUri` dropped from both init payloads in `editor-session.ts`, the first
   version failed on a 90 s locator timeout *before* reaching the probe, i.e. the config-path
   assertions had never actually been exercised. The hard `waitFor` on the mermaid SVG is now
   non-fatal, and the re-run fails where it should: `cdn=https://unpkg.com/vditor@3.11.2` with
   `local=1, renderer=0, remote=8`. That also settles the CSP question — **blocked remote requests
   DO produce Resource Timing entries**, so the "0 remote" assertion binds too rather than being
   tautological. Not added to the smoke/fast tiers — full-suite only, ~15 s.
   No product code changed by this task, so there is nothing new to unit-test or to move the
   coverage ratchet; the e2e is the whole deliverable.
3. **Content-aware init — ❌ REFUTED by prior measurement, do not build.** Task 42's benchmark
   already settled it: renderers are lazy (loaded at render time, after `after()`), warm construct
   is **4–17 ms regardless of doc size or content type** (math/code/tables ≈ 11–17 ms), and the
   whole open cost is the one-time Lute load (~670 ms first file per session, ~80–130 ms after,
   V8 code cache). Task 42 names this task explicitly: *"Task 39 (gate renderers on content) will
   NOT help init."* There is no init-time preview-pipeline cost left to gate.
4. **Trim the default toolbar — ⚪ CLOSED, no change (user decision, 2026-07-28).** The toolbar is already a
   hand-curated custom list (`media-src/src/toolbar.ts` `createToolbar` — Vditor's `record`,
   `fullscreen`, `both`, `code-theme`, `content-theme`, `export`, `devtools` and the `more` group
   are all already gone), it is built **synchronously on purpose** (the instant-paint overlay clones
   it — `showRealToolbarInOverlay`), and task 42 measured toolbar presence at **±4 ms**. So there is
   no perf case left; any further trim is a pure UX call that belongs with
   [task 09](09-toolbar-show-setting.md) (which already ships a whole-toolbar on/off setting).
   Put to the user with that measurement — decision: **leave the toolbar as it is**.
5. **`customWysiwygToolbar` — ✅ RESOLVED: keep.** No longer a bare 3.11 workaround: it now carries
   the callout TYPE picker in the blockquote popover (`calloutWysiwygToolbar`, task 179) *and*
   still guards the 3.11.x init crash. Both reasons are in the call-site comment. Do not remove.

## Original plan (kept for the record)

## Problem
`initVditor` (`media-src/src/main.ts`) constructs Vditor with the full toolbar and
default preview features every time, regardless of what the document actually contains.
Heavy renderers (Mermaid, KaTeX/MathJax, ECharts, abc.js, Graphviz) are lazy-loaded by
Vditor on demand, but init still wires the preview pipeline and toolbar unconditionally.
There is also a defensive `customWysiwygToolbar: () => {}` hook (a Vditor 3.11 init
workaround) worth revisiting.

## Goal
Do the minimum work at init for the common case (plain prose), defer the rest.

> **Background (Vditor 3.11 source):** the heavy diagram/math renderers are
> **alias-gated, not flag-gated** — there are no per-renderer enable/disable options for
> Mermaid/ECharts/Graphviz/Flowchart/ABC/Mindmap/PlantUML. They load via runtime
> `addScript(${cdn}/dist/js/<lib>...)` *only* when a matching code-block alias is
> rendered. So a plain-prose file already pays none of that — the lever is "don't make
> Vditor wire/scan for them," not "disable a flag." Features that **do** have real
> flags: `outline`, `counter`, `resize`, `media`, `comment`, `hljs`.

## Steps
1. **Disable unused real-flag features at init** where they aren't needed:
   `counter`, `resize`, `media`, `comment`, and trim `outline`/`hljs` config. These are
   the only init-time toggles Vditor actually exposes.
2. **Confirm the math engine + local cdn.** No `preview.math.engine` is set, so Vditor
   defaults to KaTeX. Open the webview Network tab and confirm on a math/diagram file:
   (a) **MathJax (6.5 MB) is never fetched** (feeds the VSIX trim in
   `24-ci-cd-pipeline.md`), and (b) renderer scripts load from the **local
   `asWebviewUri` cdn base** (`vditorBaseUri`), **never from `unpkg.com`** — a wrong
   `cdn` override silently adds network latency.
3. **Content-aware init (optional, smaller win):** since renderers are alias-gated,
   the main remaining cost is Vditor's preview pipeline setup. Measure whether skipping
   math/preview config for files with no `$`/diagram blocks meaningfully speeds init
   before investing — it may be marginal.
4. **Trim the default toolbar** to essentials; lazy-add advanced groups. Coordinate with
   `09-toolbar-show-setting.md`.
5. Re-evaluate the `customWysiwygToolbar: () => {}` workaround against current Vditor;
   remove if no longer needed.

> Note: `cache: { enable: false }` is already set in `initVditor` (correct — with
> caching on, Vditor *requires* a `cache.id` or it throws). No change needed there.

## Measure
`console.time` around `initVditor` for (a) a plain prose file vs (b) a file with math +
a Mermaid block; confirm the plain case is materially faster and loads no renderer JS
(Network tab in webview devtools shows no katex/mermaid fetch).

## See also
- `24-ci-cd-pipeline.md` — the MathJax-unused finding gates a VSIX size cut.
- `20-tree-shake-vditor-source-import.md` — bundle is 94 % Vditor; source import needed
  for any core trim.
- `09-toolbar-show-setting.md` — toolbar configurability.

## Verify
Opening a plain markdown file runs no math/diagram renderer fetches and inits faster;
math/diagram documents still render correctly when those blocks are present.
