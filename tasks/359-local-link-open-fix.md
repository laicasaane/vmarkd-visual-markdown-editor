# Task 359 — FIX: opening local / relative links (`Uri.parse` → `Uri.file`, resolved-href leak, schemes, dirs)

**Status:** planned — BUG/fix, probe-first · **Impact:** 🟡 med (every relative link in a doc tree) · **Origin:** fork re-scan 2026-07-23 (upstream PR #162, `out/fork-rescan-2026-07-23.md`) · **Related:** 243 (fragments), 62 (modifier policy)

## Problem

Upstream merged a rewrite of its local-link opener (#162, `openMarkdownLink`) because
`vscode.open(vscode.Uri.parse(resolvedPath))` is wrong. Our code has the **same shape** plus a
second suspect the upstream fix does not have:

1. **`Uri.parse` on a filesystem path** — `src/extension.ts:815-817`:
   ```ts
   const local = NodePath.resolve(NodePath.dirname(this.activeFsPath), href)
   await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(local))
   ```
   `Uri.parse` is for URI *strings*: on Windows `C:\dir\a.md` parses with scheme `c`; a POSIX
   path containing `#`, `?` or `%` splits into fragment/query/percent-decodes. `Uri.file` is the
   correct constructor.
2. **The webview posts a browser-RESOLVED href** — `media-src/src/link-click-fix.ts` sends
   `linkElement.href` (an `HTMLAnchorElement.href` is always absolute). Inside the webview a
   relative `./notes/a.md` therefore resolves against the webview origin
   (`https://file+.vscode-resource.vscode-cdn.net/…`) and reaches the host as **`https:`**, which
   `onOpenLink` (`src/extension.ts:809-813`) routes to `env.openExternal` — i.e. a local link may
   open the OS browser instead of the file. The IR marker path (`link-click.ts`) posts the raw
   marker text and is unaffected; the exposure is WYSIWYG/SV/preview anchors. **Must be probed
   before fixing** — the CSP/`<base href>` setup may already neutralise it.
3. **No scheme, directory or missing-target handling** — `mailto:`/`vscode:`/`command:` hrefs fall
   into the local-path branch; a directory target and a non-existent file both produce a raw VS Code
   error instead of `revealInExplorer` / a readable message.

## Scope

- [ ] **Probe first (blocking):** in the real webview, click a relative link in each surface
      (IR / WYSIWYG / SV / preview) and log what `open-link` carries. Pins #2 as real or dead —
      and, critically, establishes **which surface routes through which host branch**: bugs #1 and
      #2 are on different paths (a resolved `https:` href short-circuits into `openExternal` and
      never reaches the `Uri.parse` line), so fixing one and re-testing the other surface would
      look like success while the second path stays broken.
- [ ] Webview: post the **raw** `getAttribute('href')` (fall back to the resolved `href` only for
      SVG anchors, which already take the attribute path), keeping the task-62 modifier policy and
      the wiki-chip branch untouched.
- [ ] Host `onOpenLink`: `Uri.file` for filesystem paths; keep `env.openExternal` for `http(s)`;
      pass other well-formed schemes (`mailto:`, `vscode:`, …) to `vscode.open` unparsed; refuse
      `command:`; percent-decode a relative href before resolving it against the doc dir (a link to
      `my%20file.md` must find `my file.md`).
- [ ] Directory target → `revealInExplorer`; missing target → one readable `showError` naming the
      resolved path (today: silent failure / raw error).
- [ ] Leave the `#fragment` half to task **243** — but make the two land on one helper so
      `file.md#heading` is not split across two implementations.

## Out of scope

- Wiki links (`open-wikilink`, own path), fragment resolution (243), link autocompletion (32).

## Verification

- L1: unit the href classifier (windows path / posix path / spaces+percent / `mailto:` / `http` /
      `command:` / directory) — pure function, no VS Code needed.
- L2: harness — a click in each surface posts the RAW href.
- L3 real-VS-Code (mandatory): fixture doc with `./sub/a.md`, `../b.md`, `my file.md`, a directory
      link, a missing file and an `https://` link; assert the file ones open the right tab, the
      missing one shows the message, and the http one does **not** open a tab.
