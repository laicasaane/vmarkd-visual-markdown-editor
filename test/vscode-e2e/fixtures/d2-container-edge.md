# D2 container-endpoint edges (task 104 leftover)

An edge whose endpoint is a CONTAINER used to crash dagre — the default layout engine — and take the
whole diagram to the loud raw-text fallback, while `elk` rendered it fine.

```d2
gateway: API gateway

frontend: {
  web
  mobile
}

backend: {
  api
  worker
}

gateway -> frontend
backend -> gateway
frontend.web -> backend.api
```
