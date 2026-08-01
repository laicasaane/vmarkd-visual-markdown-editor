# Task 359 — FIX: opening local / relative links (`Uri.parse` → `Uri.file`, resolved-href leak, schemes, dirs)

**Status:** done — probed, fixed, tested (L1/L3 green; L2 substituted, see Verification); adversarial
follow-up review measured a confused-deputy hole in the `vscode:` scheme allowlist entry and it was
removed (see "Follow-up" below) · **Impact:** 🟡 med (every relative link in a doc tree) · **Origin:** fork re-scan 2026-07-23 (upstream PR #162, `out/fork-rescan-2026-07-23.md`) · **Related:** 243 (fragments, still open — this task only shares the path/fragment split helper with it), 62 (modifier policy, untouched)

## Problem

*(Note: the file:line references below are from when this task was filed. Task 405 has since
extracted this logic out of `extension.ts` into `src/asset-link-actions.ts`
(`AssetLinkActions.onOpenLink`) — same bugs, new location; the fix below is against the current
location.)*

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

## Probe results (measured, real VS Code, `test/vscode-e2e/local-link-open-probe.spec.ts`)

Fixture: `# Local links probe` with `[relative](./sibling.md)`, `[anchor](#target)`,
`[mail](mailto:test@example.com)`, `[web](https://example.com)`; `sibling.md` exists on disk.
Ctrl+click each link (task-62 modifier policy) in WYSIWYG and split-SV's Preview pane; watched
`vscode.window.tabGroups` for new tabs and patched `vscode.env.openExternal` /
`showErrorMessage` **on the extension-host side** (plain mutable objects there, unlike the
webview's `acquireVsCodeApi()` handle — see the aside below).

| link | raw `getAttribute('href')` | resolved `.href` (WYSIWYG/Preview) | host branch that actually ran |
|---|---|---|---|
| `./sibling.md` | `./sibling.md` | `https://file+.vscode-resource.vscode-cdn.net/<dir>/sibling.md` | **`env.openExternal`** with that resolved URL — confirmed via the patched host fn. A real local file link never reaches the local-open branch. |
| `#target` | `#target` | `https://file+.vscode-resource.vscode-cdn.net/<dir>/#target` | **`env.openExternal`** — same leak; a same-document anchor tries to open the OS browser on a broken `vscode-resource:` URL. |
| `mailto:test@example.com` | `mailto:test@example.com` | `mailto:test@example.com` (unchanged — already absolute) | **local-path branch** (`Uri.parse`) — no `openExternal` call, instead a NEW TAB opened with fsPath literally `.../mailto:test@example.com`. Confirms bug #3 (no scheme allowlist): `mailto:` was never `https?:`, so it fell straight into the file-resolution code and got treated as a literal filename. |
| `https://example.com` | `https://example.com` | `https://example.com/` (unchanged) | `env.openExternal` — correct, pre-existing behaviour, not a bug. |

**IR**: link markers are `<span data-type="a">…</span>` with `hasHrefAttr: false` (no `href`
attribute at all) — confirmed NOT a real anchor, so `link-click.ts`'s marker path (raw
`textContent`) is what runs there; the `getAttribute('href')`-based routing this task changes
never touches IR. **SV's source pane** (`.vditor-sv`) renders raw markdown text (no `a[href]`
at all) — only its paired Preview pane (real `<a>`, same code path as WYSIWYG) is affected.

