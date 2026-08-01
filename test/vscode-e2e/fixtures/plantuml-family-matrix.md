# PlantUML diagram-family matrix (task 429)

One class diagram + eight non-class families in render order, all with labels deliberately free of
any standalone "A"/"C"/"I"/"E" word (see `plantuml-word-boundary-misread.md` for why that matters —
PlantUML wraps a multi-word label into one `<text>` per WORD, and a bare single-letter word there
trips `renderedIsClass`'s circled-icon heuristic). This fixture is the CLEAN half of the audit:
`isClassSource` routing across the family matrix, with nothing else able to confuse the safety net.

```plantuml
@startuml
class Widget {
  +run()
}
class Gadget
Widget --> Gadget
@enduml
```

```plantuml
@startuml
object Session1
object Session2
Session1 --> Session2
@enduml
```

```plantuml
@startuml
Nora -> Omar: hello
Omar --> Nora: hi there
@enduml
```

```plantuml
@startuml
start
:Prepare order;
:Ship order;
stop
@enduml
```

```plantuml
@startuml
(*) --> "Prepare order"
--> "Ship order"
--> (*)
@enduml
```

```plantuml
@startuml
component "Frontend" as FE
component "Backend" as BE
FE --> BE
@enduml
```

```plantuml
@startuml
[*] --> Waiting
Waiting --> Running
Running --> [*]
@enduml
```

```plantuml
@startuml
actor Visitor
Visitor --> (Browse Catalog)
@enduml
```

```plantuml
@startuml
!include <C4/C4_Container>
Person(user, "User", "Everyday shopper")
System_Boundary(c1, "Online Store") {
  Container(web, "Web App", "React", "Delivers the shopping UI")
}
Rel(user, web, "Uses", "HTTPS")
@enduml
```
