```d2
direction: right

source_cluster: Left cluster {
  alpha: Left Alpha
  beta: Left Beta
}

target_cluster: Right cluster {
  alpha: Right Alpha
  beta: Right Beta
}

source_cluster.alpha -> target_cluster
source_cluster.beta -> target_cluster.beta
```
