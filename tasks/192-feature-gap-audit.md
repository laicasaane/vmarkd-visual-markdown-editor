# Task 192 — feature-gap audit: what VMDE lacks (user-facing backlog)

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
> the numbers 193/214/227 are retired gaps. A same-day broad sweep (§10) added tasks
> **239–269**, including six probe-verified BUGS (239-244). Impact tags: 🔴 high · 🟡 med · ⚪ low (frequency ×
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
- [ ] ⚪ **Keybinding + palette entry to OPEN VMDE** — **task 216** (entry is mouse-only;
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
remaining new files: 194–213, 215–226. Persona addendum (§9) added the same day → tasks
**228–238** (+ folds into 53/213/226/105).

## 9. Persona addendum — developers & project managers (2026-07-03)

Second-pass gap analysis through the dev/PM persona lens (follow-up session; claims
verified: `:::note` stays literal in Lute, task metadata is plain text, zero tracker-link
code, mermaid **11.15.0** bundled). New items → **tasks 228–238**; fits folded into
existing tasks where they belonged.

**Already have, undocumented:** mermaid 11.15 ships gantt, timeline, kanban (static),
user journey, quadrant, pie, sankey — the PM diagram kit exists; folded into **task 226**
(README) as an explicit types list.

Developers:
- [ ] 🔴 Issue-tracker smart links `#123`/`PROJ-456` — **task 228** (shared with PMs).
- [ ] 🟡 Clickable code refs `src/foo.ts:123` → text editor at line — **task 229**.
- [ ] 🟡 Live code-snippet transclusion from source files — **task 230**.
- [ ] 🟡 Docusaurus/MkDocs admonitions `:::note` — **task 231** (verified literal today).
- [ ] ⚪ OpenAPI/Swagger fence renderer — **task 232** (evaluate-first).
- [ ] ⚪ Blocked remote images (README badges) affordance — folded into **task 213**.
- [ ] ⚪ Run code blocks (RunMe-style) — **task 238** (design-first epic, security-gated,
      park-able; decision gate before any code).
- Existing tasks already covering this persona: 55 (lint/diagnostics), 73 (gutter),
  46 (rendered diff), 153 (ghost text), 136 (PlantUML C4 verify), 194 (diagram export),
  196 (replace), 221 (snippets).

Project managers:
- [ ] 🔴 Kanban board view over task lists — **task 233** (design-first; interop with the
      Obsidian Kanban file convention; NOT the static mermaid kanban).
- [ ] 🟡 Task metadata chips (due 📅 / priority / @assignee, Obsidian-Tasks tokens) —
      **task 234** (feeds 105 + 233).
- [ ] ⚪ Checklist progress indicators (`7/12` per section + status-bar rollup) —
      **task 235**.
- [ ] ⚪ Table formulas (TBLFM subset) — **task 236** (evaluate-first, park-able).
- [ ] ⚪ Review annotations (HTML-comment-based, async) — **task 237** (design-first;
      real-time collab is architecturally out — Live Share can't reach custom editors).
- [ ] DOCX-for-stakeholders via detected pandoc — folded into **task 53** (optional scope).
- Existing tasks already covering this persona: 105 (dataview queries), 107 (Marp decks),
  209 (daily notes/templates), 205/207 (tags/properties), 220 (Preview checkbox toggle),
  53 (export).

Persona top-5 (impact-first): 228 tracker links → 233 kanban → 229+230 docs-as-code pair →
234+235 task metadata/progress → 136+194 (C4 verify + diagram export).

## 10. Broad sweep addendum (2026-07-03) — 6 fresh lenses → tasks 239–269

Workflow `wf_8199eb4f-095` (6 lenses: VS Code extension ecosystem, Notion/HackMD/Zettlr
class, tech-writer/academic persona, empirical Lute syntax probes, platform+a11y,
housekeeping+AI). Full evidence in `tmp/192-gap-audit/sweep-*.md`. Headline: the sweep
found **probe-verified corruption-class BUGS**, not just features.

**Bugs (fix-class, most severe first):**
- [ ] 🔴 Indented 4-space code blocks DESTROYED by the IR save path — **task 239**.
- [ ] 🔴 Reference-link def titles dropped / leaked into prose — **task 240**.
- [ ] 🔴 Keyboard trap + mouse-only affordances (WCAG) — **task 244**.
- [ ] 🟡 Merge-conflict markers mangled on save (+ garbage render) — **task 241**.
- [ ] 🟡 ANSI escape bytes leak into saved markdown on paste — **task 242**.
- [ ] 🟡 `[x](#heading)` never navigates + `{#custom-id}` half-state — **task 243**.

**Academic / tech-writer layer:** citations `[@key]`+bibliography — **245** (design-first);
numbered equations `\eqref` — **246**; figure/table captions+cross-refs — **247**; KaTeX
completion in math — **248**; CriticMarkup track changes — **249** (also fixes the mangled
`{~~sub~~}` render; 237 design must weigh adopting its comment mark); heading numbering —
**250**; print CSS + page-breaks — **251** (the missing half of 53's PDF); export-flatten
embeds (book compile) — **252**.

**MAIO parity:** in-source TOC between markers — **253**; heading promote/demote — **254**;
list renumber command — **255**; sv table formatter — **256** (near-free, Lute already
normalizes).

**Notion/HackMD class:** `<details>` toggle broken in IR + authoring — **257**; section
folding — **258**; block drag handles — **259**; plain-markdown presentation mode — **260**
(delta vs Marp 107); writing goals — **261**; prose style check + readability — **262**;
block references `^id` — **263** (203/204 deferred it, now owned).

**Platform + a11y:** web extension (vscode.dev — audited feasible, no child_process) —
**264**; screen-reader semantics batch — **265**; prefers-reduced-motion — **266**;
high-contrast/forced-colors (HC currently collapses to dark) — **267**.

**Housekeeping + AI:** vault health report (orphaned assets + workspace dead links +
stats, ONE scan) — **268**; AI selection transforms (vscode.lm-first; prose→diagram
validated by real render) — **269**.

**Folded into existing tasks:** asset-rename rewrite → 202; zettelkasten IDs → 209;
mhchem/details docs + regression nets + kbd dark fix → 226; CriticMarkup-as-syntax
consideration → 237; print/flatten cross-refs → 53.

**Exists-undocumented (found working):** mhchem chemistry `$\ce{}$`, `<details>` in
Preview, `~~~` fences, footnotes in tables/callouts, `<ruby>`, HTML tables with
rowspan/colspan → 226's companion nets.

**Considered and REJECTED (recorded so nobody re-audits):** definition lists (Lute can't,
225 already adjudicated), abbreviations `*[X]:` (visible-leak is honest; preview-only
transform not worth it), book mode prev/next (thin value in VS Code), Craft block styles
(not markdown-portable).

## 11. Marketplace mining addendum (2026-07-03) — real extension data → tasks 270–283

Workflow `wf_5a8394ab-9fa` (5 web-grounded lenses: MPE+Quarto deep-dive, editing
utilities, images/media, export/publishing, notes/todo/misc; install counts as demand
proof). Evidence in `tmp/192-gap-audit/mkt-*.md`.

New tasks:
- [ ] 🔴 draw.io/Excalidraw editable-image bridge (`.drawio.svg` pattern; 4M+0.5M
      installs) — **task 270**.
- [ ] 🔴 PDF export pipeline (header/footer/page numbers via detected local Chromium;
      yzane 3.9M installs) + whole-doc PNG — **task 271** (depends 53+251).
- [ ] 🔴 Workspace tasks tree view (Todo Tree class, 7.6M) — **task 272** (consumes 234's
      records; 233/105 stay distinct).
- [ ] 🟡 Rewrap to column for sv (stkb.rewrap, 862K) — **task 273**.
- [ ] 🟡 Document bookmarks (alefragnani 5M, inert in our webview) — **task 274**.
- [ ] 🟡 Reading-position memory (getState/setState declared, never called) — **task 275**
      (shares 274's block-anchor module).
- [ ] 🟡 Extract selection → new note + `[[link]]` (kortina 99K) — **task 276**.
- [ ] 🟡 Paste-image naming template + confirm (mushan 715K) — **task 277**.
- [ ] 🟡 Remote image upload targets via one trust-gated command (PicGo class) —
      **task 278**.
- [ ] 🟡 Quarto code annotations (`# <1>` → numbered callouts) — **task 279**.
- [ ] ⚪ Copy as Confluence/Jira markup (~44K combined) — **task 280**.
- [ ] ⚪ Sort list items (nested-aware) — **task 281**.
- [ ] ⚪ Default open mode setting (`ir|wysiwyg|sv|preview`; hnw 658K) — **task 282**.
- [ ] 🟡 Video/audio insert routing (render works, pipeline inserts `![](x.mp4)`) —
      **task 283** — the §10 probe finding that fell through the 239-269 batch.
- [ ] 🟡 Auto-renumber ordered lists on edit — **task 284** (MAIO-comparison follow-up;
      probe disproved task 65 #9's "Lute-side" theory — Lute normalizes on spin, the stale
      paths are our spin-bypassing edits; rides 255's engine).

Folded into existing tasks: **rich-text clipboard flavor** (webview ClipboardItem — our
structural advantage over the per-OS-hack extensions) + export extras (front-matter
config, pandoc picker, self-contained HTML, on-save, batch) → 53; import dispatch
(.csv→table, diagram files→engines) → 230; footnote hover (cheapest popover case, build
first) → 210; done-date stamp + 🔁 recurrence → 234 phase 2; tabsets + conditional/asides
→ 231 phase 2; SVGO + batch re-encode (+stale-status note) → 74; column/row MOVE
commands → 219; Front-Matter-CMS slices (draft badge, SEO hints, open-on-local-site) →
207; calendar sidebar → 209; URL title unfurl (no-selection branch, opt-in OFF) → 224;
AI alt-text → 269.

**Considered and REJECTED:** Markdown Shortcuts / keyboard checkbox toggle / checkbox
stats / Excel-TSV paste / emojisense / footnotes / smart HTML paste / incremental preview
search / VSNotes (all already covered or shipped); Front Matter CMS vault surfaces
(coexists fine — only the three 207 slices); markwhen fence renderer (14.9K installs,
mermaid timeline/gantt covers the basics — backlog note only); tldraw (.tldr is not an
embeddable image); base64-embed paste (252 covers portability).

## 12. WYSIWYG-editor audit addendum (2026-07-03) — frameworks + block family → tasks 285–300

Workflow `wf_17bb202b-813` (4 web-grounded lenses: editor frameworks
Tiptap/BlockNote/Milkdown/ProseMirror/Lexical, block family SiYuan/Logseq/AppFlowy/Anytype
— SiYuan is our engine authors' flagship, desktop long tail, micro-interactions second
pass). Evidence in `tmp/192-gap-audit/wys-*.md`. Strongest signal: the **bubble toolbar
was flagged independently by three lenses**; plus one more silent-corruption BUG.

New tasks:
- [ ] 🔴 Floating (bubble) toolbar on selection — **task 285** (3-lens signal).
- [ ] 🔴 BUG: Home/End caret lands inside hidden 0-width markers → silent syntax
      corruption; + traversal flash — **task 286** (selectionchange-driven expandMarker).
- [ ] 🔴 Paste as plain text Ctrl+Shift+V — **task 287** (no plain branch exists today).
- [ ] 🔴 Structural selection: staged Esc/Ctrl+A, Typora Ctrl+E/D/L scope-select,
      triple-click normalize, copy-block-as-md — **task 288** (Esc is a dead key today).
- [ ] 🟡 Section hoisting / zoom-in with breadcrumb exit — **task 289** (SiYuan/Logseq;
      shares 258's engine).
- [ ] 🟡 Sticky heading breadcrumb — **task 290** (the ONLY breadcrumb we can ever have —
      task 78 proved native ones stay empty for custom editors).
- [ ] 🟡 Flashcards / spaced repetition (Obsidian-SR-compatible, file-based) — **task 291**
      (design-first).
- [ ] 🟡 Void-block interaction: generalized gap cursor + node selection — **task 292**
      (closes the task-100 bug class).
- [ ] 🟡 Undo grouping boundaries (one 800ms timer today; paste/Enter/commands merge with
      typing) — **task 293**.
- [ ] 🟡 IME composition guard audit (1 of ~6 capture-phase interceptors guarded) —
      **task 294** (upgrades the 190 §5 probe).
- [ ] 🟡 Per-folder resource-scoped settings (folder overrides SILENTLY IGNORED today —
      only 7 props scoped) — **task 295** (correctness-flavoured).
- [ ] ⚪ Hemingway no-delete drafting mode — **task 296**.
- [ ] 🟡 Link edit popover in IR (Open/Copy/Edit/Unlink balloon) — **task 297** (shares
      285's overlay primitive).
- [ ] 🟡 "Turn into" block transform menu — **task 298** (surfaces in 285/259/215).
- [ ] ⚪ Placeholder text (Vditor's own option exists UNUSED + per-block CSS hint) —
      **task 299**.
- [ ] ⚪ Content-width presets (generalize fullWidth) — **task 300**.

Folded into existing tasks: cell-range selection (NO merge — GFM can't) → 219; slash-menu
sections/aliases/MRU → 221; drop-cursor + handle click-menu → 259; focus granularity enum
→ 198; pre-commit math bubble + Ctrl+M → 248; dblclick-image→VS Code viewer → 217;
editable grid/board/calendar write-path + "blocks" output mode → 105 design inputs;
kramdown IAL (our Lute ships SetKramdownIAL unused — 280 hits!) → 263 design input;
SiYuan inline-memo rendering for comments → 249 (+237 coordination); rendered backlink
context v2 → 201; bullet folding phase 2 → 258; stats panel (sentences/WPM/readability
number) → 261.

**Considered and REJECTED (recorded):** publish-to WordPress/Blogger class (fights the
offline ethos; only slice that fits = an opt-in GitHub-Gist command via built-in VS Code
auth — revisit on demand); workspace-JS custom renderers (fights CSP/148; if ever, only a
host-mediated extension API); Anytype typed-object model (needs a database; sliver =
type-template hints in 207); native Alt+drag box selection (contenteditable-impossible,
same verdict as multi-cursor; fake CellSelection in 219 is the viable form); source-peek
on hold-key (exists nowhere — a Bear feature REQUEST; our IR+sv already cover the need);
Bear's new Lettera editor (June 2026) — re-scan once it ships broadly.

## 13. Creative ideation — 💡 IDEA cards 301–333 (adopt-or-park, NOT commitments)

Workflow `wf_aaa4cd22-222` (5 divergent creative lenses; evidence in
`tmp/192-gap-audit/idea-*.md`). **These are a DIFFERENT class from tasks 193-300:** each
file is an idea card with status `💡 IDEA — TO CONSIDER: adopt or park`, a
what-it-is/effect explanation, novelty claim, repo-grounded feasibility, an HONEST value
judgement, and an explicit ADOPT/PARK decision box. Nothing here is scheduled; adopting
one means promoting it to a scoped task, parking one means recording why in its file.

**Only-VMDE combos** (our engines × git × cache × wiki index):
301 Diagram Diff Lens · 302 Diagram Time Machine · 303 Doc Time Machine ·
304 Prose Merge (241's deluxe path) · 305 Live Fences (workspace truth) ·
306 Reflective self-fences · 307 Symbol-Bound Prose (LSP doc-rot) ·
309 Wiki-wired diagrams · 333 AI Diagram Medic (269 rider).

**Docs-ops stack:** 308 Freshness stack (contract·radar·digest·reverse-impact — the
highest-leverage cluster) · 318 Prose Blame · 319 Terminal capture · 320 Debug Journal ·
321 Self-healing refs (229's maintenance half) · 322 Glossary+time-bomb ·
323 docs-health.md · 324 Changelog+undocumented · 325 ADR lifecycle+drift.

**Writer's studio:** 310 Corkboard · 311 Takes · 312 Draft snapshots+rendered diff ·
326 Fresh ink+sprints · 327 Teleprompter · 328 Read-aloud · 329 Comfort pack ·
330 Writing replay · 332 Ambience micro-pack (confetti/emoji-rain KILLED inside).

**Numbers & play:** 313 Calc+unit chips (best value-per-effort) · 314 Table view
controls · 315 Micro-viz pack · 316 Chart-this-table · 317 ASCII lifter ·
331 Dice kit.

Curator's shortlist if only a few get adopted: **301** (best wow-per-hour — both SVGs
usually cached), **305** (highest daily value), **313** (cheapest daily-driver),
**308** (highest team leverage), **310+311** (the writer-persona magnet), **304** (rides
the 241 fix).

## 14. Real-usage audit — 💡 IDEA cards 334–346 (adopt-or-park)

Second ideation pass from a different axis: WHERE markdown actually lives in 2026
(AI prompts/agent files, web textareas, capture inboxes, life documents, doc
translations) rather than what competitors ship. Same adopt-or-park card format as §13.

**AI-era markdown** (the freshest cluster — we're our own target user): 334 LLM token
counter (status bar) · 335 "paste from AI chat" cleaner (the stereotyped breakage:
```markdown wrapper, broken nested fences) · 336 agent-files mode (CLAUDE.md/AGENTS.md
resolved-@include preview — this repo's own chain proves the need) · 337 prompt library
({{vars}} on 209/221's expander).

**Textarea-bound markdown:** 338 target-dialect preview ("render like GitHub will" —
the 83 softbreak delta is the proven bite) · 339 copy as Slack/Discord (280 rider).

**Capture:** 340 quick capture + send-selection-to-note (org-capture; host-only, works
with no VMDE editor open — top stickiness-per-cost with 334).

**Life documents** (real communities, mostly riders): 341 CV print theme (271 rider) ·
342 invoice/letter workflow (313+271 showcase) · 343 recipe mode (servings scaler on
313's recognizer) · 344 ChordPro song sheets + transpose (best community-per-cost of the
niche dialects; engine candidate) · 345 Fountain screenplay (after 344 validates).

**Docs i18n:** 346 translation-pair drift (the 308 stack on a language-pair axis).

**Folded into existing (2026-07-04):** the "first 5 minutes" onboarding idea →
**task 54 Part C** (welcome.md live showcase seeded from the all-renderers fixture +
first-run toast + `vmde.openWelcome`; drift-guarded against engine-registry via 226's
doc-sync test). Remaining unexplored angles recorded for a future pass: vault IMPORT
(Notion/Evernote/Confluence migration cleaner) and secret/PII scanning in notes (268
rider) — deliberately not carded yet; discovery has hit diminishing returns, triage is
the next move.
