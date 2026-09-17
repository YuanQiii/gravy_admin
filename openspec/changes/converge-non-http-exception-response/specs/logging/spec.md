## ADDED Requirements

### Requirement: 非预期异常的对外响应

当请求因**非 `HttpException`** 的异常失败时，系统 SHALL 返回 500，且在生产环境 SHALL NOT 在响应体中包含原始异常信息（异常 message、堆栈、数据库/驱动细节）。非生产环境 MAY 返回原始 message 以支持调试。该响应 SHALL 保留既有的统一错误包络结构（`success`/`code`/`message`/`data`/`timestamp`/`showType`），仅 `message` 内容按环境收敛。

失败细节 SHALL 在服务端日志中可定位，且 SHALL 由既有访问日志的失败分支（`RequestLogInterceptor`）记录一次——异常过滤器 SHALL NOT 重复记录同一失败。响应 SHALL 能通过请求关联 ID 与对应日志关联。

`HttpException` 分支（业务错误码与参数校验错误消息）SHALL 保持逐字不变，不受本约束影响。

#### Scenario: 生产环境的非预期异常不泄漏内部细节

- **WHEN** 生产环境下一个请求因非 `HttpException` 的异常失败（例如数据库约束错误）
- **THEN** 响应状态码为 500，`message` 为泛化文案（如「服务器内部错误」），不含数据库/驱动/堆栈等内部信息

#### Scenario: 非生产环境保留调试信息

- **WHEN** 非生产环境（dev/test）下同一类异常发生
- **THEN** 响应 `message` 保留原始异常 message，便于本地定位

#### Scenario: 失败细节在日志中可定位

- **WHEN** 上述任一环境下的非预期异常发生
- **THEN** 服务端日志中记录该异常的 message 与堆栈（由访问日志的失败分支记录，且仅记录一次），响应可通过请求关联 ID 与该条日志关联

#### Scenario: 业务错误码不受影响

- **WHEN** 请求因业务异常失败（如资源不存在、状态冲突）
- **THEN** 响应的状态码、`code` 与 `message` 与该约束引入前完全一致（业务错误码逐字保持）
