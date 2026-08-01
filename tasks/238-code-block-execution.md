# Task 238 — Run code blocks (RunMe-style) — design-first EPIC, security-gated

**Status:** planned — DESIGN-FIRST EPIC, park-able · **Impact:** ⚪ niche-but-loud (dev runbooks) · **Origin:** task 192 §9

## Problem

Runbooks and setup docs are full of shell fences the reader copies by hand. RunMe/Jupyter
prove the "run this block" affordance. It is also the most security-sensitive feature in
this backlog — decide deliberately whether vMarkd wants it at all.

## Scope

- [ ] **Decision gate first:** is doc-driven execution in scope for this plugin? If no —
      record and close; the copy-button fix (task 212b) already covers the honest 80%.
- [ ] If yes, hard rails: execution ONLY host-side into a real VS Code terminal
      (`createTerminal` + `sendText` — visible, user-owned, no output capture v1); ONLY
      in trusted workspaces (`workspace.isTrusted`); ONLY for allow-listed languages
      (`bash/sh` v1); per-fence ▶ button wired CSP-safe (the task-212 delegated-listener
      pattern), confirmation on first run per session.
- [ ] Explicit non-goals baked into the design: no output embedding in the doc, no kernel/
      state semantics, no auto-run, no remote execution.

## Out of scope (permanently, security posture)

- Executing anything from the webview process; running on open; `dataviewjs`-class
  arbitrary-JS anywhere (same boundary as task 105's hard scope cut).

## Verification

- Decision exit recorded here. If built — L1: language allow-list + trust gating units
  (host); L2: ▶ renders on bash fences only, click posts `run-fence` with exact text;
  L3 real-VS-Code (mandatory): click → terminal created + received the command
  (`window.terminals` via evaluateInVSCode); untrusted workspace → button absent.
