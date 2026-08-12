# Task 224 — Paste URL onto selection → wrap as link

**Status:** ✅ **DONE (2026-08-11) — PREMISE REFUTED.** The headline ask already worked; the
surviving setting bug, existing-link replacement, context guards, and 191 P0-8 update are all
implemented and verified in the harness and real VS Code. The optional title-unfurl extension is
explicitly split into [task 509](../509-paste-url-title-unfurl.md) and is not part of this task. ·
**Impact:** ⚪ low · **Origin:** task 192 §5

## Measured, 2026-07-30 — the "Problem" below is WRONG

`test/vscode-e2e/paste-behaviour-probe.spec.ts`, real clipboard + real Ctrl+V:

| what | result |
|---|---|
| URL pasted OVER a selection | `First paragraph with the word **[TARGET](https://example.com)** inside it` |
| URL pasted with a collapsed caret | `CARET**[https://example.com](https://example.com)**` |

**Both halves already work.** The selection wrap is Vditor's OWN, and has been all along —
`fixBrowserBehavior.ts` has `if (range.toString() !== "" && vditor.lute.IsValidLinkDest(textPlain))
{ textPlain = \`[${range.toString()}](${textPlain})\` }`. The collapsed-caret half shipped as
**task 392**. The claim below that "Vditor's paste path has no such branch" cites lines that
normalise copied `<a>` HTML — a different code path from the one that does the wrapping.

Nothing was implemented for the headline ask, because there was nothing to implement.

## What is actually left

- [x] **The setting only gated HALF the feature — FIXED 2026-07-31.** `vmarkd.editor.pasteUrlAsLink`
      (task 392) was checked in `__vmarkdPasteUrlMd`, i.e. the collapsed-caret branch only. Turning
      it off still wrapped a URL pasted over a SELECTION — the user switched the behaviour off and
      got it anyway.
      Fix: `link-url.ts` exposes a second, minimal accessor — `__vmarkdPasteUrlEnabled(): boolean`
      — read straight off the same `pasteUrlAsLink` module flag `applyPasteUrlSetting` already
      maintains. `esbuild-shared.mjs`'s `patchPasteUrlAsLink` wraps Vditor's stock
      `textPlain = \`[${range.toString()}](${textPlain})\`` assignment in
      `if ((window as any).__vmarkdPasteUrlEnabled?.() !== false)`, so no accessor (a harness
      without link-url.ts) falls back to stock always-wrap behaviour.
      Deliberately NOT routed through `__vmarkdPasteUrlMd`: that helper also runs OUR url-validity
      detector (`selectedUrl`), which disagrees with Lute's `IsValidLinkDest` (measured: Lute
      rejects `mailto:me@example.com` where ours accepts it) — reusing it here would have changed
      WHICH pastes wrap, not just whether the setting is honoured. The selection branch still uses
      Lute's `IsValidLinkDest` exactly as before; only the setting gate is new.
      Proof: unit tests in `link-url.test.ts` (accessor defaults ON, tracks
      `applyPasteUrlSetting`, treats `undefined` as ON) and `vditor-source-patches.test.ts`
      (patched output gates the selection branch, does NOT route it through `__vmarkdPasteUrlMd`,
      anchor-drift throw still fires); real-VS-Code e2e added to
      `test/vscode-e2e/paste-url-link.spec.ts` (Case 7/8, in the existing `paste-URL core
      behaviours (IR)` test, one boot) — setting OFF → selection paste stays the bare URL, setting
      ON (explicit) → selection wraps. RED-then-GREEN proven by hand-reverting the fix, both at the
      unit-test layer and the real-VS-Code layer, then reapplying.
- [x] Selection is ALREADY a link → replace the href only. The patch expands the active range to
      the whole link, keeps the visible label (.vditor-ir__link in IR), and inserts the new
      destination. Covered by `media-src/e2e/paste-pipeline.spec.ts` and
      `test/vscode-e2e/paste-url-link.spec.ts` (real clipboard + Ctrl+V, 2026-08-11).
- [x] Context guards inside code fences / inline code / sv-raw. Existing code-fence and sv-raw
      cases plus new IR/WYSIWYG inline-code cases in
      `media-src/e2e/paste-pipeline.spec.ts` prove URL pastes remain literal and are not turned
      into markdown links (2026-08-11).
- [x] The title-unfurl extension was split into [task 509](../509-paste-url-title-unfurl.md); it is
      intentionally out of scope for this completed task.
- [x] **Update 191 P0-8** — updated 2026-08-11 with existing-link href replacement and literal
      URL guards for fenced code, inline code, and `sv` raw/source.

## Original problem statement (superseded — kept for the record)

Pasting a URL over selected text replaces the text with the bare URL (auto-linked) instead
of producing `[selection](url)` — a now-standard affordance (Typora, VS Code text editor
with markdown extension, Obsidian all do it). Vditor's paste path has no such branch
(`fixBrowserBehavior.ts:1360-1365` only normalizes browser-copied `<a>` HTML).

## Scope

- [ ] Pre-Vditor paste hook: clipboard is a single URL (scheme http/https/mailto or a
      workspace-relative path?) AND the selection is non-collapsed prose → replace with
      `[<selection>](<url>)`; selection already a link → replace the href only.
- [ ] Context guards: not in code/sv-raw/math/diagram source (literal paste there — the
      191 P0-9 contract); wiki-chip selection excluded (ambiguous — leave default).
- [ ] Setting `vmarkd.paste.linkifySelection` (default on); Ctrl+Shift+V (raw paste)
      bypasses — if a raw-paste chord exists; if not, note the escape hatch is
      undo (one step).
- [ ] **Update 191 P0-8** — it pins the CURRENT `[target](url)`-less behaviour matrix;
      that spec's expectation flips when this ships (called out in 191 §3 already).

## Extension (added 2026-07-03): title unfurl on the NO-selection branch

- [ ] Clipboard is a bare http(s) URL and the selection is collapsed → insert a
      placeholder link, host-side HTTP GET (webview CSP blocks fetch — round-trip through
      the extension host, like allowRemoteImages), parse `<title>`, patch the link text;
      timeout/failure → bare URL stays. **Opt-in** `vmarkd.paste.fetchLinkTitle` (default
      OFF — privacy/offline-first, same rationale as allowRemoteImages) and disabled in
      untrusted workspaces. (Paste URL class, kukushi et al.)

## Out of scope

- Image-URL special-casing (stays a plain link); fetching titles when the setting is off.

## Verification

- L1: decision-table unit (URL detection, contexts, existing-link replace).
- L2: paste-pipeline spec cases per mode — wrap happens in prose, literal in fence, one
  undo step, one edit post.
- L3 real-VS-Code: clipboard URL + Ctrl+V over a selection → disk shows the wrapped link.
