---
name: vmarkd-lute-features
description: ALWAYS use whenever the task touches Lute in Visual Markdown Editor — markdown ↔ DOM serialization (getValue / serializeForHost / Md2VditorIRDOM / VditorIRDOM2Md / VditorDOM2Md / SpinVditorIRDOM), the IR/WYSIWYG dual-node DOM (markers vs preview, data-type, data-render), injecting ANY custom/foreign DOM into the editable surface (ghost text, inline widgets, decorations, callout-style nodes), making injected DOM survive or be invisible to a round-trip, Lute parse/render options (Set*), the host-side Node Lute prerender (lute-host.ts), patching/vendoring lute.min.js, or probing the minified Lute. Read it BEFORE injecting DOM into the editor or changing anything that serializes, so you don't ship content that leaks into (or vanishes from) the saved markdown.
---

Read and follow the authoritative [Visual Markdown Editor Lute features skill](../../../.agents/skills/vmarkd-lute-features/SKILL.md) completely.
