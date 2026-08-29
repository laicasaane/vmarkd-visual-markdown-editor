# Mermaid error fixture

A deliberately broken mermaid block (invalid `--<` arrow) to exercise the clean
parse-error box (suppressErrorRendering + `.vmde-mermaid-error`).

```mermaid
flowchart TD
  A --< B
```
