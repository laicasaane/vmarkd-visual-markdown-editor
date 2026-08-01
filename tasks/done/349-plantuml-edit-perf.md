# Task 349 — PlantUML edit latency: kill the render backlog + trim the stdlib

> **Status:** ✅ DONE (2026-07-04). Editing a slow PlantUML diagram (esp. C4) felt like a huge, growing
> lag before the diagram updated. MEASURED root cause: a **render backlog** — each typing pause queued a
> full engine render, and because the queue is serialised (task 347) and stale renders targeted DOM nodes
> a later re-spin had detached, they clogged it for tens of seconds. Fixed by **skipping obsolete
> (detached-target) renders**. Plus a **free ~14% trim** of the inlined stdlib (comment/blank lines). The
> single C4 render itself (~2.2 s) is an engine floor and is NOT reducible — investigated + ruled out.

## The symptom (corrected)
NOT a typing freeze — the render is async (asyncify), typing stays smooth. The pain is the **lag before
the diagram reflects an edit**, and it grew the more you typed. Measured breakdown of ONE C4 edit:
keystroke→diagram ≈ 4.5 s = ~1.2 s overhead (220 ms settle + Lute re-spin + stdlib expand + queue) +
~3.3 s engine render. But the REAL pain was the backlog, below.

## Root cause — render backlog (measured)
`plantumlRender` serialises every render through a module-level `renderQueue` (task 347, to fix a
concurrency race). On edit: each settle → Lute re-spin **rebuilds the block DOM, detaching** the element
the previous render was queued for. That queued render then targets a **dead node** → the engine writes
nowhere → no `<svg>` → it waits the full **5 s fallback** before releasing the queue. So N spaced
keystrokes queued **N full renders**, each clogging the queue → the diagram fell **tens of seconds**
behind. Probe: 6 spaced keystrokes → **6 enqueues, 0 completions** in the observation window.

Unique to PlantUML: it is the ONLY engine with a serialise-and-await `renderQueue`. The custom engines
(d2/wavedrom/nomnoml) render independently (latest converges); the native engines (mermaid/graphviz/…)
coalesce through the edit-activity settle and render the CURRENT DOM each pass — neither backlogs.

## Fix 1 — skip obsolete renders (`plantuml-render.ts`)
- **At dequeue:** `if (!e.isConnected) return` — a render whose target was already detached is obsolete
  (the re-spin enqueued a fresh one); skip it instantly instead of wasting a full engine pass.
- **Mid-render:** a `setInterval` polls `e.isConnected`; if the target detaches WHILE rendering, abandon
  and release the queue immediately instead of waiting the 5 s fallback (a MutationObserver on a detached
  node stops firing, hence the poll).

Result (measured): 6-7 spaced keystrokes → most renders skipped, ~1 live render → the diagram converges
in ~**one C4 render** (~3-5 s) instead of tens of seconds. It no longer *accumulates*.

## Fix 2 — trim the inlined stdlib (`plantuml-stdlib.ts`, `stripInertStdlibLines`)
The engine re-preprocesses the whole inlined stdlib every render; the C4 core alone is ~1956 lines,
~400 of them comments/blanks. Stripping line-start `'` comments + blank lines from **inlined stdlib
files only** (never the user's source; never a `/'…'/` delimiter or mid-line apostrophe) measured
**~14% faster** on a C4 render (2573→2225 ms). Applied to the raw file text BEFORE `processLines` so the
`' [vmarkd: …]` breadcrumbs survive.

## The engine floor — investigated, NOT reducible
Split measurement: **minimal C4 (1 element) = 2201 ms vs full C4 (8 elements + rels) = 2573 ms** → the
cost is the **stdlib preprocessing (~2.2 s fixed)**, not layout (~370 ms) and not line-count (the 14%
strip proved that). It is the evaluation of the core's 61 procedures/functions + 476 variable assignments,
re-run every render, and the core is SHARED across all C4 types so it can't be trimmed by diagram type.
- **Macro persistence** (define stdlib once → diagram-only edits, the ~5× lever): TESTED, **dead** — the
  engine resets its preprocessor state between `render()` calls (a diagram-only block errored: Person
  undefined).
- **Off-thread Worker:** doesn't shorten the wall-clock, and the render doesn't block typing → no help
  for this symptom.
So ~2.2 s per C4 render is an accepted floor; the backlog fix ensures you pay it ONCE per pause, not N×.

## Tests
- `test/vscode-e2e/plantuml-rapid-edit.spec.ts` (NEW) — grows a visible C4 label with 7 spaced keystrokes
  and asserts the diagram converges to the final label within 12 s. **Verified it has teeth:** with the
  fix disabled it fails (the correct render arrives ~30 s late); restored, it passes.
- `plantuml-stdlib.test.ts` — 3 new units for `stripInertStdlibLines` (strips comments/blanks, preserves
  mid-line apostrophes + `/'…'/` delimiters + the user's own source + the vmarkd breadcrumbs).
- No regression: all 13 PlantUML real-VS-Code e2e green; full unit 1317; typecheck + `lint:ci` clean.

## Related
Task 347 (the serialised `renderQueue` this fixes the downside of), 348 (repeat-open cache — orthogonal;
edits always miss), 161 (the edit-activity settle/overlay this rides on), 136 (the stdlib being trimmed).
Files: `media-src/src/plantuml-render.ts`, `media-src/src/plantuml-stdlib.ts`.
