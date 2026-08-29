# Task 232 — OpenAPI/Swagger fence renderer (design-lite first)

**Status:** planned — evaluate-first · **Impact:** ⚪ low-med (API teams) · **Origin:** task 192 §9

## Problem

API teams keep OpenAPI specs next to their docs; a ```` ```openapi ```` fence rendering an
endpoint summary would make VMDE genuinely useful to them. Today it's a dead code fence.

## Scope

- [ ] **Evaluate first (timeboxed):** (a) bundle swagger-ui standalone (~1 MB+, CSP/offline
      fit unknown — it must not fetch), (b) redoc (heavier), (c) a slim OWN summary
      renderer: paths grouped by tag → method chips + parameters/response codes table from
      the parsed YAML/JSON. Lean (c) — consistent with the offline/CSP posture and the
      existing 18-engine aesthetic; (a) only if it drops in cleanly.
- [ ] Register as an engine-registry family (`openapi`, accept `swagger` alias) — inherits
      the unified error box (invalid YAML/spec), theming variables, render cache, zoom
      gate irrelevance.
- [ ] Constraints: external `$ref` resolution OUT (offline); internal `$ref` within the
      fence body IN; spec 3.x first, 2.0 if free.

## Out of scope

- "Try it out" request execution, auth flows, multi-file specs referencing workspace files
  (could later ride the task-230 include wire — note only).

## Verification

- L1: spec-parse + summary-model units (paths/methods/params/responses, internal $ref,
  malformed spec → error contract).
- L2: fence renders the summary; invalid spec → standard error box; retheme flip.
- L3 real-VS-Code (mandatory): add §19 to `fixtures/all-renderers.md` + assertions in the
  custom-diagrams render spec (the established new-engine pattern).
