# Task 360 — Broken NATIVE diagram shows raw source instead of the themed error box

> **Status:** ✅ FIXED (2026-07-23). Found while triaging the real-VS-Code suite (see
> `tmp/suite-triage-2026-07-23.md`); the `mermaid-error` + `diagram-errors` specs were failing because
> of a real product regression, not a test issue.

## Symptom
A broken NATIVE diagram (mermaid / abc / flowchart) rendered as its **raw source text** in the
preview instead of the themed `.vmarkd-diagram-error` box (task 178). User-visible: type an invalid
mermaid diagram and you get `flowchart TD A --< B` as plain text, no error, no box.

## Root cause (traced, not guessed)
The offscreen render→swap in `media-src/src/native-offscreen.ts` only copied a finished **`<svg>`**
into the live node:

```js
if (temps[i].querySelector('svg')) { j.live.innerHTML = temps[i].innerHTML }
```

A broken source renders its error box (`.vmarkd-diagram-error`, **not** an `<svg>`) in the offscreen
sandbox. The poll's `done` fires on `data-processed==="true"` (Vditor's `mermaidRender` sets it after
the catch), but the swap's `querySelector('svg')` guard is false for a box, so the box was **dropped
with the sandbox**. The live node kept its raw source text with `data-processed="true"`, and Vditor's
own renderer — guarded by `data-processed` — never re-ran, so no box ever appeared.

Confirmed by a `setAttribute('data-processed')` trap in the real webview: two hits — one on the
offscreen temp (`box=1`, not in preview) and one on the live preview (`box=0`) — i.e. the box existed
offscreen and never crossed over. Ruled OUT: the render cache (probed `data-vmarkd-cache-reserve`/
`-hit` both absent) and a transient-then-overwritten box (50ms sampling: box count never rose).

## Fix
`native-offscreen.ts` swap guard now also copies a themed error box:

```js
if (temps[i].querySelector('svg, .vmarkd-diagram-error')) { … }
```

One line + comment. A broken diagram's offscreen error box is now swapped into the live node like a
finished SVG. Applies to all three native engines that go through this path (mermaid/abc/flowchart).

## Verification
- `mermaid-error.spec.ts` → 1 passed (was: 60s timeout, box never appeared).
- `diagram-errors.spec.ts` → 2 passed. Test 1 now sees **7/7** engine error boxes (flowchart was the
  missing one; the 6 custom engines go through faithful-render.ts, unaffected). Test 2 (edit valid→
  invalid) also needed a page-level focus click — a harness fix, separate from this product bug.
- Regression-safe: `diagram-cache-mermaid` + `diagram-width` (valid renders) still pass — the SVG swap
  path is unchanged.
- Unit: native-offscreen / render-cache / faithful-render suites 18/18. `npm run lint:ci` clean.

## Coverage note
The two real-VS-Code specs above ARE the regression net for this fix. `abc` broken-render has no
dedicated spec but goes through the same (now-fixed) swap; a focused abc-error spec would be the only
gap worth closing later.
