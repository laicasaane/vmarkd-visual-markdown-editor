---
name: vmarkd-testing
description: ALWAYS use whenever the task adds or changes Visual Markdown Editor functionality and needs tests — picking the test layer (vitest unit / chromium harness e2e / REAL-VS-Code e2e / @visual golden), writing a real-VS-Code webview spec (test/vscode-e2e), booting the compile-only WASM in a vitest vm-context, verifying coverage, or running the lint/typecheck/test gates headless. Covers the MANDATE (every webview/renderer feature MUST ship a real-VS-Code e2e you WRITE and RUN), the exact headless commands (xvfb IS installed), the spec patterns (frame locators, evaluateInVSCode, interaction via defaultPrevented, data: URIs, fixtures), unit/WASM recipes, and the gotchas. Read it BEFORE calling a feature done so you never defer real-webview verification to the user.
---

Read and follow the authoritative [Visual Markdown Editor testing skill](../../../.agents/skills/vmarkd-testing/SKILL.md) completely.
