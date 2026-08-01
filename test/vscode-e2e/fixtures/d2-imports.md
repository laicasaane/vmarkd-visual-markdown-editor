# D2 imports are not supported in a single Markdown block (task 131)

A spread import:

```d2
...@partials/header
service -> db
```

A value import:

```d2
styles: @common/styles
service -> db
```

A self-contained block, which must still render normally:

```d2
service -> db: query
```
