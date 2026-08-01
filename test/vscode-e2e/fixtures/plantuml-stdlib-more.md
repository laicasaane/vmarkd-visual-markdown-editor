# PlantUML stdlib icon libs — task 354 (offline)

Seven MIT/Apache icon libraries vendored from the plantuml-stdlib aggregator. Each `!include <lib/…>`
must resolve OFFLINE (no "Fatal parsing error", no "not found offline" note). k8s additionally proves the
transitive `<C4/C4>` dependency loads (STDLIB_DEPS), even though the source never names C4.

k8s — `!include <k8s/…>` (builds on C4):

```plantuml
@startuml
!include <k8s/Common>
!include <k8s/OSS/KubernetesSvc>
!include <k8s/OSS/KubernetesPod>
Namespace_Boundary(ns, "Back End") {
  KubernetesSvc(svc, "service", "")
  KubernetesPod(pod, "pod", "")
}
@enduml
```

eip — `!include <eip/…>`:

```plantuml
@startuml
!include <eip/EIP-PlantUML>
left to right direction
package "Orders" {
  MsgChannel(channel1, "In Queue")
  Message(msg, "Order")
  MessageRouter(router, "Router")
}
Send(channel1, msg)
Send(msg, router)
@enduml
```

edgy — `!include <edgy/…>`:

```plantuml
@startuml
!include <edgy/edgy2>
$experienceFacet(Experience, experience)
$brandFacet(Brand) {
  $brand(Brand, brand)
}
$flow(brand, experience, "supports")
@enduml
```

DomainStory — `!include <DomainStory/…>` (mixed-case prefix):

```plantuml
@startuml
!include <DomainStory/domainStory>
Boundary(System) {
  Person(Alice)
  Conversation(weather)
  Person(Bob)
}
activity(1, Alice, talks about the, weather, with, Bob)
@enduml
```

cloudogu — `!include <cloudogu/…>`:

```plantuml
@startuml
!include <cloudogu/common>
!include <cloudogu/dogus/jenkins>
node "Ecosystem" <<$cloudogu>> {
  DOGU_JENKINS(jenkins, Jenkins) #ffffff
}
@enduml
```

cloudinsight — `!include <cloudinsight/…>`:

```plantuml
@startuml
!include <cloudinsight/tomcat>
!include <cloudinsight/redis>
rectangle "<$tomcat>\nwebapp" as webapp
rectangle "<$redis>\ncache" as cache
webapp --> cache
@enduml
```

kubernetes — `!include <kubernetes/…>` (sprite sheet):

```plantuml
@startuml
!include <kubernetes/k8s-sprites-unlabeled-25pct>
rectangle "<$master>\ncontrol" as m
rectangle "<$node>\nworker" as n
m --> n
@enduml
```
