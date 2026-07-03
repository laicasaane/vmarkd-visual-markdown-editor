# Task 192 — feature-gap audit: what vMarkd lacks (user-facing backlog)

> **Status:** 📋 AUDIT / INDEX (2026-07-03). Product-level answer to "what is missing from
> the plugin", produced by a 5-lens workflow (`wf_19232dfb-ec4`: feature inventory ·
> repo-documented gaps · existence probes for 25 standard editor features · parity vs
> Typora/MarkText/upstream zaaack · parity vs Obsidian-class PKM) — every verdict verified
> against the codebase (file:line), not assumed from product knowledge.
>
> **How to use this file:** it is the umbrella INDEX, not an implementation plan. Every
> item tags its task file — **status lives in the item's own task**, this file only
> aggregates. Items found without a task were spun off into **tasks 193–227** (2026-07-03);
> pre-existing tasks keep their numbers. Three spin-offs were then merged into their
> natural pre-existing homes (2026-07-03): 193→**53**, 214→**52**, 227→**30 Phase 0** —
> the numbers 193/214/227 are retired gaps. Impact tags: 🔴 high · 🟡 med · ⚪ low (frequency ×
> user pain). Baseline: rendering (18 offline engines), theming, tables UX, outline,
> image-paste pipeline, word count, front-matter round-trip and the wiki Phase-1 (chips,
> `[[` hint, create-on-click, pipe labels) are at or above competitor parity — those are
> NOT re-listed here.

## 1. Document output — the largest single hole

- [ ] 🔴 **Export to HTML / PDF (print)** — **task 53** (never started). No export command
      of any kind; Vditor's own export module ships in the bundle but the toolbar item was
      deliberately dropped (toolbar.ts:117-244); no `@media print` styles. Typora's flagship
      capability is absent in full.
- [ ] 🟡 **Copy as HTML / Copy as Markdown — dead route, regression vs upstream** —
      **task 53** (restore section, absorbed former 193). Host handlers alive
      (`extension.ts:1008`, `protocol.ts:153-154`), webview senders removed in the toolbar
      cleanup (`3101b74`) — receiver-without-sender.
- [ ] 🟡 **Diagram export (copy/save SVG/PNG)** — **task 194**. 18 offline renderers and no
      way to get a rendered diagram OUT short of a screenshot.

## 2. Prose-writing comfort

- [ ] 🔴 **Spellcheck** — **task 195**. Vditor hardcodes `spellcheck="false"` on all three
      surfaces (ir/index.ts:38, wysiwyg/index.ts:50, sv/index.ts:29); zero override.
- [ ] 🔴 **Find & REPLACE** — **task 196**. Ctrl+F = native webview widget, find-only;
      replace requires hopping to the text editor.
- [ ] 🟡 **Typewriter mode** — **task 197** (cheap: Vditor `typewriterMode` built in, never
      enabled).
- [ ] ⚪ **Focus mode** — **task 198**.
- [ ] ⚪ **Smart punctuation** — **task 199** (input-time transform; Lute has no SmartyPants).
- [ ] ⚪ **Autopairing (sv)** — **task 200**.
- [ ] 🟡 **IME composition** — probe first (task 190 §5; completely dark today).

## 3. PKM layer — wiki Phase-2 (Phase-1 foundation exists and is solid)

- [ ] 🔴 **Backlinks panel** — **task 201** (no reverse index; forward parser exists,
      wiki-core.ts:63).
- [ ] 🔴 **Rename file → rewrite incoming links** — **task 202** (Phase-1 limit admitted at
      extension.ts:874; silent link rot today).
- [ ] 🔴 **`[[note#heading]]` / `[[note^block]]` — BROKEN, worse than unsupported** —
      **task 203** (treated as missing page; create offers a literal `note#heading.md`).
- [ ] 🟡 **Embeds / transclusion `![[note]]`** — **task 204** (renders as `!` + chip).
- [ ] 🟡 **Tags (`#tag`)** — **task 205** (plain text today).
- [ ] 🟡 **Obsidian callout compatibility (aliases + fold)** — **task 206**
      (aliases → raw blockquote; `[!note]-` ignored, callouts.ts:48-56).
- [ ] 🟡 **Frontmatter properties + `aliases:`** — **task 207** (cache keys are path-only,
      wiki.ts:58-64).
- [ ] 🟡 **Dataview-style queries** — **task 105** (design-first epic, TODO).
- [ ] ⚪ **Graph view** — **task 208** (echarts already bundled).
- [ ] ⚪ **Daily notes / templates** — **task 209** (createWikiPage hardcodes `# Heading`).
- [ ] ⚪ **Hover preview of linked note** — **task 210**.
- [ ] ⚪ **Unlinked mentions** — **task 211** (depends on 201).

## 4. Broken / half-shipped — user-visible even though "the feature exists"

- [ ] 🔴 **Image dblclick overlay — CSP-bricked editor lockup** + 🟡 **code-block copy
      button CSP-dead** — **task 212** (fix pair; probes = 191 Probe-1/3; CSP hand-verified
      html-builder.ts:54-65).
- [ ] 🟡 **Paste/drop hazard cluster** — owned by **task 191** Probes 2/4/6/14/15/17
      (silent paste desync, Word-HTML paste swallowed, drop desync/`![](x.pdf)`, clipboard
      clobber, collapsed-cut stealth delete). Run probes → fix → promote to nets.
- [ ] 🟡 **Inline HTML `<img>` / data-URI images stripped by the sanitizer** — **task 47**
      (logged 2026-06-01, never scheduled).
