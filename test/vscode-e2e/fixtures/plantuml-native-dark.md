# PlantUML stdlib on a dark theme — library-native vs compensated (task 384)

`domainstory` and `awslib` read `PUML_MODE` and theme themselves; `k8s` does not and keeps our
light-page compensation.

```plantuml
@startuml
!include <DomainStory/domainStory>
Person(customer, "Customer")
Document(order, "Order")
activity(1, customer, places, order)
@enduml
```

```plantuml
@startuml
!include <awslib/AWSCommon>
!include <awslib/Compute/EC2>
EC2(web, "Web Server", "t3.micro")
@enduml
```

```plantuml
@startuml
!include <k8s/Common>
!include <k8s/OSS/KubernetesPod>
KubernetesPod(pod, "Pod", "app")
@enduml
```
