# Task 410: Loud script-load failures

## Goal

When a lazy-loaded diagram dependency genuinely fails to become available, render the
shared themed diagram error box instead of leaving the preview blank. Cover GeoJSON,
TopoJSON, nomnoml, STL, WaveDrom, Vega, and Vega-Lite.

This is a permanent-load-failure fix (offline, unavailable CDN, CSP rejection, or a
corrupt response), not a race fix. Task 407 already made concurrent callers await the
same in-flight load.

## Constraints

- Preserve `loadScript(src, id): Promise<void>` and its resolve-on-error behavior.
- Do not add retries.
- Keep existing successful rendering and render/parse-error behavior unchanged.
- Treat the error box as a terminal preview result by setting `data-processed="true"`;
  normal source edits and theme-triggered reset paths can still rebuild or rerender it.
- Use the existing engine identity for Vega and Vega-Lite: both display the Vega error
  title and use the existing `data-vega-error` convention.

## Design

Add a small shared helper to `diagram-error.ts` for dependency-load failures. It accepts
the affected blocks, the engine slug, and a human-readable dependency name. For every
block it:

1. calls `renderDiagramError` with a deterministic message stating that the dependency
   failed to load;
2. records the load-failure state through the engine's existing error data attribute;
3. sets `data-processed="true"` so the custom-diagram observer does not repeatedly retry
   the same terminal result.

Each affected engine keeps its current `loadScript(...).then(...)` flow. Immediately
after the promise settles, it validates the required global:

- GeoJSON: `window.L`;
- TopoJSON: both `window.L` and `window.topojson`;
- nomnoml: `window.nomnoml?.renderSvg`;
- STL: `window.__threeSTL`;
- WaveDrom: `window.wavedrom?.renderWaveForm`;
- Vega and Vega-Lite: `window.vegaEmbed`.

If a required global is missing, the engine invokes the helper for all blocks from that
render pass and returns. Otherwise it follows its existing render path unchanged.

The helper belongs in `diagram-error.ts` because it is presentation and terminal-error
state shared across engines. It does not belong in `load-script.ts`: that primitive
intentionally does not classify failure and must retain its current contract for other
callers.

## Error handling

The displayed message names the unavailable dependency and says it failed to load.
This avoids claiming a specific cause that the resolve-on-error loader cannot know.
Missing globals after a nominal script load are treated identically whether caused by
network failure, CSP, or a script that loaded but did not initialize correctly.

No exception is thrown to callers. This preserves isolation between diagram engines and
between multiple blocks in the same document.

## Testing

### Unit tests

Use the existing DOM-based engine tests and script-load stubs. For every affected engine
path, settle the injected script without installing its expected global and assert:

- each matching wrapper contains `.vmarkd-diagram-error`;
- the error message is non-empty and identifies a load failure;
- the wrapper is marked `data-processed="true"`;
- the renderer-specific function is not called.

GeoJSON and TopoJSON get separate assertions. Vega and Vega-Lite exercise their shared
render boundary separately so both public language paths are covered.

Run the unit coverage report and confirm the new helper and every new missing-global
branch are exercised.

### Browser and real-VS-Code e2e

Add a fixture containing valid source for GeoJSON, TopoJSON, nomnoml, STL, WaveDrom,
Vega, and Vega-Lite. A dedicated real-VS-Code spec temporarily configures a deliberately
unreachable CDN base, opens the fixture, and verifies:

- all seven language blocks reach a themed error box;
- no preview is silently empty;
- the expected engine titles/messages are present;
- no error box leaks into editable source;
- the original Markdown value remains intact.

Restore any modified VS Code configuration in `finally` so the spec is isolated. Add or
extend the browser harness e2e at the closest shared boundary if the existing harness can
exercise the missing-global behavior without duplicating the real-VS-Code setup.

Run the dedicated real-VS-Code spec headlessly after rebuilding, plus the repository's
fast test tier, lint, type/build checks, unit coverage, and browser e2e coverage.

## Task tracking

After implementation and verification, check completed items in
`tasks/410-loud-failure-on-script-load-failure.md`, record the six-engine finding, and
mark the task complete. Update `tasks/README.md` only when every task requirement and
test gate is complete.
