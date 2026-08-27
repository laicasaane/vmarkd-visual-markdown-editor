---
name: vmarkd-visual-debugging
description: ALWAYS use whenever the task is a LAYOUT / CSS / caret bug in Visual Markdown Editor — the perceptual "a few px off" / "jumps" / "squished" / "kursor za ```" class where the symptom is visual and the cause is one property buried in a cascade, and many reproduce ONLY in the real VS Code webview (VS Code's injected default CSS, the custom-editor pipeline) not the Playwright harness. Covers the three tools cheapest-first — playwright-cli interactive measure-and-screenshot on the harnesses, @visual golden screenshots (local-only, excluded from CI), and the real-VS-Code webview suite — so you MEASURE instead of guessing. Read it BEFORE chasing a visual/layout regression. For writing/running tests in general (which layer, real-VS-Code e2e, coverage, gates) use vmarkd-testing instead.
---

Read and follow the authoritative [Visual Markdown Editor visual debugging skill](../../../.agents/skills/vmarkd-visual-debugging/SKILL.md) completely.
