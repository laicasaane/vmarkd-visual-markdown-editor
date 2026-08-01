# Diagram sizing audit B — task 355

Baseline fixture for the holistic sizing/font pass. One representative block per renderer FAMILY,
each small enough that the sizing rule (not the content) decides the rendered size. Both PlantUML
cases are present on purpose: the pure-VECTOR one takes the `min-width:300px` boost, the SPRITE one
is excluded from it by `svg:not(:has(image))` — the pair that task 354 split and task 355 must judge.

Prose line for the font-size reference: labels inside a diagram should read in a sensible relation to
this paragraph, which is set in the content theme's body font at the column width.

Graph engines left at intrinsic size (mermaid/graphviz) plus shrink-only flowchart.

## mermaid — intrinsic size

```mermaid
graph LR
  A[Client] --> B[Gateway]
  B --> C[(Database)]
```

## graphviz — intrinsic size

```graphviz
digraph { rankdir=LR; Client -> Gateway -> Database; }
```

## flowchart — natural, shrink-only

```flowchart
st=>start: Start
op=>operation: Process
e=>end: End
st->op->e
```
