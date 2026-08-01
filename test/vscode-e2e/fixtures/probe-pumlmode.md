# probe: does one injected PUML_MODE line reach every library that reads it?

`awslib` tests `%variable_exists("$PUML_MODE") && $PUML_MODE == "dark"`; `domainstory` tests bare
`PUML_MODE == "light"`. If the `$` prefix is just syntax sugar, ONE injected line covers both.

Block 0 — awslib baseline.

```plantuml
@startuml
!include <awslib/AWSCommon>
!include <awslib/Compute/EC2>
!include <awslib/Database/DynamoDB>
EC2(web, "Web Server", "t3.micro")
DynamoDB(db, "Table", "on-demand")
web --> db
@enduml
```

Block 1 — awslib with the BARE name.

```plantuml
@startuml
!global PUML_MODE = "dark"
!include <awslib/AWSCommon>
!include <awslib/Compute/EC2>
!include <awslib/Database/DynamoDB>
EC2(web, "Web Server", "t3.micro")
DynamoDB(db, "Table", "on-demand")
web --> db
@enduml
```

Block 2 — awslib with the `$` name.

```plantuml
@startuml
!global $PUML_MODE = "dark"
!include <awslib/AWSCommon>
!include <awslib/Compute/EC2>
!include <awslib/Database/DynamoDB>
EC2(web, "Web Server", "t3.micro")
DynamoDB(db, "Table", "on-demand")
web --> db
@enduml
```

Block 3 — domainstory with the `$` name (its own test is on the bare name).

```plantuml
@startuml
!global $PUML_MODE = "dark"
!include <DomainStory/domainStory>
Person(customer, "Customer")
Document(order, "Order")
System(shop, "Shop")
activity(1, customer, places, order, "in", shop)
@enduml
```

Block 4 — C4, which reads neither, as a control that the injected line is inert there.

```plantuml
@startuml
!global PUML_MODE = "dark"
!include <C4/C4_Container>
Person(user, "User")
Container(api, "API", "Go", "Does things")
Rel(user, api, "uses")
@enduml
```
