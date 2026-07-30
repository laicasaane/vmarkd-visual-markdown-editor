# Task 468 — A cross-file markdown link may open the target in VS Code's BUILT-IN editor, not vMarkd

**Status:** 🔵 **OPEN — diagnosed by code reading, not yet reproduced end-to-end in a fresh
profile.** · **Impact:** 🟠 high if confirmed (silent, no error, affects every cross-file link for
any user who never explicitly chose vMarkd) · **Origin:** surfaced 2026-07-31 while building task
243's cross-document e2e — the first test in this repo's history to exercise the path.

## Problem

`package.json` registers the custom editor with **`"priority": "option"`**, not `"default"`.

`src/asset-link-actions.ts`'s `onOpenLink` opens a cross-file target with plain

```ts
vscode.commands.executeCommand('vscode.open', targetUri)
```

(pre-existing, task 359 — not introduced by 243). With `priority: "option"` and no
`workbench.editorAssociations` entry, VS Code resolves the file to its **built-in text editor**.

For most existing users this is invisible: once someone has picked vMarkd for a `.md` file and kept
it, VS Code writes an `editorAssociations` entry and every later open — link clicks included —
resolves to vMarkd. The gap only shows on a profile that has never made that choice: a new install,
a new machine, a fresh profile, or a colleague opening the repo for the first time. They click a
`[link](other.md)` inside vMarkd and land in plain text, with no error and no hint why.

## How it was found, and why no test caught it

Task 243's e2e opens a sibling document by clicking `sibling.md#fragment` and then waits for that
tab's webview. It timed out. The webview never existed, because the tab was a text editor.

`test/vscode-e2e/local-link-open.spec.ts` — the closest existing coverage — asserts only that a tab
with the right `fsPath` exists. It never checks `viewType`. So it has been green for its entire life
regardless of which editor actually opened, and would stay green if this bug got worse.

## Scope

- [ ] **Reproduce first.** Fresh VS Code profile with no `editorAssociations`, click a cross-file
      markdown link from inside vMarkd, and record which editor opens. The diagnosis above is from
      source, and this repo has had three task premises collapse on contact with measurement this
      week — do not skip this step.
- [ ] Decide the behaviour, and it IS a product decision, not a bug fix with one right answer:
      - (a) `vscode.openWith(targetUri, 'vmarkd.editor')` — makes link-following consistent, but
        overrides a user who deliberately prefers the text editor for markdown.
      - (b) Open with vMarkd only when the SOURCE document is itself open in vMarkd — "follow a link
        the way you were reading" — narrower, and arguably what the user means.
      - (c) Raise the custom editor's `priority` to `"default"` — the broadest change, affects every
        `.md` open in the workspace, not just link-following. Almost certainly too blunt.
      - (d) Leave it; document that link-following honours the user's editor association.
- [ ] Whatever is chosen, **fix `local-link-open.spec.ts` to assert `viewType`**, not just `fsPath`.
      A test that cannot distinguish the two outcomes it exists to check is worse than no test,
      because it reads as coverage. Task 243's `expectTabOpenedAsVmarkd` helper already does this
      and can be reused.

## Out of scope

- Task 243's own fragment-scrolling behaviour. 243 works around this in its spec by setting
  `editorAssociations` at test start — which is legitimate, since that mirrors a real vMarkd user's
  actual settings, but it is a test precondition, NOT a fix for this.
