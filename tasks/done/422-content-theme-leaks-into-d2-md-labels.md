# 422 — Content themes restyle the inside of D2 `|md|` labels, blowing up node geometry (github)

**Status: ✅ FIXED, verified at all 3 test layers + real-VS-Code e2e.** Reported 2026-07-28 with a
screenshot.

> **2026-07-28 — resolution.** Structural fix landed in `media-src/src/main.css`:
> `.vmarkd-d2-md` is doubled (`.vmarkd-d2-md.vmarkd-d2-md`), lifting it to specificity (0,2,x) —
> this beats every `.markdown-body <tag>` rule (0,1,1)-(0,1,2) in all 5 shipped content themes,
> including `.markdown-body table td` at (0,1,2) in the vscode-2026 themes. `h1`-`h6`
> `padding-bottom`/`border-bottom` are reset explicitly since nothing in `.vmarkd-d2-md` declared
> those properties before (doubling a selector that never set a property can't override it).
> Audited all 5 content themes for anything that could still beat (0,2,x): the only `!important`
> rules in any of them target `.hljs` (code highlighting), and d2 `|md|` labels never carry that
> class — no other rule anywhere exceeds two classes. Confirmed the render-cache `themeKey`
> already folds in `contentTheme` (`vditor-init.ts` → `renderCacheThemeKey`), so no stale-cache
> risk; the extension version bump (1.2.3 → 1.2.4, already landed for other work in this branch)
> additionally invalidates any pre-fix cached SVGs via the cache key's `version` fragment. Fixed
> the now-false "no competing content-theme size rule" comment in both
> `github-markdown-{light,dark}.css`.
>
> **Verified:** `npm run typecheck` clean · full unit suite 1922/1922 green · chromium-harness
> `content-theme.spec.ts` — 5/5 new "immune to `<theme>`" tests green, one per content theme,
> covering `h1`/`h2` size, border, padding, AND table-cell padding · real-VS-Code e2e
> `test/vscode-e2e/d2-md-content-theme.spec.ts` green (asserts the actual github-light-themed
> webview renders the label at `22.4px` with no border/padding, `h1Height < 45px` — i.e. one line,
> not wrapped). The "unit test on `measureMdHtml`'s box" verification item below was intentionally
> done as the harness cascade test instead — this bug is a real browser CSS-cascade effect that a
> jsdom-level unit test can't reliably exercise; the harness test proves the actual computed styles
> under the actual theme link order.
>
> **Not yet done:** package + install a VSIX and get the user's visual confirmation in their real
> editor (next step, see below).

> **Second screenshot, 2026-07-28 (user):** same bug on a DIFFERENT element — a `|md|` label with a
> GFM task list ("Checklist" heading + checkboxes) is similarly blown out of proportion (oversized
> heading, over-spaced checkbox rows) inside a `pipeline` container in what looks like the same
> content-theme leak. This is exactly the "not just h1" risk the Scope section below already calls
> out (`ul`/task-list rules leaking the same way `h1` does) — corroborating evidence, not a new bug,
> no new task filed. Reinforces that the fix must be structural (reset the whole `.vmarkd-d2-md`
> subtree), not a per-tag patch — a `ul`/`li`/checkbox-only fix would just leave the next tag to leak.

## Report

> "na diagramie w stylu github są źle rozłożone boxy, na vscode light jest ok"
> — the `|md` pipeline diagram ("Release checklist" node + "Ship it" box + the `gate` edge label).

On `theme.content: github` the "Release checklist" node is enormous and narrow: the heading wraps
onto two lines, the bullet list is pushed down, and the "Ship it" box below is placed against a node
far taller than it should be — the `gate` label lands on top of the list. On `vscode-light` the same
diagram lays out fine.

## Root cause — confirmed, not suspected

`.vmarkd-d2-md` (`media-src/src/main.css:824-875`) deliberately normalises the typography *inside* a
d2 `|md|` label so the node box is theme-independent: `font-size: 16px`, the D2 font stack, and a
compact heading scale (`h1 { font-size: 1.4em }`), with a header comment stating "typography here
defines the layout box".

**The content theme overrides it.** `media/markdown-themes/github-markdown-light.css` sets:

```css
.markdown-body h1,
.markdown-body h2 { padding-bottom: 0.3em; border-bottom: 1px solid #d1d9e0b3; }
.markdown-body h1 { font-size: 2em; }
```

`.markdown-body h1` and `.vmarkd-d2-md h1` have **identical specificity** (0,1,1), so load order
decides — and the content-theme sheet loads last (the same ordering already documented for
`.markdown-body` vs the bundled content themes). The d2 label lives inside `.markdown-body`, both in
the offscreen measure probe (mounted into `.vditor-reset`, `diagram-engines/d2.ts:80`) and in the
rendered `<foreignObject>`, so the theme reaches it in both.

The screenshot confirms this empirically — **three independent signatures**, each of which our own
CSS never produces:

1. The heading renders far larger than `1.4em × 16px = 22.4px`; it is at github's `2em` = 32px.
2. There is a thin grey rule under "Release checklist" — that is github's `border-bottom` on `h1`.
   `.vmarkd-d2-md` sets no heading border anywhere.
3. The heading face is not the `"Source Sans 3"` stack `.vmarkd-d2-md` declares.

Note the stale comment now sitting directly above the offending rule in the github sheet: *"No
competing content-theme size rule, so no `!important` needed. (task 109)"*. That was true when task
109 wrote it; `.vmarkd-d2-md h1` (task 154) is exactly such a competing rule. Fix the comment too.

## The part that will mislead whoever picks this up

**The measurement is NOT wrong — do not go debugging `measureMdHtml`.** The probe mounts in the same
`.vditor-reset` as the final render precisely so both see the same cascade, and that is working: the
node is *correctly* measured as a genuinely oversized box. Enlarging the heading by 43% (22.4 → 32px)
plus 0.3em padding and a border pushes "Release checklist" past the hardcoded `max-width: 420px`
(`diagram-engines/d2.ts:78`), so it wraps to two lines and the node grows tall. Layout then places
"Ship it" and routes the `gate` edge against that inflated box. The bug is upstream of layout and
upstream of measurement: it is a **CSS scoping leak**.

## Scope

- [x] Stop content themes from styling the *inside* of `.vmarkd-d2-md`. Structural fix: doubled the
      class (`.vmarkd-d2-md.vmarkd-d2-md`, specificity (0,2,x)) so it beats every `.markdown-body
      <tag>` rule in every shipped theme, including 2-class rules like `.markdown-body table td`
      (0,1,2) — covers `ul`/`ol`/`code`/`pre`/`blockquote`/`table`, not just `h1`, and protects any
      *future* content-theme rule too, not just today's known offenders. `h1`-`h6`
      `padding-bottom`/`border-bottom` still needed an explicit reset (doubling can't override a
      property `.vmarkd-d2-md` never declared).
- [x] **Audit every content theme, not just github.** All 5 shipped themes checked
      (github-markdown-{light,dark}, vscode-{light,dark}-2026, material-dark): none carry a rule
      that beats (0,2,x) — the only `!important` uses anywhere target `.hljs`, which d2 `|md|`
      labels never carry. All 5 covered by `content-theme.spec.ts`'s per-theme loop.
- [x] Fix the now-false "no competing content-theme size rule" comment in both
      `github-markdown-light.css` and `github-markdown-dark.css`. The `main.css` block above
      `.vmarkd-d2-md` already documents the doubling/why in detail (added alongside the fix).
- [x] Bump the extension version (1.2.3 → 1.2.4, landed alongside other work on this branch) —
      invalidates any pre-fix cached SVGs via the cache key's `version` fragment. Confirmed
      `contentTheme` is already part of the cache `themeKey` (`vditor-init.ts` →
      `renderCacheThemeKey`) — not a second bug, no code change needed there.

## Verification

- [x] Cascade-cascade proof done via the chromium harness instead of a `d2-render.ts` unit test
      (this is a pure CSS-cascade bug, not JS logic — a jsdom unit test can't exercise real
      specificity/load-order the way a browser can). `content-theme.spec.ts` asserts `h1`/`h2`
      size, border, padding, AND table-cell padding are un-leaked, once per content theme (5/5
      green).
- [x] Real-VS-Code e2e: `test/vscode-e2e/d2-md-content-theme.spec.ts` renders the fixture under
      `theme.content: github-light` and asserts the label's computed `font-size`/`border`/`padding`
      match `.vmarkd-d2-md`'s own scale and `h1Height < 45px` (one line, not wrapped). Green via
      `node build.mjs` then `xvfb-run -a npm --prefix test/vscode-e2e test -- d2-md-content-theme.spec.ts`.
- [ ] Package + install the VSIX and have the user confirm the github case in their real editor —
      in progress, see status note above.

## See also

- `media-src/src/main.css:819-875` (`.vmarkd-d2-md`), `media-src/src/diagram-engines/d2.ts:74-123`
  (`measureMdHtml` / `enrichMarkdownLabels`), `media-src/src/d2-render.ts:750-757` and `:1830-1841`
  (mdSize → node box → `<foreignObject>`).
- `media/markdown-themes/github-markdown-light.css:20-30` — the leaking rules.
- **[Task 395](395-d2-layout-too-cramped.md)** — the same diagram, same crowding complaint, filed
  when the cause was unknown. 395 guessed at "`|md` nodes of variable height feeding the layout
  engine"; that guess was directionally right but the *reason* the node is oversized is this CSS
  leak. **Re-check 395 after this lands** — part or all of it may simply disappear, and what remains
  will be a much smaller, cleaner problem.
- [Task 402](402-main-css-adr0003-audit.md) / ADR-0003 — the CSS theming architecture this fix must
  be consistent with; read it before picking between the structural options above.
- [Task 154](154-d2-markdown-labels.md) — the feature whose typography contract this defends.
