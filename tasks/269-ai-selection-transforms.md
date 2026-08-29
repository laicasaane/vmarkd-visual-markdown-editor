# Task 269 — AI selection transforms (rewrite · summarize · fix grammar · translate · prose→diagram)

**Status:** planned — DESIGN-FIRST · **Impact:** 🟡 med-high (writers, non-native authors) · **Origin:** task 192 §10

## Problem

Zero AI code shipped; task 153 is ghost-text inline completion ONLY. The genuinely new
delta: act on a SELECTION. Crucially, 153's spike already confirmed `vscode.lm` is
available on our engine floor — the security/config shape is cheap (no key storage,
VS Code's own consent UI).

## Scope

- [ ] Design phase: command set `VMDE AI: Rewrite / Summarize / Fix grammar / Translate
      selection` + `Generate diagram from description`; surfaced in the palette and the
      task-215 context menu; selection travels over the existing webview↔host bridge,
      result REPLACES the selection webview-side (so Vditor undo works — one step).
- [ ] Model source priority: (1) `vscode.lm` (same dependency 153 locked in); (2) optional
      user-configured CLI (`vmde.ai.command`, stdin=selection, **workspace-trust-gated,
      no default value**); (3) HTTP endpoint with the key in `SecretStorage`. Never send
      content anywhere without an explicit per-source opt-in.
- [ ] prose→diagram: prompt for a fenced mermaid/d2 block and VALIDATE by actually
      rendering with the offline engines before insert (reject on render error — the
      renderers are the free judge).
- [ ] Meeting-notes→action-items = a prompt preset on the same plumbing (PM ask from §9).
- [ ] **Generate alt text for images** (added 2026-07-03): VS Code's built-in markdown
      editor ships a Copilot-vision "Generate/Refine alt text" code action (since 1.100)
      that custom-editor users LOSE. Add it to the command set + the task-215 context menu
      on image nodes: read the bytes host-side, use a vision-capable `vscode.lm` model (or
      the CLI/HTTP sources), write the alt into `![alt](src)` via the same
      selection-replace plumbing. Also serves a11y (265) and softens the empty-alt class
      (task 64).
- [ ] Diff preview before replace for destructive transforms (setting: apply directly vs
      preview).

## Out of scope

- Ghost text (153), whole-doc agents, embedding/RAG search, fine-tuned models, telemetry
  of content (never).

## Verification

L1: plumbing units with a fake lm provider (selection round-trip, undo integrity, trust
gate, no-provider fallback messaging). L2: command replaces selection + single undo.
L3 real-VS-Code: with a stub lm provider registered in the test host — full journey incl.
diagram-validation reject path.

## Prior art — fork re-scan 2026-07-23 (task 358)

- `phfsantos/vscode-markdown-editor` → `feature/vscode-llm-release` (10 ahead, new since the June scan): `LLM Release`, `feat: add tool selector functionality with frontmatter integration`, `Dev Commands widget`, a Markdown Tools sidebar. The frontmatter-driven tool selection is the interesting bit for our per-doc AI config question.
