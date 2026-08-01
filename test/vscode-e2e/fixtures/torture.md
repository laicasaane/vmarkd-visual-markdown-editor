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

## An indented code block (task 239)

    indented code line
    second indented line

## Reference links with titles (task 240)

See [the reference][ref] and ![the image][imgref].

[ref]: https://example.com "Ref Title"
[imgref]: pic.png 'Image Title'

---

Closing paragraph. Anchor line ZULU.
