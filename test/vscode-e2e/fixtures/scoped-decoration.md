# Scoped decoration fixture (task 173/174)

Several blockquote/code/comment blocks, spread across the document, so a real-VS-Code edit in ONE
block can be checked against the OTHERS staying decorated — proving the block-scoped observers
(code-source.ts, callouts.ts, html-comment.ts) don't silently drop decoration outside their scope.

> [!NOTE]
> First callout — alpha.

<!-- first comment -->

```js
const alpha = 1;
```

This is an edit-target paragraph with enough text in it to find reliably by content match.

See [a link][refone] and also [another][reftwo] for details.

[refone]: https://example.com/one "Reference one"

> [!TIP]
> Second callout — bravo.

<!-- second comment -->

```python
beta = 2
```

Another edit-target paragraph, also long enough to find reliably by content match.

> [!WARNING]
> Third callout — charlie.

<!-- third comment -->

```json
{"gamma": 3}
```

Trailing paragraph.

[reftwo]: https://example.com/two "Reference two"
