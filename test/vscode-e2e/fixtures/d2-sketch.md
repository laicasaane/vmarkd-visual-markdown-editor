# D2 sketch fixture

A small D2 flowchart with mixed shape kinds and unlabelled edges (no containers, no
`sql_table`/`class`, no edge labels) so that:

- the CRISP render emits leaf `<rect>`s (the two rectangles) + an `<ellipse>` (circle) +
  a `<polygon>` (diamond) + `<path>`s (cylinder + edges), while
- the SKETCH render routes every leaf shape + edge through rough.js → only `<path>`s
  (no `<rect>`/`<ellipse>` for the leaves), a clean geometry signal for the e2e.

```d2
start: Start {shape: circle}
load: Load config
check: Valid? {shape: diamond}
db: Store {shape: cylinder}
done: Done

start -> load
load -> check
check -> db
check -> done
db -> done
```
