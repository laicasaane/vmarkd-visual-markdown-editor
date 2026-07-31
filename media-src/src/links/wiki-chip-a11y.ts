// Shared accessibility attribute for every wiki-chip <span> — task 457.
//
// Wiki chips are opaque inline <span>s (contenteditable can't natively delete them with one
// keystroke — see link-click-fix.ts's own Backspace/Delete handling), and a bare <span> is never
// keyboard-focusable: without an explicit tabindex, Tab can never reach one, so main.css's existing
// `.wiki-link-chip:focus-visible` rule was DEAD CSS — nothing could ever trigger it. Enter/Space
// activation (link-click-fix.ts's keydown listener) already reuses the SAME `activateWikiLink` the
// click handler calls; it just never received a keydown targeting a chip, because nothing could
// focus one.
//
// THREE independent places render a wiki-chip's opening tag (custom-renderer.ts's `wikiTextToHtml`
// for normal Lute rendering, wiki-serialize.ts's `reintroduceChips` for the live re-parse after an
// edit, vditor-init.ts's `[[` autocomplete hint for a freshly-inserted chip) — none share a
// template, so this constant is the ONE place `tabindex="0"` is spelled out, to keep the three from
// drifting (the "fixed it in N-1 of N copies" risk this codebase already guards against elsewhere —
// diagram-dom.ts's RENDER_KEY_ATTR, engine-registry.ts's per-engine config list). Future chip
// classes (task 244's split — 205/228/229/234) should reuse this same constant rather than
// re-deriving their own tabindex handling.
export const WIKI_CHIP_TABINDEX_ATTR = 'tabindex="0"'
