# Task 264 — Web extension build (vscode.dev / github.dev / Codespaces web)

**Status:** planned · **Impact:** 🟡 med (web/Codespaces users) · **Origin:** task 192 §10 (feasibility-audited)

## Problem

No `"browser"` entry in package.json (:48 has only `main`) → VMDE is desktop-only. The
audit shows the wall is SHALLOW: the entire webview (Vditor, Lute, all 18 engines incl.
WASM) is already pure browser code; the host uses NO `child_process` (verified), only
shallow Node conveniences: `node:fs` readFileSync (diagram-cache-host:27, lute-host:20,
html-builder:165, editor-config:3/84), `node:vm` (lute-host prerender), `node:os` (tmpdir
for the disk cache), `node:crypto` (html-builder:166), `Buffer` (3 sites). Git gutters
already degrade gracefully (vscode.git API, null fallback); doc IO already uses
`workspace.fs`.

## Scope

- [ ] esbuild browser bundle of the host (`"browser"` field, `target: webworker`); CI
      builds both.
- [ ] Port the shallow deps: `node:path` → `Uri.joinPath`/posix helpers; the readFileSync
      sites → `workspace.fs` or build-time string inlining (html-builder templates);
      `crypto.createHash` → a tiny JS hash; `Buffer` → `TextEncoder`/`Uint8Array`.
- [ ] Desktop-gate the two that don't port, with graceful degradation: the `node:vm` Lute
      prerender (web = skip instant-paint teaser) and the os.tmpdir persistent diagram
      cache (web = globalStorage/memento or memory-only).
- [ ] One web smoke test (`vscode-test-web`) — open a doc, type, save, one diagram
      renders.

## Out of scope

- Web-specific features, performance tuning for web workers, virtual/untrusted workspace
  behaviours (task 29 owns the declarations).

## Verification

Desktop suites stay green (the port must be behaviour-neutral); the new web smoke passes
in CI; manual vscode.dev session recorded once in this file.