**Conclusion**: bug #2 is real and is the DOMINANT path for WYSIWYG/SV-preview — every plain
relative/anchor link currently leaks into `openExternal` (in real desktop VS Code this pops the
"Do you want Code to open the external website?" confirmation dialog on a garbage URL, it's not
silent) and NEVER reaches the `Uri.parse` line bug #1 describes. Bug #1 only fires for links
whose resolved href does NOT start with `http(s)` — which real-world only happens for `mailto:`/
`vscode:`/other-scheme links, confirming bug #3 (missing scheme handling) is what actually
exposes bug #1 today, not path-shaped hrefs. Fixing #2 alone (post the raw attribute) is what
makes local files reach the `Uri.file`/scheme-classifier logic (#1/#3) at all — the two fixes
are dependent, not independent, exactly the ordering risk the task called out.

**Aside**: `window.vscode.postMessage` (the webview's `acquireVsCodeApi()` handle) is a
**non-writable** property in real VS Code (`Object.getOwnPropertyDescriptor(...).writable ===
false`) — monkey-patching it to intercept posted messages silently no-ops (no throw). Message
interception from the webview side is not viable for future probes; use extension-host-side
patching (`vscode.env`/`vscode.window`, plain mutable objects there) plus tab-list/DOM
before/after diffing instead, as this probe does.

## Scope

- [x] **Probe first (blocking):** in the real webview, click a relative link in each surface
      (IR / WYSIWYG / SV / preview) and log what `open-link` carries. Pins #2 as real or dead —
      and, critically, establishes **which surface routes through which host branch**: bugs #1 and
      #2 are on different paths (a resolved `https:` href short-circuits into `openExternal` and
      never reaches the `Uri.parse` line), so fixing one and re-testing the other surface would
      look like success while the second path stays broken.
- [x] Webview: post the **raw** `getAttribute('href')`. Implemented as `rawHrefOf()` in a new
      `media-src/src/raw-href.ts` (`link-click-fix.ts`'s `a[href]` branch just calls it) — the
      selector `a[href]` already guarantees the attribute exists for BOTH HTML and SVG anchors,
      so (unlike the task text's phrasing) no fallback to `.href` is needed for either; SVG
      behaviour is provably unchanged (same `getAttribute` call it always used). Task-62 modifier
      policy and the wiki-chip branch untouched (not in the diff).
- [x] Host `onOpenLink`: `Uri.file` for filesystem paths; `env.openExternal` for `http(s)`
      unchanged; percent-decode a relative href before resolving it (a link to `my%20file.md`
      finds `my file.md`). **Deviation from the literal task wording**, flagged and resolved via
      review before implementing: "pass other well-formed schemes to `vscode.open` unparsed" is a
      denylist (`command:` excluded) — but that shape lets `[x](file:///etc/passwd)` classify as
      "just another scheme" and open ANY file on disk, walking straight past the containment check
      three lines below (the exact hard-rule violation this task was told to treat as a security
      boundary). Implemented as an **allowlist** instead (`src/link-target.ts`,
      `SAFE_SCHEMES = mailto/tel/vscode/vscode-insiders`) — everything else with a scheme
      (`command:`, `javascript:`, `data:`, `file:`, `vscode-resource:`, `vscode-webview:`,
      `vscode-file:`, unknown schemes) is refused, not just `command:`.
- [x] Directory target → `revealInExplorer`; missing target → one readable `showError` naming the
      resolved path (previously: silent failure / raw error).
- [x] Fragment helper shared with task **243**: `classifyHref()` splits `file.md#heading` into
      `{path, fragment}` in ONE place (before percent-decoding, so `my%23file.md` decodes to a
      literal `#` rather than being mistaken for a fragment delimiter) and classifies `#heading`
      alone as `same-doc-anchor`. 243 itself (resolving the fragment / scrolling) is NOT
      implemented here — `onOpenLink` no-ops on `same-doc-anchor` rather than the pre-fix
      behaviour of trying and failing to open a file literally named `"#heading"`.

## Out of scope

- Wiki links (`open-wikilink`, own path), fragment resolution (243 — the anchor/heading nav
  itself, only the path/fragment SPLIT is shared), link autocompletion (32).

## Verification

- [x] L1: `test/backend/link-target.test.ts` — 23 cases (windows drive path vs scheme, posix
      relative/absolute, spaces+percent, `mailto:`/`tel:`/`vscode:` allowlisted, `command:`/
      `javascript:`/`data:`/`file:`/`vscode-resource:`/`vscode-webview:`/`vscode-file:` refused
      — case-insensitively, `#heading` vs `file.md#heading`, scheme-detection-before-decode
      bypass `%63ommand:x`). Plus `src/asset-link-actions.ts` L1 (`test/backend/
      asset-link-actions.test.ts`): scheme passthrough, refusal, directory reveal, missing-file
      message, percent-decoded open — via a `workspace.fs.stat` mock addition
      (`test/backend/vscode-mock.ts`, `mock.setFsEntry`). Plus `media-src/src/raw-href.test.ts`
      (jsdom) pinning that the raw attribute is returned, not the browser-resolved `.href`, for
      both HTML and SVG anchors.
- [x] L2, **substituted**: rather than extend the shared `media-src/e2e/link.spec.ts` /
      `link-harness.ts` (other agents were concurrently working in `media-src/**`/
      `test/vscode-e2e/**` per the task brief's boundary — new spec files only), the raw-vs-
      resolved-href contract is pinned as a pure-function jsdom unit test
      (`media-src/src/raw-href.test.ts`) instead, and proven end-to-end by the mandatory L3 spec
      below (the strongest signal — real webview, real host).
- [x] L3 real-VS-Code (mandatory), RUN, all passing:
      `test/vscode-e2e/local-link-open.spec.ts` (6/6, ~1.1 min) — nested `./a.md`,
      `../b.md` (needs an open workspace folder; without one, task-148 containment treats the
      doc's own directory as root and correctly refuses ANY `../` escape — the spec overrides
      vscode-test-playwright's `baseDir` launch option to open the fixture tree as the workspace),
      percent-encoded `my%20file.md`, a directory (`revealInExplorer`, no tab), a missing file
      (readable error naming the resolved path, no tab), and `https://example.com` (no tab).
      Also ran the PROBE (`local-link-open-probe.spec.ts`, non-asserting, kept for the record —
      see "Probe results" above) and the smoke tier (`npm run test:vscode:smoke`, 10/10) to check
      for collateral damage from touching the shared `onOpenLink`/`fixLinkClick` code paths.

## Gates (run at completion)

- `npm test` — 2085/2085 passing (the repo's pre-existing, unrelated `initial-caret.test.ts`
  failures — task 439, another concurrent agent's WIP — are NOT in this diff; excluding that one
  file, the full suite is 2077/2077 green).
- `node build.mjs` — clean (also runs `tsc -p ./` for `src/**`).
- `npm run typecheck` — clean (`media-src/**`).
- `npm run lint:ci` — 0 errors/warnings in every file this task touched (the tree's 1 error / 2
  warnings at the time of this run are in `test/vscode-e2e/caret-first-click-probe.spec.ts` /
  `probe-poison.spec.ts`, neither touched by this task — another agent's concurrent files).
- Coverage (`test/backend/vscode-mock.ts` extended, not narrowed): `src/link-target.ts` 100/94/
  100/100 (stmts/branch/fn/lines), `src/asset-link-actions.ts` 98.9/95.7/100/100 (up from 81% pre-
  fix), `media-src/src/raw-href.ts` 100/100/100/100. `media-src/src/link-click-fix.ts` reports 0%
  in the vitest coverage report — pre-existing (it was never vitest-covered; its logic is
  exercised by the `media-src/e2e` Playwright harness, which vitest's coverage instrumentation
  doesn't see), not a regression from this change, and exactly why the new raw-href logic was
  extracted into its own unit-testable module rather than left inline. Whole-suite totals (with
  the unrelated failing file excluded) 67.7/61.0/67.6/68.9%, comfortably above the 56/51/54/56
  non-regression floor.

## Follow-up — `vscode:`/`vscode-insiders:` removed from the allowlist (confused-deputy, MEASURED)

An adversarial review of the merged classifier found no bypass in the allowlist itself (embedded
tab/newline in a scheme name, protocol-relative `//evil.com/foo`, `%2e%2e` traversal after
decoding, encoded scheme delimiters, case tricks) but flagged one open question the review
couldn't settle by reading docs: does `vscode.open` on a `vscode://<publisher>.<extid>/...` URI
route through VS Code's extension **URI-handler dispatch** (`vscode.window.registerUriHandler`
— the same mechanism auth-callback deep links use)? If so, a link in an untrusted markdown
document could invoke another installed extension's handler with attacker-controlled parameters
— a confused-deputy hole no amount of containment logic on OUR side can close, because the
target extension does the acting.

**Measured, real VS Code** (`test/vscode-e2e/vscode-scheme-urihandler-probe.spec.ts`, `@probe`):
registered a throwaway `vscode.window.registerUriHandler` for this extension
(`spiochacz.vmarkd`), then clicked a real `[probe link](vscode://spiochacz.vmarkd/probe-path?
q=1&secret=attacker-controlled)` in WYSIWYG through the actual `onOpenLink` code path (`open-link`
→ `classifyHref` → `'scheme'` → `vscode.commands.executeCommand('vscode.open',
vscode.Uri.parse(href))`, no different from any other extension's authority). **Result: it
dispatches.** The handler fired once via the real click and once more via a direct
`vscode.open(Uri.parse(...))` call (isolating the host code path from the click/webview
plumbing) — both times with the full, attacker-controlled query string intact
(`path: "/probe-path"`, `query: "q=1&secret=attacker-controlled"`). `onOpenLink` has no
workspace-trust gate on link-opening (unlike `ensureCanWriteFiles`'s upload/wiki-page gate), so
this reaches the target extension's handler from an untrusted document too. Using our own
extension's authority is sufficient to prove the mechanism — VS Code routes by the URI's
authority component to whichever extension registered a handler for that id, independent of
which document/webview the click came from — so this generalises to any installed extension.

**Decision: dropped `vscode:`/`vscode-insiders:` from `SAFE_SCHEMES`** (`src/link-target.ts`,
reasoning recorded there and in `test/backend/link-target.test.ts`) rather than carve out a
narrower "safe shape" (e.g. authority-less `vscode:settings`-style links only). The classifier
cannot tell a benign `vscode:settings` apart from `vscode://other-extension/exploit?…` from the
string shape alone, and a narrower carve-out would need its own empirical proof it can't reach
the same dispatch — not done here, and the cost of a markdown author occasionally wanting a
`vscode:`-scheme link is far lower than the cost of getting that carve-out wrong. `mailto:`/
`tel:` are unaffected: they hand off to the OS's default app, not to arbitrary installed-extension
code, and were not implicated by this review.

Gates re-run after the change: `test/backend/link-target.test.ts` (24/24, was 23 — the flipped
test plus one added case), `test/backend/asset-link-actions.test.ts` +
`test/backend/open-link.test.ts` (unaffected, no `vscode:` case there), `node build.mjs`, and
`biome check` on every touched file — all green.
