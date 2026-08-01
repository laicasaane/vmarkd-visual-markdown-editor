# Task 399 — Split `media-src/src/main.ts` (god-module, grown since the 2026-06-02 review)

**Status:** ✅ DONE (2026-07-27) · **Impact:** 🔴 high (fastest-growing structural risk) · **Origin:** Fable architecture review (2026-07-27), following up on `docs/code-review-solid-kiss-2026-06-02.md`

> **⚠️ Correction 2026-07-27 (Codex architecture review), RESOLVED same day:** an earlier pass marked
> this task done without running the **coverage-module ratchet** — a CI gate
> (`.github/workflows/ci.yml` → `npm run check:coverage-modules`, after `npm run test:coverage`) —
> which FAILED: the three modules this task created (`vditor-init.ts`, `message-router.ts`,
> `editor-session-state.ts`) were at 0% unit coverage and not in `BASELINE_ZERO`. Fixed by adding
> `editor-session-state.test.ts`, `vditor-init.test.ts` (the two functions separable from Vditor
> construction: `renderCacheThemeKey`, `applyVditorTheme`), and `message-router.test.ts` (routing +
> `handleUpdate`'s echo-guard / init-retry / external-update branches). Re-ran the gate: all three
> modules are OFF the red list. [Task 403](403-coverage-ratchet-red.md)'s own group 1 is closed by
> this; its group 2 (three PRE-EXISTING red modules — `d2-entry.ts`, `elk-bundled-shim.ts`,
> `mermaid-elk-entry.ts`, unrelated to this split) is still open and tracked there.

## Outcome

`main.ts` is now **159 lines** (was 930), down to imports + one-time wiring calls + the
inline-init bootstrap — the "composition root" role only. Three of the five files the
2026-06-02 plan proposed (`editor-caret.ts`, `prerender-overlay.ts`, `vditor-theme.ts`)
had *already* been extracted since that review, and the message-handling switch had
already become a handler map — so the actual remaining work was two extractions:

- **`vditor-init.ts`** (446 lines) — `initVditor`, `applyVditorTheme`,
  `renderCacheThemeKey`, `CONTENT_VIS_MIN_CHARS`. Owns constructing the live Vditor
  instance, including the large-doc streaming path.
- **`message-router.ts`** (366 lines) — every `handleX` host-message handler, the
  `messageHandlers` map, and `installMessageRouter()` (wires the `window.addEventListener`
  listener main.ts used to own directly).
- **`editor-session-state.ts`** (47 lines, new — not in the original plan) — the shared
  mutable state (`lastInitMsg`, `applyingExtensionUpdate`, `streaming`, `editSync`,
  `wikiKnownPages`, `wikiDisplayNames`) that both `vditor-init.ts` and
  `message-router.ts` read AND write as part of the same init/update lifecycle.

**Resolved the open question** (class vs. plain module state) in favour of a **plain
shared object**, not a class: every call site already did direct field mutation
(`applyingExtensionUpdate = true`), so getter/setter methods would have added
indirection without adding safety — and it matches this file's own established
`createEditSync(deps)` / `configureDiagramRetheme(deps)` dependency-injection idiom.
State needed by only one side (`lastDiffChanges`, `inlineInitedContent` — message-router
only; the observer registry — vditor-init only) stayed **local** to its owning module,
not shared — narrower than the June plan assumed since it was written before those two
fields' actual usage was re-examined.

## Problem

The 2026-06-02 SOLID/KISS review flagged `media-src/src/main.ts` as a god-module (~500
lines at the time: `initVditor` + an inline message-router switch + caret tracking +
theme + overlay lifecycle, coupled through module-global mutable state — `lastInitMsg`,
`applyingExtensionUpdate`) and wrote a concrete split plan, but deferred execution as
"a large, opinionated change better done in isolation with its own PR."

That deferral is now stale. Verified 2026-07-27: `main.ts` is **930 lines** — nearly
double its size at review time, and every new webview feature (diagram engines, theme
handling, caret/session behaviour) has kept landing in the same file. It is the single
most-touched file on the webview side, which makes it the most likely site of merge
conflicts and cross-feature regressions. `src/extension.ts` (the host-side god-file
flagged in the same review) has stayed flat at ~1400 lines by comparison — `main.ts` is
the one actually accruing cost.

## Scope

Execute the split already designed in `docs/code-review-solid-kiss-2026-06-02.md`
(section "`main.ts` — god-module"):

- [x] `message-router.ts` — extract the message-handling into a handler map + an
      `installMessageRouter()` that owns the `window.addEventListener('message', …)`
      wiring (the switch had already become a handler map before this task started;
      what was left was moving it out of `main.ts`).
- [x] `vditor-init.ts` — `initVditor` (+ `applyVditorTheme`, `renderCacheThemeKey`,
      `CONTENT_VIS_MIN_CHARS`).
- [x] `vditor-theme.ts` — already existed (extracted independently since the June
      review); no work needed here.
- [x] `prerender-overlay.ts` — already existed; no work needed here.
- [x] `editor-caret.ts` — already existed; no work needed here.
- [x] Decided: a plain shared object (`editor-session-state.ts`'s `sessionState`), not a
      class — see "Outcome" above for the rationale.
- [x] Re-verified the file's actual shape (930 lines, not the June 500) before touching
      it — three of the five originally-proposed files already existed, so the real
      extraction boundary was `initVditor` + the message handlers only, not the full
      original five-file plan.

## Out of scope

- The parallel `src/extension.ts` split (host side) — same review, same shape of
  problem, but not growing at the same rate; track separately if/when it becomes urgent.
- Any behavioural change. This is a pure structural extraction — the message protocol,
  init sequence, and observable webview behaviour must be byte-for-byte unchanged.

## Verification

- [x] Existing unit tests for webview modules continue to pass unmodified, PLUS new unit
      tests for the three extracted modules (1767/1767 green, `npm test`) — behaviour
      didn't change on the pre-existing side, only file boundaries; the ratchet coverage
      is new, additive test surface (see below).
- [x] Real-VS-Code e2e, fast tier (39/39 green, `npm run test:vscode:fast`) — covers
      init/theme/caret/message-routing surface.
- [x] `npm run lint:ci` clean (494 files, no fixes needed); `npm run typecheck` clean (the
      `edit-sync.ts` `VditorDOM2Md` error noted in an earlier pass was a pre-existing gap
      in `inner-vditor.ts`'s `lute` type, unrelated to this split, and has since been
      fixed — `main.ts:VditorDOM2Md` is a real, widely-used Lute method the narrow
      `InnerVditor.lute` type was just missing); `node build.mjs` clean.
- [x] Line-count sanity check: `main.ts` 930→159, `vditor-init.ts` 446, `message-router.ts`
      366, `editor-session-state.ts` 47 — no extracted file approaches the original
      problem size.
- [x] `npm run test:coverage && npm run check:coverage-modules` (the CI coverage ratchet) —
      GREEN for this task's three modules: `editor-session-state.test.ts` (state shape +
      mutability), `vditor-init.test.ts` (`renderCacheThemeKey` + `applyVditorTheme`,
      Vditor-construction itself left to the real-VS-Code e2e above), `message-router.test.ts`
      (routing dispatch, unhandled-command logging, `handleUpdate`'s echo-guard /
      init-failure-retry / external-update / streaming-suppression branches). The gate's
      remaining red modules (`d2-entry.ts`, `elk-bundled-shim.ts`, `mermaid-elk-entry.ts`)
      pre-date this task — tracked as [task 403](403-coverage-ratchet-red.md) group 2.
