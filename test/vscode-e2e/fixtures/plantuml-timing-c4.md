# PlantUML phase-timing fixture (task 430)

Two C4 diagrams, both `!include <C4/C4_Container>` (so `nonClass`, per `isClassSource`). Different
diagram text (different `data-code` hash) so the SECOND block is not a render-cache hit of the first
— but it DOES reuse the already-warm `nonClass` engine instance and the already-loaded C4 stdlib
file-map, so its `engineImport` phase should read near-zero while `stdlibExpand` (textual expansion
only, no `loadScript`) and `engineRender` are still paid close to in full. That is the "engine-warm"
data point the phase-timing spec pairs against a genuine disk-cache HIT (produced separately, by
closing and re-opening this same file — see `abc-flip-cache-hit.spec.ts` for the proven pattern).

```plantuml
@startuml
!include <C4/C4_Container>
Person(user, "User", "Everyday banking customer")
System_Boundary(c1, "Internet Banking") {
  Container(web, "Web App", "React", "Delivers the UI")
}
Rel(user, web, "Uses", "HTTPS")
@enduml
```

```plantuml
@startuml
!include <C4/C4_Container>
Person(admin, "Admin", "An operator")
System_Boundary(c2, "Back Office") {
  Container(api, "Back Office API", "Node", "Serves admin requests")
}
Rel(admin, api, "Uses", "HTTPS")
@enduml
```
