# Task: Wikilinks resolution (`[[page-name]]`)

> **Source:** internal plan
> **Derived from (removed plan):** `wikilinks-resolution-plan.md`
> **Value / Risk:** 🟢 feature / medium (rendering pipeline + index freshness)

Single cohesive feature delivered in steps (each step builds the next — not
independently shippable, so kept as one task with an internal checklist).

## Goal
`[[page-name]]` resolves to `page-name.md` in the workspace and becomes a clickable
preview link. Missing/ambiguous targets are surfaced, not failed silently.

## Assumptions
- Wiki pages use lowercase, hyphenated filenames.
- The extension owns link rendering in preview (not the native Markdown renderer alone).
- The primary content set is a folder of `.md` files indexable in the workspace.

## Steps (delivery order)
1. **Syntax + index** — support `[[page-name]]`; normalize identifiers (decide
   case-sensitivity, keep consistent). Scan `.md` folders, map each file to a
   canonical wiki key; keep the index fresh on add/rename/delete; detect duplicate
   keys as conflicts.
2. **Resolver** — `[[name]]` → indexed path; return missing-link / ambiguous-link
   states. Keep isolated so preview, hover, and future rename tools reuse it.
3. **Preview render** — extend the Markdown pipeline (plugin/transform) to rewrite
   wikilinks into clickable links via the resolver; render missing links with a
   visible warning style; leave ordinary Markdown links unchanged.
4. **Navigation + diagnostics** — clicking a resolved link opens the target;
   missing/ambiguous surfaces a useful message; flag unresolved links; show resolved
   path in hover; optional: quick-create a missing page. Optional later:
   Ctrl/Cmd-click jump.
5. **Tests** — normal resolution, missing-link, duplicate conflict, ordinary links
   unchanged, preview with multiple internal links.

## Acceptance criteria
- Preview shows `[[page-name]]` as clickable links.
- Clicking a resolved link opens the correct `.md`.
- Missing links are visible and actionable; duplicates handled deterministically.
- Existing Markdown behavior is not broken.

## Open questions (resolve before implementing)
- Resolve only inside a dedicated wiki folder, or across the whole workspace?
- Support aliases `[[Page Title|page-name]]` now or later?
- Auto-create missing targets, or only surface as diagnostics?

> Note: the repo already has wiki handling (`custom-renderer.ts`, the `wiki` context
> in `extension.ts`). Reconcile this plan with existing behavior before starting.

## 1.4.0 release-gate follow-up (2026-09-01)

Task 541 found that a second autocomplete immediately after an inserted wiki chip never opened: the
editable renderer's ZWSP caret landing and Vditor's atomic-boundary input left `ZWSP + [` after the
user typed the second `[`; the ordinary `[[` hint key could not recognize that shape. The shared
wiki hint builder now has a boundary-specific key that restores one real separator when filling the
second result, and the Chromium harness imports the same source-patched Vditor as production.
Focused unit coverage passes 14/14, the complete wiki-hint Chromium file passes 23/23 with no retry,
and a real-VS-Code completion/save journey passes 1/1 with exact `[[Home]] [[Alpha]]` bytes.
