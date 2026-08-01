# 371 — code loses its colouring on the SECOND Preview visit

**Status: ✅ FIXED** (product fix, A/B-verified in the real webview). See "Test honesty" below — the
e2e spec that ships with it is NOT a proven guard.

## Report

> "w preview blok kodu się nie koloruje … to się dzieje po 2 kliknięciu w preview czyli
> ir->preview->ir->preview i wtedy dopiero kolorowanie znika"

The first Preview is coloured; every Preview after it is not. The `.hljs` CLASS stays, which is why
it looks like "the theme stopped applying" rather than "the highlighter stopped running".

## Root cause

`highlightRender.ts` derives the language from the whole class string:

```js
let language = block.className.replace("language-", "");
```

That assumes exactly one class. It holds on the FIRST pass — but the same pass then appends `hljs`,
so a SECOND pass over the same element computes:

```
"language-js hljs".replace("language-", "")  ->  "js hljs"
```

which `hljs.getLanguage()` does not know, so it falls back to `plaintext` and re-renders the block
with **zero token spans**.

A second pass over the SAME element only became reachable with the task-187 preview morph. Before it,
every preview render replaced the pane via `innerHTML`, so highlightRender always met a fresh
`<code class="language-js">`. The morph keeps unchanged blocks' live DOM — which is its whole point —
so on the second render the element already carries `hljs`.

Measured, same file, same probe:

| Preview visit | before fix | after fix |
|---|---|---|
| 1st | 3 token spans | 3 |
| 2nd | **0** | 3 |
| 3rd | **0** | 3 |

The code element is the SAME DOM node (`M1`) on all three visits — that is what proved the morph was
keeping it rather than something clearing the pane.

## Fix

`patchHighlightLanguageClass` (esbuild, `media-src/esbuild-shared.mjs`): read the language from the
`language-*` class itself, falling back to Vditor's expression when there is no such class.

Unit-tested deterministically: the patched expression yields `js` for `"language-js hljs"` and
`python` for `"hljs language-python"` (order-independent), and the patch throws on version drift.

## Test honesty — the e2e is NOT mutation-proven

`test/vscode-e2e/preview-rehighlight.spec.ts` passes, but **removing the fix does not make it fail**,
so it does not currently guard this bug. What was tried:

- `all-renderers.md` — does not reproduce: the diagram engines keep mutating the pane, the morph
  falls back to a full `innerHTML` set, and every block is rebuilt fresh with a clean class list.
- a plain diagram-free fixture — does not reproduce either.
- the exact file that DID reproduce under an ad-hoc probe — the spec still passes without the fix,
  even though the ad-hoc probe on the same content showed 3 → 0 → 0.

So the trigger depends on something the spec's toggle sequence does not reproduce faithfully
(suspect: which render path the toolbar toggle takes, and whether the morph's "nothing changed" early
return is hit at that moment). The PRODUCT fix is verified by the A/B above; the spec is a smoke test
only. **Next step:** instrument the morph (log which branch it takes) under both the ad-hoc probe and
the spec, find the divergence, and make the spec take the reproducing path — then re-run the mutation.
