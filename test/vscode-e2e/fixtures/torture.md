# Torture document

This canonical fixture exercises the common block types in their normalized form so a
mode round-trip (ir → wysiwyg → sv → ir) returns byte-identical. Anchor line ALPHA.

## Prose and inline

A paragraph with **bold**, *italic*, `inline code`, and a [link](https://example.com).
Anchor line BRAVO with a second sentence.

## A tight bullet list

- First bullet
- Second bullet
- Third bullet

## An ordered list

1. Step one
2. Step two
3. Step three

## A table

| Name | Count |
| --- | --- |
| Alpha | 1 |
| Beta | 2 |

## A fenced code block

```ts
const answer = 42
console.log(answer)
```

## A blockquote

> Quoted line one.
> Quoted line two.

---

Closing paragraph. Anchor line ZULU.
