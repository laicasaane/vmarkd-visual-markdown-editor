# Task 243 — FIX: in-document anchor links `[x](#heading)` + `{#custom-id}` heading IDs

**Status:** planned — BUG/fix pair · **Impact:** 🟡 med (READMEs with manual TOCs) · **Origin:** task 192 §10 (probe-verified)

## Problem

Two verified halves of one feature:
1. **Fragment links never navigate**: `onOpenLink` (`extension.ts:805-817`) resolves any
   non-http href against the doc dir — `#custom-id` becomes a FILE named `#custom-id` →
   error. The webview has zero fragment handling (grep link modules → none), and preview
   headings carry no `id` to anchor to anyway.
2. **`{#custom-id}` is a half-state**: Vditor never calls `SetHeadingID` → probe shows the
   `{#custom-id}` text is STRIPPED from display yet no `id` attribute is emitted — the
   syntax silently does nothing and the user can't even see why. With `SetHeadingID(true)`
   the probe emits `<h1 id="custom-id">` and Sanitize keeps it; IR already parses the
   marker and round-trips byte-stable.

## Scope

- [ ] Enable `SetHeadingID(true)` (setLute patch or post-init call; registry-anchored).
- [ ] Webview: intercept fragment-only hrefs in the link-click path → resolve against
      custom ids FIRST, then GitHub-style slugs of heading text → reuse the
      scroll-to-heading machinery. No host round-trip for same-doc anchors.
- [ ] Host: for `file.md#frag` strip the fragment before `vscode.open` and post a
      scroll-to-heading after the target opens.
- [ ] Share the heading-resolution helper (slugger + custom-id map) with task 203
      (`[[note#heading]]`) — ONE slugger, unit-pinned, Obsidian/GitHub-compatible.
- [ ] Slugger flavor option (added 2026-07-03, MAIO parity): `vmde.slugifyMode` =
      `github` (default) | `gitlab` — one flag in the shared slugger; 253's TOC and 32's
      anchor completion inherit it automatically. Add only the two; other flavors on
      request.

## Out of scope

- Anchor autocompletion in `](#` (note for task 32), `{#id}` on non-heading blocks.

## Verification

L1: slugger + resolution units (custom id beats slug, unicode/duplicate headings).
L2: click `[x](#target)` → scrolls + flashes, no `open-link` post; `{#custom-id}` heading
round-trips and carries the id. L3 real-VS-Code: same-doc anchor + `file.md#frag`
cross-doc journey.

## Investigation notes — cross-doc flash debugging (2026-07-31)

L3 (`test/vscode-e2e/anchor-links.spec.ts`) failed at the cross-doc flash assertion after the
editor-type gap (below) was fixed. Two hypotheses were raised and BOTH RULED OUT by a real-VS-Code
diagnostic (a `window.__vmdeScrollLog` array recorded inside `scrollToHeadingIndex`, since
removed):
- **Ready-race** (host's `scroll-to-heading` post never reaching the freshly-opened webview) —
  ruled out. The message arrived, both times it was sent (see double-fire below).
- **Render-order race** (message arriving before Vditor finished building the DOM) — ruled out.
  `activeModeElement` resolved, all headings were present, the correct heading was matched by
  text, every time.

~~**Do not re-investigate either of these** — reopen only with new contradicting evidence.~~

**Update (task 468, later the same day): the render-order race WAS real — reopened with new
contradicting evidence, per this note's own bar.** The ruling-out above measured a DIFFERENT code
path: plain `vscode.open` (pre-468), with the `editorAssociations` test override, and the
diagnostic lived INSIDE `scrollToHeadingIndex` itself — it could only observe calls that reached
that function, so it couldn't distinguish "no early call happened" from "an early call happened
and got silently dropped before reaching here" (there was no such drop on THAT path, so the ruling
was correct for it). Task 468 switched the source-is-VMDE case to `vscode.openWith`, which
registers the panel in `active-panels.ts` measurably earlier (`waitedMs: 0` in a fresh diagnostic)
— early enough that the FIRST `scroll-to-heading` attempt can now genuinely land before Vditor has
finished rendering the target's headings, something the pre-468 path never surfaced. Reproduced
deterministically (3/3 red, `xvfb-run … --repeat-each=3`, same failure every time — not the
intermittent character a coincidence would have) and fixed with a retry in
`media-src/src/message-router.ts`'s `scrollToHeadingWithRetry` (task 468's file has the fix
detail); 3/3 then 5/5 green after. The double-fire fix below is real and separate — restored to
its original `delivered`-gated design once the render-order race turned out to fully explain the
`ok:true`-yet-no-scroll symptom that had briefly cast doubt on it (see task 468's file).

Two real bugs the diagnostic DID surface:
1. **Double-fire**: `scrollToFragmentAfterOpen` posted `scroll-to-heading` immediately AND
   unconditionally reposted on the webview's `ready` event (a defensive fallback, mirroring
   editor-session.ts's documented `ready` race for the HOST's own listener). Both landed, every
   time — `scrollToHeadingIndex` ran twice per cross-doc anchor click. Fixed by gating the
   fallback on `webview.postMessage`'s own returned `Thenable<boolean>`: the `ready` listener is
   only armed if the immediate post did NOT deliver.
