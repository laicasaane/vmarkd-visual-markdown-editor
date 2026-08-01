# PlantUML theme-flip regression

Three PlantUML blocks that bake their palette at render time, so a live theme flip must re-render them
— and must do so ONCE, not twice (the reThemeMono foreground poll used to double-fire).

```plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi there
@enduml
```

```plantuml
@startuml
class Foo {
  +id: int
  +run(): void
}
class Bar
Foo --> Bar : uses
@enduml
```

```plantuml
@startuml
start
:read input;
if (valid?) then (yes)
  :process;
else (no)
  :reject;
endif
stop
@enduml
```