- [ ] 🟡 **CommonMark soft line breaks** — **task 83** (design APPROVED 2026-06-13, ready
      to implement, sitting since June).
- [ ] 🟡 **PlantUML `!include` / stdlib (C4, AWS, Azure)** — **task 136** (unverified;
      likely fails with no message).
- [ ] 🟡 **Large files (>700 KB) can't open in split mode** — **task 188** (designed,
      unbuilt).
- [ ] 🟡 **Marp decks** — **task 107** (Phase 1 on unmerged `feat/marp-presentation`).
- [ ] 🟡 **Upload filename sanitize** — **task 191 P1-18** (hand-verified: no `/g`,
      main.ts:527-530; unsanitized join, extension.ts:772).
- [ ] ⚪ **Dirty dot stays after undo-to-saved-state** — **task 181** (parked).
- [ ] 🟡 **Perf frontier** — **tasks 182** (off-thread render worker, spiked + de-risked,
      unimplemented), **168** (open-time lazy render), **164/166** (theme-flip redundant
      re-renders), **167/173-177** (prose-typing rebuild/reflow, architectural).

## 5. UX long tail (parity conveniences)

- [ ] 🟡 **Raster-image UX** — drag-resize = **task 22** (TODO); click-to-zoom =
      **task 217** (⛶ is diagram-only today).
- [ ] 🟡 **Download/localize remote images to assets** — **task 213**.
- [ ] 🟡 **Open-at-line** (search result → editor at line) — **task 52** (scope-extension
      section, absorbed former 214; protocol has only scroll-to-heading today).
- [ ] 🟡 **`webview/context` right-click menu contributions** — **task 215** (menu point
      entirely unused today).
- [ ] ⚪ **Keybinding + palette entry to OPEN vMarkd** — **task 216** (entry is mouse-only;
      upstream had `ctrl+shift+alt+m`).
- [ ] 🟡 **`[](…)` file-path autocomplete** — **task 32** (planned; only the `[[` hint
      exists).
- [ ] ⚪ **CSV/TSV paste → markdown table** — **task 218**; **table column resize** —
      **task 219** (spike-first: markdown can't store widths).
- [ ] ⚪ **Checkbox toggle in Preview / sv right pane** — **task 220** (Lute emits
      `disabled` inputs).
- [ ] ⚪ **Snippets / templates insertion** — **task 221** (hint.extend as the vehicle).
- [ ] ⚪ **Outline: drag heading to restructure** — **task 222**.
- [ ] ⚪ **Rendered side-by-side diff view** — **task 46** (not scheduled).
- [ ] ⚪ **Selection-scoped word count** — **task 223**.
- [ ] ⚪ **Paste URL onto selection → wrap as link** — **task 224** (191 P0-8 pins current
      behaviour; flips when this ships).
- [ ] ⚪ Existing planned long-tail (own tasks): `copyFiles.destination` (**88**),
      line-number gutter (**73**), diagnostics/lint (**55**), secondary-sidebar TOC
      (**34**), Copilot ghost text (**153**), UI localization (**30**), ABC audio
      playback (**143**), D2 layout polish leftovers (**118/122**).

## 6. Cheap wins — the engine already supports it, expose one flag/wire

- [ ] `[toc]` + `==mark==` + sup/sub — **task 225** (Lute probe-verified; sup/sub needs a
      setLute patch + the `~x~` strikethrough conflict decision).
- [ ] `typewriterMode` — **task 197**. Spellcheck attribute flip — **task 195**.
- [ ] Copy-as-HTML/Markdown rewire — **task 53** (restore section). openEditor keybinding +
      palette — **task 216**.
- [ ] **README renderer docs** — **task 226** (README names ~6 of 18 engines).
- [ ] Fork i18n locale-source unification — **task 30 Phase 0** (absorbed former 227;
      `navigator.language` vs `vscode.env.language`; actionable despite 30's parked rest).

## 7. Suggested order (impact-first)

1. **Export HTML/PDF + copy-as-HTML rewire** (both task 53) — the output hole.
2. **Spellcheck** (195) + **find & replace** (196) — daily prose pain.
3. **Wiki trust pair**: rename-refactor (202) + backlinks (201), and the anchor-link BUG
   (203 — a correctness fix, not a feature).
4. **CSP widget fixes** (212) — small, user-visible breakage.
5. **Cheap-win batch**: 225 + 197 + 216 + 226 + 30-Phase-0 (+ the 53 copy restore if not
   done in step 1) — one settings sweep lights them up in about a day.
6. Everything else as probes/decisions unblock (the §4 product decisions live in 191 §5.6).

## 8. Provenance

Workflow `wf_19232dfb-ec4` (5 agents, all repo-verified): full per-lens evidence preserved
in `tmp/192-gap-audit/` (`gap-inventory.md`, `gap-documented.md`, `gap-probes.md`,
`gap-parityDesktop.md`, `gap-parityPkm.md` — gitignored scratch). Hand-verified items:
upload-name sanitize (main.ts/extension.ts read directly), CSP header
(html-builder.ts:54-65), the dead copy-as-HTML route (grep senders → 0). Front matter,
`[toc]`, `==mark==`, sup/sub verdicts come from executing the vendored `lute.min.js` in
Node (probe scripts, not code reading). Spin-off: tasks **193–227** created 2026-07-03;
same day 193/214/227 were merged into pre-existing tasks **53/52/30** (numbers retired) —
remaining new files: 194–213, 215–226.
