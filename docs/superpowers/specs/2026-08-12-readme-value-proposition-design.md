# README Value Proposition Design

## Goal

Reframe the vMarkd README from a feature inventory into an inviting product
story for people who write ordinary documents, work with AI-authored Markdown,
or maintain technical and architectural documentation.

## Audience and value

- General writers get a formatted editing surface, document navigation, tables,
  images, and familiar shortcuts without learning every Markdown marker.
- AI users can review and refine prompts, agent instructions, generated notes,
  and context files as readable documents while preserving plain `.md` files for
  assistants, Git, and other tools. The README must not imply that vMarkd itself
  provides AI generation.
- Engineers and architects can keep prose, code, math, charts, maps, and diagrams
  in one version-controlled source file. The renderer claim must match the 18
  entries in `media-src/src/diagram-kit/engine-registry.ts`.

The shared proposition is: **write like a document; keep Markdown as the source
of truth.** This distinguishes vMarkd from read-only previews, standalone editors
that pull the user out of the workspace, and proprietary document formats.

## Narrative structure

1. Product name, short hook, concise explanation, and the existing product image.
2. A source-of-truth section explaining visual editing, two-way file sync, source
   access, opt-in behavior, and portability.
3. Three use-case narratives: everyday writing, AI-era Markdown, and technical
   documentation.
4. A compact comparison showing why the combination is different from source-only
   editing, preview-only workflows, and external editors.
5. Editing modes and grouped product capabilities as evidence for the promise.
6. An accurate renderer overview covering all 18 registered fence languages.
7. Quick start, shortcuts, requirements, privacy/security, configuration, project
   links, acknowledgements, and license.

## Copy constraints

- Keep the README in English, matching the extension UI and existing project docs.
- Prefer concrete outcomes over adjectives such as "feature-rich".
- Do not claim built-in AI, publishing/export, browser support, or universal
  offline behavior.
- Explain that core rendering is local/offline-first while remote images and map
  tiles are separately gated.
- Keep the existing screenshots and useful acknowledgement/licensing information.
- State the desktop VS Code `1.110+` requirement from `package.json`; do not present
  the development-time Node engine as an end-user installation step.

## Verification

- Compare every documented renderer fence with `ENGINES` in
  `media-src/src/diagram-kit/engine-registry.ts`.
- Compare modes, settings, commands, workspace limitations, and VS Code version
  with `package.json`.
- Check local links and image targets.
- Run the repository quality command required for end-of-task documentation work;
  report unrelated pre-existing failures separately.
