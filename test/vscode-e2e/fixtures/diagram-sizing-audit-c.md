# Diagram sizing audit C — task 355

Baseline fixture for the holistic sizing/font pass. One representative block per renderer FAMILY,
each small enough that the sizing rule (not the content) decides the rendered size. Both PlantUML
cases are present on purpose: the pure-VECTOR one takes the `min-width:300px` boost, the SPRITE one
is excluded from it by `svg:not(:has(image))` — the pair that task 354 split and task 355 must judge.

Prose line for the font-size reference: labels inside a diagram should read in a sensible relation to
this paragraph, which is set in the content theme's body font at the column width.

Light SVG renderers, incl. the two with explicit caps (smiles 56%, abc no viewBox).

## d2

```d2
api -> server: request
db: {shape: cylinder}
server -> db
```

## nomnoml

```nomnoml
[Pirate|eyeCount: Int|raid();pillage()]
[Pirate] -> [Ship]
```

## wavedrom

```wavedrom
{ "signal": [{ "name": "clk", "wave": "p......." }, { "name": "dat", "wave": "x.345x.." }] }
```

## vega-lite

```vega-lite
{"$schema":"https://vega.github.io/schema/vega-lite/v5.json","data":{"values":[{"a":"A","b":28},{"a":"B","b":55},{"a":"C","b":43}]},"mark":"bar","encoding":{"x":{"field":"a","type":"nominal"},"y":{"field":"b","type":"quantitative"}},"width":200,"height":120}
```

## abc — no viewBox, shrink-only

```abc
X:1
T:Scale
M:4/4
K:C
CDEF GABc|
```

## smiles — capped at 56% of the column

```smiles
CN1C=NC2=C1C(=O)N(C)C(=O)N2C
```
