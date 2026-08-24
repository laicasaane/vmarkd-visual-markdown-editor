---
name: vmarkd-renderer-theming
description: ALWAYS use whenever the task touches theme CSS in vMarkd — editing main.css, any file in media/markdown-themes/ (github/material/vscode content themes), the --vmarkd-* / --vscode-* variables, .vditor-reset or .markdown-body styling, code-block / diagram / math / callout colors, dark-mode (.vditor--dark) rules, highlight.js style pairing, or the IR edit surface (the editable source shown while editing a code/mermaid/echarts/math block or callout). Covers the three render-theming models, per-renderer application mechanisms, ECharts/mermaid palette pairing, IR dual-node edit-surface gotchas (source-vs-render mismatch, blur flash, specificity traps, panel resize), CSS cascade/specificity traps, and build/CSP/version gotchas, with exact file locations. Read it BEFORE changing any theme CSS so you don't re-hit a documented gotcha.
---

Read and follow the authoritative [vMarkd renderer theming skill](../../../.agents/skills/vmarkd-renderer-theming/SKILL.md) completely.
