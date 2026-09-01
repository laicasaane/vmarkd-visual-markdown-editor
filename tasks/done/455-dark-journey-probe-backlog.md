# Task 455 — Dark-journey probe backlog (the residue of task 190 §5)

**Status:** ✅ release-critical audit completed 2026-09-01 ·
**Impact:** 🟡 unknown by construction (that is the point: each probe asks whether a journey works
at all) · **Origin:** split out of [task 190](190-user-journey-test-coverage-plan.md) when 190 was
closed, 2026-07-30.

## Why this exists

Task 190's implementation phases (P0/P1/P2 + infra) are complete, so 190 is closed. Its §5 was
never a phase — it is a menu of **exploratory probes** for journeys that may not work at all,
explicitly sequenced as "opportunistically, one per session, before touching adjacent code". Closing
190 without rehoming them would silently drop the list. They live here instead, with the ones that
have since been covered elsewhere already struck off.

Discipline is 190's own: run each as a cheap throwaway FIRST; promote to a permanent net only what
matters, after fixing whatever the probe finds. A probe that asserts nothing belongs in the `@probe`
tier (task 449) — see `test/backend/probe-tier-convention.test.ts`.

## Release-critical audit

- [x] **IME composition** — CDP `Input.imeSetComposition` in IR prose and inside a highlighted code
      block; duplication/caret check. Grepped 2026-07-30: zero `imeSetComposition` anywhere in
      `test/vscode-e2e`. Completely dark, and the highest-value item here — CJK input is a whole
      user population, and the WYSIWYG highlight path (`wrapLuteFlatten`, caret-as-char-offset) is
      exactly the machinery composition events break.
- [x] **Untitled → save-as** — untitled md → `openWith` VMDE → type → saveAs. The manifest
      registers untitled but the path is never exercised end-to-end (`block-fidelity.spec.ts`
      mentions untitled but does not drive the save-as journey).
- [x] **Ctrl+F find** — does VS Code's find UI open at all over the webview, given our capture-phase
      key interception (`[[webview-key-capture-vs-vscode]]`)?
- [x] **Line-targeted VMDE open** — click a VS Code global-search result that resolves to a
      markdown file; does the custom-editor open carry the selection at all? Overlaps task 52
      (reveal-line) and task 229 (code-line links) — probe before either implements a second path.
- [x] **Drag-drop text/file → link** — synthetic drop carrying `text/plain` + a file item; only
      images are handled today (`image-upload-wire.spec.ts` covers the image path only).
- [x] **Untrusted/virtual workspace** — launch vscode-test in restricted mode; does the editor open?
      Nothing in the suite touches workspace trust. Note this now has a security edge: task 359's
      link allowlist deliberately reasons about untrusted documents.
The elective wiki-rename and configuration-pair probes were not made release-critical by adjacent
evidence and are rehomed unchanged in parked Task 544.

## Already covered since 190 was written — do NOT re-probe

- **Theme-flip during active diagram edit** → `theme-flip-during-first-render.spec.ts` +
  `diagram-fast-edit-safety.spec.ts`.
- **Callout arrow-nav** → `callout-edit.spec.ts` / `callout-rename.spec.ts`.
- **Copy as HTML** → `copy-clipboard.spec.ts`.

## Out of scope

- Turning every probe into a permanent net regardless of what it finds — that is how the suite got
  to ~1.5-2 h (task 447/448). Promote only what protects behaviour someone depends on.

## Verification

Per item: the probe RAN and its finding is recorded (in this file or a new task). A probe with no
recorded finding has not been done.

## Release audit evidence

- IME is no longer dark: Task 294's maintained CDP prose/code/table composition matrix passed 1/1,
  and its real-VS-Code composition wiring/caret/focus smoke passed 1/1, both with retries disabled.
- A disposable one-boot untitled probe opened an `untitled:` Markdown document in VMDE, typed through
  the actual webview-host sync, used VS Code's in-workbench simple Save As dialog, wrote the selected
  `.md` file, and finished clean with exact edited bytes. Early attempts were invalid probe defects
  (an unpaintable editor-root Range, awaiting the modal command before driving it, and one missing
  serialized argument); the corrected journey passed 1/1 with no retry and was removed.
- Ctrl+F is owned by completed Task 196. The batched audit dropped one Escape close under load, while
  the same focused real-VS-Code spec passed immediately in isolation with `--retries=0`; the widget,
  source-accurate replacement, one-step undo, save, and Ctrl+H non-collision all completed.
- Task 52 owns line-targeted open. Its focused real-VS-Code journey passed 1/1: direct custom-editor
  open still demonstrably loses VS Code's selection, while `vmde.openEditor` captures the source
  selection and reveals both retained and newly created panels.
- Drag/drop Chromium coverage passed 3/3: image files upload, `text/plain` remains a documented
  no-op, and a disposable non-image File probe proved `notes.txt` reaches the upload wire. The
  return path currently formats every non-WAV file as `![](href)`, producing a broken image for
  ordinary files; this release-impacting input defect is promoted to Task 543 for immediate repair.
- The standard real-VS-Code harness normally disables workspace trust. A disposable probe removed
  only that launch flag, verified `vscode.workspace.isTrusted === false`, and passed VMDE open/edit
  propagation in Restricted Mode 1/1 without retries. The harness dependency was restored exactly
  and the probe removed; Task 29's existing write-feature gates remain the authority.
