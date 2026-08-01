# Task 229 — Clickable code references (`src/foo.ts:123`)

**Status:** done · **Impact:** 🟡 med (dev, daily in tech docs) · **Origin:** task 192 §9

## Problem

Code references like `src/edit-sync.ts:42` — the bread and butter of design docs, reviews
and incident notes — are inert text. Devs expect click → the file opens in the TEXT editor
at that line (the convention every terminal/linkifier follows).

## Product decisions (confirmed by implementation, not pre-decided in this file)

- **On by default, no setting.** Matches the wiki-link precedent (context-gated, not
  config-gated) and is safe because decoration is resolution-gated — a ref to a path that
  isn't a real workspace file never gets a chip, so there is no plausible false-positive
  surface that would need an opt-out.
- **Clickable in the editable surface (IR/WYSIWYG) AND Preview**, not Preview-only — the
  task's own Lute-invisibility requirement only makes sense for editable modes, so this was
  effectively already decided by the task's technical constraints.
- **A code reference to a `.md` file always opens the plain text editor, even though task
  468 (shipped the same day) made a markdown *link* to the same file open in vMarkd**
  ("follow the source" — `shouldOpenTargetWithVmarkd`). Deliberate, not an oversight: a code
  reference's whole point is "show me this line", which only the text editor can do (vMarkd
  has no line-granular reveal — that's task 52's separate, unbuilt direction); a markdown
  link's point is "take me to that document", where vMarkd is the right destination.
  `showTextDocument` is also the only API that's *guaranteed* plain-text regardless of
  `editorAssociations`, unlike `vscode.open`/`vscode.openWith`. If this asymmetry gets
  reported as a bug, it isn't one — don't unify it with 468's link-opening logic without
  re-deciding this trade-off first.

## Scope

- [x] Tokenizer: workspace-relative path + `:line[:col]` in prose AND inside inline code
      (`` `src/foo.ts:42` `` is how people actually write them — for inline code add the
      click affordance without altering the rendered text). `src/code-ref-core.ts`.
- [x] Resolution: validate against the workspace host-side (new small message — batched,
      requestId-correlated, mirrors `diagram-cache-get`'s shape); unresolved paths stay
      plain (no dead-link chips). `media-src/src/code-ref-resolve.ts` (webview) +
      `AssetLinkActions.onResolveCodeRefs` (host).
- [x] Click (policy-consistent: Ctrl+click by default, same `shouldOpenLink` policy every
      other link uses) → host `showTextDocument` with a `selection` at line/col — the plain
      text-editor path, NOT the custom editor. `AssetLinkActions.onOpenCodeRef`.
- [x] Rendering: subtle affordance (underline-on-hover), Lute-invisible decoration.
      **Not** `data-render` (measured — see below): a plain, class-only `<span>` with no
      special `data-type`/`contenteditable` is already transparent to Lute's IR/WYSIWYG
      serializers AND its per-keystroke Spin reparse, so the wrapped text round-trips with
      no strip/reintroduce dance (`media-src/src/code-ref-decorate.ts`). Inline code is
      attribute-only on the existing `<code>` — no DOM injection inside it.

## Out of scope

- Symbol links (`foo#myFunction`), permalink generation, cross-repo paths, hover preview
  of the target lines (possible later via the task-230 fetch wire).

## Measured before building (premise checks)

- **`data-render="1"` is wrong for this feature** (contradicts the naive first instinct):
  Lute's IR/WYSIWYG walkers `if (d==="1"||d==="2") return` — SKIP the whole subtree. That's
  correct for injected content with no markdown counterpart (diagram error boxes, callout
  previews) but WRONG here — the chip's text IS the document's real markdown content, and
  skipping it deletes it from the saved file. Verified via a Lute-in-Node spike
  (`tmp/229-code-ref-spike/`): a bare class-only span round-trips the wrapped text
  byte-identical through `VditorIRDOM2Md`/`SpinVditorIRDOM`, no data-render needed.
- **Attribute/class on inline `<code>` does not leak** into the saved markdown (verified in
  the same spike) — confirms "attribute-only for inline code" is achievable.
- **A real, non-hypothetical bug found only by the real-VS-Code e2e**: Vditor's actual
  IR/WYSIWYG editor root is itself `<pre class="vditor-reset">` (`ir/index.ts` /
  `wysiwyg/index.ts`), so a bare `pre`/`code.closest('pre')` guard (meant to exclude fenced
  code blocks) silently excluded the ENTIRE editable surface — nothing outside the toolbar
  chrome ever got decorated. Fixed with `pre:not(.vditor-reset)` / a dedicated
  `isInFencedCodeBlock` helper. No `<div>`-mounted unit test ever exercised this path;
  regression unit tests now mount through a `<pre class="vditor-reset">` wrapper to keep it
  covered at that layer too.

## Verification

- [x] L1: tokenizer unit (path shapes, `:line:col`, windows separators, guards: URLs,
      full-line fences, timestamps). `test/backend/code-ref-core.test.ts` (20 tests).
- [x] L2: prose + inline-code affordance render (resolution-gated, skip-subtree, caret-guard,
      scoped-mutation-path coverage), round-trip byte-stable (proven via the Lute spike, not
      re-derived as a unit test — Lute isn't loaded in vitest), host resolve/open unit tests.
      `media-src/src/code-ref-decorate.test.ts` (20), `code-ref-resolve.test.ts` (9),
      `test/backend/asset-link-actions.test.ts` (+18 for resolve/open).
- [x] L3 real-VS-Code (mandatory): Ctrl+click → text editor opens at the exact line
      (`activeTextEditor.selection` asserted via `evaluateInVSCode`), tab has NO viewType
      (plain `TabInputText`, never `vmarkd.editor`), resolution gate proven (missing-file ref
      never decorates), plain click does not navigate, workspace-relative resolution proven
      (doc lives under `sub/`, ref written as if from repo root), inline-code variant proven
      separately (own line/col). `test/vscode-e2e/code-ref-open.spec.ts` — run individually,
      3/3 stable passes.
