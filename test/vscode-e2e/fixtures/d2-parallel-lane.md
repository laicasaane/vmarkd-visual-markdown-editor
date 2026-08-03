# D2 parallel-run lane (task 494)

The second diagram of the document this was reported on. Its `m2.pseudo -> vault` riser gets
straightened past `m2.resid -> lfp`'s dashed riser, leaving the two ~11 px apart unless
`spreadCloseRuns` pushes them back to ELK's 24 px lane.

```d2
direction: down

mb: "Dedicated mailbox\nExchange Online" { shape: cylinder }

m1: "Module 1 — mailbox ingest" {
  idle: "IMAP IDLE\nmerged 60s cycle"
  fetch: "UID FETCH from last_seen_uid\nfilter uid greater than last"
  hash: "sha256 over raw bytes"
  tx: "single transaction" { shape: hexagon }

  idle -> fetch -> hash -> tx
}

sync: "mailbox_sync_state\nuidvalidity, last_seen_uid" { shape: cylinder }
raw: "raw_message\nimmutable bytes" { shape: cylinder }
q: "ingest_queue" { shape: cylinder }

mb -> m1.idle: EXISTS or sweep
m1.tx -> sync
m1.tx -> raw
m1.tx -> q: insert on conflict do nothing

m2: "Module 2 — decomposition" {
  mime: "MIME decomposition\nunwrap nested forwards\ndeterministic, asserted"
  party: "PartyResolver\ndeepest original sender"
  pseudo: "Pseudonymiser stage 1\nBRAD dictionary, headers, regex"
  resid: "Pseudonymiser stage 2\nresidue detection, LLM"
  seg: "Segmentation\nstructural split, then LLM"

  mime -> party -> pseudo -> resid -> seg
}

q -> m2.mime: claim, skip locked
raw -> m2.mime: read bytes

brada: "BRAD accounts\nlive lookup, INTG-002 stub" { shape: cylinder }
m2.party -> brada: query
brada -> m2.pseudo: "account record\nbecomes the dictionary"

vault: "vault\nplaceholder to real identity" { shape: cylinder }
m2.pseudo -> vault
m2.resid -> vault

lfp: "Langfuse\npersonal-data project" { shape: cylinder }
lfc: "Langfuse\nclean project" { shape: cylinder }
m2.resid -> lfp: real text { style.stroke-dash: 3 }
m2.seg -> lfc: placeholder text only { style.stroke-dash: 3 }

pm: "parsed_message\nJSONB, placeholders in every field" { shape: cylinder }
m2.seg -> pm

m3: "Module 3 — case engine\ncorrelate, merge, decide"
pm -> m3
```
