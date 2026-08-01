# Task 212 — Fix CSP-bricked Vditor widgets (image overlay lockup + code copy button)

**Status:** planned — BUG pair · **Impact:** 🔴 high (a) / 🟡 med (b) · **Origin:** task 192 §4; 191 Probes 1 & 3 + §5.6

## Problem

`src/html-builder.ts:54-65` sets `default-src 'none'` with `'unsafe-inline'` only for
`style-src` (hand-verified) — inline `onclick` attributes are dead in the real webview.
Two vendored Vditor widgets rely on them:

1. **Image preview overlay** — dblclick an `<img>` (single click in preview/sv-right) opens
   `.vditor-img` whose BOTH close paths are inline `onclick`; body scroll is locked →
   **editor unusable until reload**.
2. **Code-block copy button** — injected by `codeRender` in ALL modes' preview panels
   (vendored `processCode.ts:96`); clicking does nothing.

Neither reproduces in the L2 harness (no CSP) — that's why they survived.

## Scope

- [ ] Run 191 Probe-1/Probe-3 first (L3, expected FAIL) — they become the regression nets.
- [ ] (a) Image overlay: set `image.isPreview: false` in `buildVditorOptions` (kills the
      overlay; task 217 gives images a proper zoom instead — note the pairing, don't
      block). If the overlay is kept for any reason, rewire close via addEventListener in a
      post-render pass instead.
- [ ] (b) Copy button: patch `processCode` (VDITOR_TS_PATCHES registry) to drop the inline
      `onclick` and bind a delegated listener that posts the code text to the host
      (`vscode.env.clipboard` — the task-53 `copy-*` wire) — or hide the button via options if
      product prefers (§5.6 decision; lean rewire, the button is genuinely useful).
- [ ] Do NOT weaken the CSP (185/3i already pinned why `unsafe-eval` is the only allowance).

## Verification

- L1: patch-registry mutation test picks up the new patch automatically
  (`patch-mutation.test.ts`); a unit for the copy payload extraction (line numbers/ZWSP
  stripped — see 191 Probe-19 finding).
- L3 real-VS-Code (mandatory — CSP only exists here): (a) dblclick image → no overlay (or
  overlay closes); scroll never locks; (b) copy button click → clipboard holds exactly the
  code. Promote the probes to nets in `preview-widgets.spec.ts` per 191 §4.
