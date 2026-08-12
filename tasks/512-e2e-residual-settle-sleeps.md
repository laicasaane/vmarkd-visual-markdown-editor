# 512 — The residual fixed settle sleeps 451 did not reach

**Status:** TODO — measured inventory below, no conversions done yet
**Parent:** [447 — suite cost analysis](447-vscode-e2e-suite-cost-analysis.md)
**Follows:** [451](done/451-e2e-replace-fixed-sleeps.md) — converted 7 candidate files, deliberately
left 3, and never inventoried the long tail
**Potential:** **≈11 min** of the full suite, and it is *smeared*, not concentrated — see the shape
below before deciding this is worth a session.

## Inventory (2026-08-12, corrected — default tier only, `@probe`/`@visual`/spike excluded)

**Correction:** the first pass of this inventory only grepped raw `setTimeout(ident, N)` and missed
that most specs call the shared `settle(frame, N)` / `settle(N)` helper
(`webview-helpers.ts:settle`), which wraps the identical `setTimeout` internally — so specs calling
`settle()` were invisible to a `setTimeout`-only grep. Counting both:

- **134 files, 408 calls, 813 s total (13.6 min).** A further 209 s lives in probe/visual/spike
  files that no tier runs — ignore those.
- The **top 3 files are 140 s of that (2.3 min) and are already excluded by 451 with reasons
  recorded in-source**: `wysiwyg-parity` 51 s, `theme-flip-during-first-render` 45 s,
  `mode-switch-parity` 43.7 s. Do not re-litigate them without new evidence.
- ⇒ reachable ≈ **11.2 min**, of which `format-hotkeys` alone (31 `settle()` calls, one per hotkey
  case, task 456's toolbar-debounce wait) holds 25.7 s, the rest of the head-20 holds ~3.7 min, and
  a tail of **114 files holds 440 s** — i.e. ~3.9 s per file. That tail is where the audit cost
  exceeds the payoff; take it only opportunistically, when already editing the file for another
  reason.

Head of the reachable list (seconds of sleep, number of calls):

| file | sleep | calls | note |
|---|---|---|---|
| `format-hotkeys` | 25.7 s | 31 | ⚠️ **deprioritized despite #1 by raw seconds** — see the new rule above; its settles guard a delayed double-fire, not a positive completion signal |
| `paste-over-selection` | 16.0 s | 7 | |
| `inline-code-gap` | 15.5 s | 8 | already partially converted by task 419; remaining settles are the vetted residue |
| `diagram-edit-monitor` | 15.0 s | 5 | |
| `list-tight` | 14.5 s | 6 | |
| `cross-diagram-edit` | 14.0 s | 3 | |
| `plantuml-stdlib-more` | 14.0 s | 3 | |
| `plantuml-stdlib` | 14.0 s | 3 | |
| `echarts-resize` | 13.7 s | 6 | resize/geometry settle — likely a positive completion signal, good first candidate |
| `cut-selection` | 13.5 s | 6 | already partially converted by task 419; remaining settles are the vetted residue |
| `sv-split` | 13.0 s | 6 | pane-geometry settle — likely convertible, good first candidate |
| `local-link-open` | 11.5 s | 8 | |
| `diagram-resize` | 11.3 s | 5 | window-resize settle — likely convertible, good first candidate |
| `echarts-theme` | 11.0 s | 4 | theme-state, see 451's own exclusion for the family — do not convert without re-reading why |
| `markmap-resize` | 10.2 s | 5 | resize/geometry settle — likely convertible, good first candidate |
| `doc-sync` | 10.0 s | 5 | |
| `ir-inline-code-line` | 10.0 s | 1 | |

`format-hotkeys`, `inline-code-gap`, `cut-selection` are in the FAST tier (they run every routine
pass) — converting those buys back FAST wall clock too, not just the full suite's, but two of the
three are already-vetted residue and the third is deprioritized (see above), so the FAST-tier win
from this table is smaller than "3 files are in FAST" suggests. The rest of the head-20
(`diagram-sizing`, `retheme-flip-matrix`, `smiles-render`, `abc-flip-cache-hit`) are default tier
only.

**Suggested first batch (2026-08-12): `diagram-resize`, `echarts-resize`, `markmap-resize`,
`sv-split`** — 4 files, ~48.3s / 22 calls, all resize/pane-geometry settles with a plausible
positive-completion signal (final rendered width/height), none flagged by the double-fire hazard
above. Read each fully before converting — this is a plausibility read from headers/names, not the
full-file audit 511's PlantUML/D2 passes did.

Reproduce (counts BOTH forms; write the character class out — `[\w$]` inside a JS/ERE bracket is a
literal `w`, not a shorthand, and silently under-counts):

```bash
grep -ohE 'setTimeout\(\s*[A-Za-z_$][a-zA-Z0-9_$]*\s*,\s*[0-9_]+|settle\(\s*([A-Za-z_$][\w$.]*\s*,\s*)?[0-9_]+\)' test/vscode-e2e/*.spec.ts
```

## Rules (carried over from 451, they were learned the hard way — plus one found here 2026-08-12)

- A sleep may only become a poll when there is a **condition that is actually observable** —
  451's premise correction: several of these sleeps wait for something with no DOM/state signal
  (an engine settling, a theme batch landing), and a poll there just re-invents the sleep with
  extra flakiness.
- `block-fidelity` is the cautionary case: 3 of 4 sleeps converted clean, the 4th passed 28/28 solo
  and still flaked once inside a 39-test FAST run. **Solo green is not proof.** Convert, then run
  the file inside the FAST tier, not only on its own.
- Any conversion that removes ≤1 s is not worth the flake risk — skip it and say so.
- **New rule, found auditing `format-hotkeys.spec.ts` (do NOT convert that file on the strength of
  its raw seconds count):** a sleep that exists to prove a DELAYED SECOND EFFECT never fires is not
  convertible to `expect.poll(...).toContain(...)` even though the assertion right after it looks
  like an ordinary positive-completion check. `format-hotkeys` exists because of native-execCommand
  double-fire bugs (Ctrl+B running both the VS Code command AND Chrome's built-in contenteditable
  bold) and hotkey-dedupe regressions — its 900ms/1200ms settles are there so a delayed SECOND fire
  has time to corrupt the text before the assertion reads it. A poll that resolves the instant
  `getValue()` first matches the expected string would pass on the FIRST (correct) fire and never
  wait around for a second one — which is exactly the bug class this file was written to catch, so
  converting it would keep the test green while quietly deleting its regression coverage. The
  distinguishing question before converting ANY settle-then-assert pair: is the wait proving
  something POSITIVE happened (convertible — poll for that positive signal), or proving something
  NEGATIVE does NOT happen afterward (not convertible — a poll can only detect presence, not
  confirm absence-over-time). `format-hotkeys` is reclassified out of the head-of-list priority
  order below for this reason, despite being the single largest file (25.7s/31 calls) — do not
  "fix" it without re-deriving this reasoning first.

## Steps

- [ ] Take the head of the table above file by file, cheapest-observable-condition first.
- [ ] Per file: measure before/after with a `git show HEAD:<path> > <path>` swap (451's method — a
      real baseline, not an inferred one), and record both numbers here.
- [ ] After each converted file, run it solo **and** inside `test:vscode:fast` before ticking it.
- [ ] Record every sleep deliberately left, with the reason, in-source *and* here — the exclusions
      are the durable output; the next reader must not re-open them.
