# Task 358 — Upstream re-sync review (zaaack 0.1.15 → 0.1.19)

**Status:** planned — review/umbrella · **Impact:** 🟡 med (free fixes + a moved compare base) · **Origin:** fork re-scan 2026-07-23 (`out/fork-rescan-2026-07-23.md`)

## Problem

The upstream we forked (`zaaack/vscode-markdown-editor`) was dormant at `0.1.14` (2026-02-09)
when the June fork surveys ran. Between 2026-06-13 and 2026-07-20 it **renamed its default
branch `master` → `main`** and shipped **0.1.15 … 0.1.19** from 8 merged community PRs. Three
of those PRs implement things that are **open tasks of ours**, so the cheapest available work in
the backlog right now is reading their diffs before writing our own version.

We do **not** merge upstream (we diverged ~43 commits at the fork point and rewrote most of the
webview) — this task is *read the delta, port what is cheaper to port than to invent*.

## Scope

- [ ] Record the base-branch move: every future `compare` must use `zaaack:main`, not `master`
      (the June scripts silently 404'd on `master` until this was noticed).
- [ ] Read the diff of each merged PR and either port, reject-with-reason, or attach it as prior
      art to the owning task (the mapping below is already verified):

| Upstream PR (release) | Our owner |
|---|---|
| #163 in-editor find bar via CSS Custom Highlight API (0.1.17) | task **196** (find & replace) |
| #157 source-accurate line numbers (0.1.15) + #164 gutter drift fix (0.1.18) | task **73** (line-number gutter) |
| #165 TOC / in-page anchor links do nothing when clicked (0.1.18) | task **243** (our probe-verified BUG) |
| #166 preserve scroll across file switches + FOUC (0.1.18) | task **275** (reading-position memory) |
| #167 preserve full editor width by mirroring vditor's centering padding (0.1.19) | task **300** (content-width presets) |
| #162 `defaultOpenOutline` + local-link/URI open fix (0.1.16) | outline = shipped (task 08); link half → task **359** |
| #153/#154 find widget + auto-focus editor on open/re-reveal (0.1.15) | find widget = shipped (task 01); auto-focus = decide (we deliberately avoid focus-stealing, `webview-focus-scroll` notes) |
| #168 CI → pnpm | not applicable (own toolchain, task `toolchain-plain-node-npm`) |

- [ ] Decide on the **auto-focus-on-open** behaviour explicitly (adopt behind a setting / reject) —
      it is the one merged UX change with no task of ours and a known conflict with our
      focus-scroll findings.
- [ ] Keep this file as the standing **upstream watch**: on each re-scan append the release range
      reviewed and the verdict per PR, so the next pass starts from a known cursor.

## Verified NOT applicable (do not re-audit)

- **`avargaskun` fix: external file changes not shown while the editor tab is focused**
  (2026-07-21). Upstream drops every external change while `webviewPanel.active` and patches it
  with an `isExternalReload` (`!isDirty`) escape hatch. Our sync has no visibility gate at all:
  `onDidChangeTextDocument` (`src/extension.ts:1069`) dedups by *content* against
  `pendingWebviewContent`/`lastSyncedContent` and there is a `FileSystemWatcher` on top
  (`setupFileWatcher`, `src/extension.ts:469-485`). Different architecture — the bug cannot occur here.
- **`vscode-ext-studio/vditor`** (webpack→vite, CodeMirror-backed IR code blocks): 300 commits
  behind upstream and it replaces the IR code surface we deliberately own (`code-source.ts` +
  WYSIWYG hljs). Reference only.
- **`shiyou0130011`** (zh-TW wording), **`zxniuniu`** (echarts CDN pin), **`mahirhir`**
  (dependabot/reverts): nothing.

## Out of scope

- Merging or rebasing onto upstream; adopting their build/CI; the `huangko555` gutter work
  (attached to task 73 as prior art, not ported wholesale).

## Verification

Per ported item the owning task's own verification applies. For this file: the PR table has a
verdict on every row and the "upstream watch" section names the last reviewed release (`0.1.19`,
`main` @ 2026-07-20).
