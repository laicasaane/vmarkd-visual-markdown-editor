# Task 355 — Fix diagram + font sizing/rendering (looks bad)

**Status:** 📋 TODO (open — user feedback 2026-07-05). Perceptual / visual — steer by the user's eye.

## Problem
The user evaluated the rendered diagrams in the real editor and reports that **the sizing and fonts look
bad across the board** ("za duże / porozciągane" and, after a partial fix, still "źle wszystko wygląda").
The diagram/font sizing is not right yet and needs a proper, holistic pass — not another one-off tweak.

## What's already been tried (task 354 fallout — partial, NOT sufficient)
- `main.css` had `min-width: 300px` on every `.language-plantuml > svg`. For the stdlib icon libraries
  (k8s/aws/azure/… — bitmap `<image>` sprites) that UPSCALED small diagrams (e.g. 87px → 300px), stretching
  and blurring the sprites and inflating the fonts. Scoped the boost to pure-vector diagrams only
  (`svg:not(:has(image))`) so sprite diagrams render at natural size (committed with 354).
- Result: sprite diagrams are crisp at natural size, BUT the user still finds the overall sizing/fonts
  wrong — so the fix is incomplete. Open questions the pass must settle **by eye, with the user**:
  - Is the 300px boost for pure-vector plantuml (sequence/class) the right target, too big, or too small?
  - Are the natural-size sprite diagrams now too SMALL (cloudinsight 87px, kubernetes 104px)?
  - Fonts: are labels too large/small relative to the diagram + the surrounding prose?
  - Is this plantuml-only, or do other renderers (mermaid/graphviz/flowchart/…) have the same "wrong size"
    feel? (mermaid/graphviz are deliberately intrinsic-size per an earlier "za duże" call — revisit.)

## How to do it (don't guess — measure + show)
- Use the **`vmarkd-visual-debugging`** skill: screenshot the real-VS-Code render, measure intrinsic vs
  rendered dims, iterate. After EACH change: rebuild → **package + install the VSIX + BUMP THE VERSION**
  (a same-version reinstall lets the editor keep a stale webview — see below) → ask the user to reload and
  judge. Show partial results and pause for the user's eye (they steer sizing).
- Candidate levers: the `min-width` boost value + scope; a `max-width`/`max-height` cap; a per-family
  scale; font-size relative to the diagram; whether to inject a PlantUML `scale`/`skinparam dpi` for the
  icon libs. Decide WITH the user, don't unilaterally pick.

## Process gotcha that wasted time here (record so it isn't repeated)
- **Local VSIX iteration MUST bump the extension version.** Installing the same version (1.2.0 → 1.2.0)
  over a running editor let VS Code keep a stale extension host / restored webview, so rebuilt changes did
  not show and looked like render bugs. `main.js` is content-hash cache-busted, but the extension host
  itself needs a genuine version change to refresh reliably. Bumped to 1.2.1 to force it.

## Related
Task 354 (added the stdlib icon libs + the `:has(image)` sizing scope), the `diagram-fill-width` memory
(natural-size, shrink-only direction), `diagram-width.spec.ts`. Files: `media-src/src/main.css`
(search `min-width`, `.language-plantuml`), the per-renderer sizing rules around it.
