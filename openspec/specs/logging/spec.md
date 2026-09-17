# logging Specification

## Purpose

为应用提供统一的、可关联、可检索的可观测性日志能力：所有日志以结构化格式输出，携带请求关联 ID 与上下文，敏感字段自动脱敏，并能被集中采集到可查询的日志平台进行检索与观测。

## Requirements

### Requirement: 结构化日志输出

系统 SHALL 将应用运行日志输出为结构化（JSON）单行记录，每条记录包含时间戳、级别、模块/上下文与消息字段。生产环境 SHALL 输出解析友好的 JSON；开发环境 SHALL 输出便于人读的格式。输出级别 SHALL 由 `LOG_LEVEL` 配置控制，默认与现有语义保持一致（生产仅 warn/error 以上，或按配置提升）。

#### Scenario: 生产输出 JSON

- **WHEN** 应用处于生产环境

- **THEN** 应用输出到 stdout 的日志为单行 JSON 文本，可被 JSON 解析器无损解析

#### Scenario: 开发输出可读格式

- **WHEN** 应用处于开发环境

- **THEN** 应用输出到 stdout 的日志为多行可读格式，便于人工阅读

#### Scenario: 按级别过滤

- **WHEN** `LOG_LEVEL` 配置为 `error`

- **THEN** 低于 error 级别的日志不输出到 stdout

### Requirement: 访问日志

系统 SHALL 为每个已匹配请求记录一条结构性访问日志，包含用户标识（userId）、请求方法、路由、路径、响应状态码、耗时、请求关联 ID、**来源 IP**、User-Agent 与脱敏后的 query。超过慢请求阈值（`LOG_SLOW_MS`，默认 1000ms）的请求 SHALL 附带脱敏后的请求体。来源 IP SHALL 经由单一可信客户端 IP 解析模块（可信代理边界）推导，与登录限流使用同一来源，**不得**直接取请求头 `x-forwarded-for` 首段；该模块按部署拓扑配置 `security.trustedProxy` 决定 IP 归因（参见 `customer` 能力「可信客户端 IP 与登录限流边界」）。

#### Scenario: 记录成功请求

- **WHEN** 一个 GET 请求正常返回 200

- **THEN** 系统记录一条访问日志，包含 method、路由、状态码、耗时与请求关联 ID

#### Scenario: 慢请求附带请求体

- **WHEN** 一次请求的耗时超过 `LOG_SLOW_MS`

- **THEN** 该访问日志附带脱敏后的请求体字段

#### Scenario: 失败请求不重复记录

- **WHEN** 一个请求失败并产生异常

- **THEN** 该失败细节只通过异常日志记录一次，访问日志不再重复记录该失败的错误堆栈，两者通过同一请求关联 ID 关联

#### Scenario: 来源 IP 经可信解析且抗伪造

- **WHEN** 请求携带伪造的 `X-Forwarded-For` 首段、但经受信代理（`security.trustedProxy` 已配置）转发

- **THEN** 访问日志记录的来源 IP 为可信解析模块返回的真实客户端地址，而非伪造头首段

### Requirement: 请求关联 ID

系统 SHALL 为每个进入的请求提供一个关联 ID：优先采用请求头 `x-request-id` 的值，缺失时 SHALL 由系统生成唯一值。该关联 ID SHALL 贯穿同一请求产生的访问日志、异常日志与业务审计日志，供跨记录关联查询。

#### Scenario: 外部头透传

- **WHEN** 请求携带非空的 `x-request-id` 头

- **THEN** 该请求产生的所有日志均携带该头值作为关联 ID

#### Scenario: 缺失时自动生成

- **WHEN** 请求未携带 `x-request-id` 头

- **THEN** 系统生成唯一关联 ID，并用于该请求产生的所有日志

#### Scenario: 关联到业务审计

- **WHEN** 同一请求同时产生业务审计日志

- **THEN** 业务审计日志携带与访问日志一致的关联 ID

### Requirement: 敏感字段脱敏

系统 SHALL 在日志输出前对已知敏感字段（如 `password`、`authorization`、`token`、`secret`）进行脱敏，避免明文泄露。脱敏范围 SHALL 支持通过配置追加自定义字段。数据库业务审计的脱敏规则（`oLogMaskFields`）SHALL 继续独立生效。

#### Scenario: 默认脱敏

- **WHEN** 日志中字段值对应 `password` 或 `authorization`

- **THEN** 输出中被替换为非明文掩码

#### Scenario: 配置追加字段

- **WHEN** 管理员通过配置追加某自定义敏感字段

- **THEN** 该字段在输出日志中被脱敏

### Requirement: 集中采集

系统 SHALL 提供一套可选启用的集中日志采集栈，从应用 stdout 采集结构化日志、按环境/服务等标签组织，并提供可检索界面与日志保留策略。该采集栈 SHALL 独立于主应用分发，默认不随主应用一并启动。

#### Scenario: 可选采集栈

- **WHEN** 运维使用独立的观测编排启动采集栈

- **THEN** 应用 stdout 日志被采集并可按标签检索，无需修改主应用编排

#### Scenario: 日志保留

- **WHEN** 采集栈启用了日志保留策略

- **THEN** 超过保留期的历史日志被清理

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
