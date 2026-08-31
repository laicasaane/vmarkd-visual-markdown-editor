# 534 — Keep wiki-shaped inline code stable after list edits

> **Status:** done — 2026-08-31 · **Impact:** 🟠 medium (common README editing changed rendered
> syntax) · **Origin:** Project Owner report with
> `README.md` screenshot and settings, 2026-08-31

## 1. Goal

Keep backticked wiki-shaped text such as `` `[[links]]` `` rendered as inline code after any edit
that makes Vditor re-spin its surrounding list. Preserve ordinary `[[wiki]]` chip restoration,
source bytes, host synchronization, and the reported editor configuration.

## 2. Reproduction and root cause

The repository `README.md` contains this wrapped list item under
“Navigate a document or a knowledge base”:

```markdown
- Wiki-style `[[links]]` with completion, navigation, ambiguity handling, and
  one-click creation of missing pages.
```

Initial Lute rendering correctly treats `[[links]]` as inline-code text. Editing another bullet
re-spins the whole list through `SpinVditorIRDOM`, whose result still correctly contains
`<code>[[links]]</code>`. VMDE then calls `reintroduceChips()` over that complete HTML string. Its
context-free global wiki regex replaced the code text with a `.wiki-link-chip`, producing this
invalid visual state:

```html
<code><span class="wiki-link-chip" data-wiki-target="links">links</span></code>
```

The existing Chromium regression typed only in a plain paragraph containing real wiki links, so it
covered chip restoration but never exercised whole-list spin or wiki-shaped inline code.

## 3. Implementation

- Preserve complete `<code>...</code>` fragments byte-for-byte while `reintroduceChips()` restores
  wiki chips in surrounding prose.
- Extend the focused Chromium wiki fixture with the exact README section and edit a neighboring
  bullet through real Vditor input.
- Add unit coverage proving inline-code `[[links]]` stays literal while a nearby prose `[[Page]]`
  still becomes a chip.
- Add a focused real-VS-Code spec that copies the repository's actual `README.md`, applies the nine
  reported settings, performs the list edit, and checks the real custom-editor DOM and host source.

No setting, command, dependency, vendored Lute byte, or generated artifact changes.

## 4. Verification

- TDD RED: focused unit test failed with a wiki chip inside `<code>`; GREEN passes **13/13**.
- Chromium RED: the README-shaped list lost its inline-code node after editing another bullet;
  final complete wiki spec passes **11/11**.
- Real-VS-Code mutation check: disabling only the code-fragment guard made the actual README/settings
  spec fail after the edit; restored final candidate passes **1/1** with `--retries=0`.
- Changed-line coverage exercises every new `reintroduceChips()` line; the focused report's only
  uncovered lines are the pre-existing `setKnownPagesRef` and Lute-wrapper integration branches.
- `node build.mjs`, webview/strict/VS Code e2e typechecks, bundle size (557/558 KB), and startup cost
  (283/283 eager modules) pass.
- The single aggregate `npm run quality` passed brand identifiers, lint, jscpd, dependency
  boundaries, and all audits. It retained the pre-existing `yazl` knip finding already recorded by
  Task 532, while its coverage leg timed out four unrelated package-preview cases at the 5-second
  per-test ceiling under aggregate load. The unchanged focused file then passed **23/23**, the full
  coverage retry passed **244 files / 3,500 tests**, and the zero-coverage ratchet passed **14/14**.

## 5. Completion checklist

- [x] Exact README list shape reproduces before the fix.
- [x] Backticked `[[links]]` remains inline code after a neighboring list edit.
- [x] Real prose wiki links still restore as chips.
- [x] Reported settings are exercised in the real VS Code custom editor.
- [x] Source/host Markdown retains the backticks and brackets.
- [x] Aggregate quality residual and clean focused/full-coverage recoveries are recorded honestly.
- [x] Task record moves to `tasks/done/` and `tasks/README.md` is updated.
