# 362 — d2 block renders 9px taller in IR than in Preview under a github content theme

**Status: 🔍 OPEN — reproduced and measured, NOT fixed. Needs a product decision (likely folds into
task 355, diagram sizing).**

## Symptom

With `vmarkd.theme.content` set to `github-light` (also reproduces via any spec that pins a github
theme), the **d2** block in `test/vscode-e2e/fixtures/all-renderers.md` (top-level child index 96)
renders **133px tall in IR** but **124px in the full Preview** — a 9px difference, i.e. a small
"jump" when toggling between edit and Preview. Under the default `theme.content: auto` the two match.

## Reproduction (~1 min)

```bash
node build.mjs
xvfb-run -a npm --prefix test/vscode-e2e test -- --retries=0 flowchart-theme.spec.ts parity.spec.ts
```

`flowchart-theme` leaves `theme.content = 'github-light'` pinned globally; `parity` then fails with
`[{"i":96,"type":"code-block","ir":133,"pv":124}]`. (`type` says `code-block` because that is the IR
`data-type` for any fenced block — the block is a **diagram**, `code.language-d2`, not plain code.)

## Measured box breakdown

```
IR: wrap h=133  pt/pb 0  mt/mb 16px  lh 24px  fs 16px   (code.language-d2 = the editable source)
PV: wrap h=124  pre h=88  pt/pb 8px  mt 16px  lh 24px  fs 16px
```

Both panes agree on font-size, line-height and wrapper margins, so this is not a text-metrics or
margin-collapse difference — the two panes lay the **diagram** out at slightly different sizes.

## Why it is not fixed here

- It is **not** the bug `parity.spec.ts` exists to guard: that was the IR dual-node phantom height,
  58–72px, which is why the spec's threshold is `>8px`. A 9px diagram delta merely clips that edge.
- It is a **diagram sizing** question, and diagram sizing is exactly what task 355 is parked on
  pending the user's visual judgement. Changing render sizing here would pre-empt that decision.

Deliberately NOT done: the threshold was **not** raised to hide it, and `parity` was **not** left
failing. `parity` now states its (original) precondition `theme.content: auto` explicitly, so the
suite is deterministic while this case stays reproducible on demand with the command above.

**Coverage note (explicit, not buried):** with that precondition, `parity` no longer exercises pinned
content themes at all. It never intended to — it was authored under `auto` and only saw them through
cross-spec pollution — but the practical effect is that no e2e currently guards IR↔Preview parity
under a non-auto content theme.

## Related

- Task 355 — diagram sizing / fonts (parked on the user's visual judgement).
- The cross-spec pollution class: many theme specs `update(..., true)` (Global) and never restore.
  `mermaid-flip-gate`, `retheme-flip-matrix`, `abc-flip-cache-hit` and `parity` now set the content
  theme they require instead of trusting whatever ran before them.
