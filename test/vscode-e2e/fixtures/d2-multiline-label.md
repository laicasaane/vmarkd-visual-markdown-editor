# D2 multi-line labels (task 493)

Every label here carries an explicit `\n`; real d2 draws one row per line, and the widest of them is
far wider than its box if it is drawn as a single run.

```d2
direction: down

mb: "Dedicated mailbox\nExchange Online" { shape: cylinder }
m2: "Module 2 — message decomposition\ndecompose, identify, pseudonymise, segment"

m1: "Module 1 — mailbox ingest\nfetch, deduplicate, queue" {
  hash: "sha256 over raw bytes"
}

mb -> m1.hash
m1 -> m2: "needs_info\nask_bradbury\nnothing_new"
```
