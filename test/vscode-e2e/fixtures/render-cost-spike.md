# Render cost spike

A heavier mermaid graph (more nodes → more dagre layout work):

```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|yes| C[Step C]
  B -->|no| D[Step D]
  C --> E[Step E]
  D --> F[Step F]
  E --> G[Step G]
  F --> G
  G --> H{Another}
  H -->|a| I[Branch I]
  H -->|b| J[Branch J]
  I --> K[Merge K]
  J --> K
  K --> L[End]
```

A d2 diagram (WASM compile + ELK layout on the main thread):

```d2
server: Web Server
db: Database
cache: Redis Cache
client: Client
client -> server: request
server -> cache: check
cache -> server: miss
server -> db: query
db -> server: rows
server -> client: response
```

End.
