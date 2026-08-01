# PlantUML multi-block stress (task 347)

Five icon diagrams (C4 / AWS / Azure, all non-class) in one document — the exact shape that used to
flake with a random "Assumed diagram type: sequence" on the shared TeaVM engine.

```plantuml
@startuml
!include <C4/C4_Container>
Person(user, "User", "A person")
Container(web, "WebOne", "React", "UI")
Rel(user, web, "Uses", "HTTPS")
@enduml
```

```plantuml
@startuml
!include <awslib/AWSCommon>
!include <awslib/Compute/EC2>
EC2(srv, "ServerTwo", "t3.micro")
@enduml
```

```plantuml
@startuml
!include <azure/AzureCommon>
!include <azure/Compute/AzureVirtualMachine>
AzureVirtualMachine(vm, "VmThree", "Standard_D2s_v3")
@enduml
```

```plantuml
@startuml
!include <awslib/AWSCommon>
!include <awslib/Compute/EC2>
EC2(srv2, "ServerFour", "t3.large")
@enduml
```

```plantuml
@startuml
!include <C4/C4_Container>
Container(web2, "WebFive", "Vue", "UI")
@enduml
```