2. **Transient-flash assertion in the spec**: the flash class (`FLASH_CLASS`, outline.ts) is
   added then removed on a timer — sampling `document.querySelectorAll('h1,h2')[i].classList`
   some fixed delay later is a coin flip on machine load, not a real assertion. Fixed in the spec
   (not the product) for the SAME-doc leg with a `MutationObserver` recording "was heading X
   ever flashed", installed via `frame.locator('body').evaluate(...)` on the already-open frame
   before any click.
   - First attempt installed the recorder via `workbox.addInitScript` instead — measurably WRONG:
     a page-level init script lands in the OUTER `iframe.webview` shell, not the INNER
     `iframe[title="VMDE"]` content frame Vditor actually runs in (already documented by
     `hljs-colour-timing.spec.ts`'s own comment about the identical limitation with an rAF
     sampler — read that comment before reaching for `addInitScript` in a VMDE spec again).
     Caught because the SAME-doc leg — the calibration case, known to flash reliably — also came
     back empty, not just the harder cross-doc leg; if only the cross-doc leg had failed this
     would have looked like confirmation instead of a broken instrument. Also: a bare `?? []`
     default on the read-back collapsed "recorder never installed" and "installed, nothing
     recorded" into the same value — always validate a new measurement against a known-positive,
     and make sure your instrument can even REPORT "I didn't see anything" before trusting a
     "nothing happened" reading anywhere else.
   - Round 5 (lead review): a `frame.evaluate`-installed observer for the CROSS-doc legs was
     never made to work — measured, not assumed: sampling the flash class immediately after the
     frame became queryable still read `false` on real VS Code (twice, `--repeat-each=2`). A
     `frame.evaluate` recorder can only arm once Playwright can resolve the sibling's frame/body,
     and by then Vditor has already built the heading DOM (round-3 diagnostic) — the flash had
     already happened and cleared.
     **Fix: stop asserting the flash for the cross-doc legs at all.** The flash is a decoration;
     the actual contract (and the test's own title) is that the click SCROLLS the target heading
     into view. Scroll position is durable — once `scrollIntoView` lands it stays landed, so
     there is no window to lose polling for it, unlike a 1.4s CSS class. Both cross-doc legs
     (sibling-target, and the shared-name trap) now poll `getBoundingClientRect()` of the target
     heading against the frame's own viewport (`waitForHeadingInView`/`isHeadingInView` in the
     spec) instead of sampling `FLASH_CLASS`. Same-doc legs are unaffected and still assert the
     flash via the (now proven-reliable) `frame.evaluate` recorder — that mechanism was never
     the problem; racing a transient CSS class with a cross-document navigation was.
     Two things this needed to be honest, not just different:
     - **"Already in view" trap**: a heading that fits in the initial viewport makes "scrolled
       to it" indistinguishable from "was already there". `anchor-links-sibling.md` is padded
       with ~30 filler paragraphs before "Shared Name" and ~30 more before "Sibling Target" —
       well past any plausible single viewport — so a fresh open (which starts at scrollTop 0)
       structurally cannot have either heading in view before the click.
     - The sibling PANEL is reused (same webview, no reload) across the two cross-doc legs, so
       without an explicit reset the shared-name leg's "did it scroll" check would read against
       whatever scroll position the sibling-target leg left behind. `resetScrollToTop` forces it
       back to the top and a positive assertion confirms "Shared Name" is out of view BEFORE the
       shared-name leg's click — so that leg's later "in view" result is proof of ITS OWN click,
       not a residual position from the leg before it.

Separately found (not part of this task, filed as its own follow-up, task 468): vmde's
customEditor `priority` is `"option"` (package.json), not `"default"`, so `onOpenLink`'s
cross-doc `vscode.commands.executeCommand('vscode.open', …)` was not guaranteed to open the
target as a vmde webview in a profile with no prior "Open With" choice for `.md` — it silently
opened VS Code's built-in text editor instead. `local-link-open.spec.ts` (task 359) never caught
this because it only ever asserted the opened tab's `fsPath`, never its `viewType`.

**Update — task 468 shipped ("follow the source": a cross-file link opens with VMDE only when
the SOURCE document is itself open in VMDE).** The `workbench.editorAssociations` override
described above is **gone** from both `anchor-links.spec.ts`'s and `local-link-open.spec.ts`'s
`boot()` — it was a test-side workaround for 468's bug, not a real precondition, and both specs
now pass WITHOUT it (`anchor-links.spec.ts` cross-doc legs run `--repeat-each=5`, 5/5 green;
`local-link-open.spec.ts` 6/6 green), which is the real proof 468's fix works end-to-end. Fixing
468 also surfaced and fixed a second, independent bug in THIS task's own cross-doc scroll: a
freshly-opened panel's `scroll-to-heading` message could arrive before Vditor had finished
rendering the target's headings into the DOM, silently doing nothing — see task 468's file for the
retry fix (`message-router.ts`'s `scrollToHeadingWithRetry`). Both specs' `viewType` assertions now
use the `expectTabOpenedAsVmde`/`openTabInfo` helper pattern.

## Prior art — fork re-scan 2026-07-23 (task 358)

- `zaaack` PR #165 `fix: table of contents / in-page anchor links do nothing when clicked` (0.1.18) — upstream fixed the SAME bug we probe-verified. Read the diff before implementing; their fix covers only half 1 (fragment navigation), not the `{#custom-id}` half.
- Coordinate the host-side href handling with task **359** (one classifier, not two).
