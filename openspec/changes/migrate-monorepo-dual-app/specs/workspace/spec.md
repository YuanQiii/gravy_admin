# workspace

## Purpose

定义 Monorepo 双应用工作区的运行时与结构契约：Admin（运营端）与 Mall（商城端）作为两个独立部署的 NestJS 应用共存于同一仓库，共享 `@gvray/core` 与 `@gvray/domain` 两个内核包，两端互不感知对方的进程与内部实现。

## ADDED Requirements

### Requirement: 双应用独立部署

系统 SHALL 以两个独立可部署的应用形态交付：Admin 应用（运营端）与 Mall 应用（商城端），各自拥有独立的进程、端口、容器与 Swagger API 文档。一个应用的启停、发版或崩溃 SHALL 不影响另一个应用的可用性与进行中的请求。Mall 侧端点 SHALL 不出现在 Admin 应用的端口上，Admin 侧端点 SHALL 不出现在 Mall 应用的端口上。

#### Scenario: Mall 应用重启不影响 Admin

- **WHEN** Mall 应用容器重启或重新部署
- **THEN** Admin 应用进程不受影响，其进行中的请求正常完成，端口持续可访问

#### Scenario: Admin 端口不暴露 Mall 路由

- **WHEN** 请求指向 Admin 应用端口上的 Mall 侧端点（如浏览滤清器列表的商城路由）
- **THEN** 系统返回 404，该路由不存在于 Admin 应用

#### Scenario: 各自独立的 API 文档

- **WHEN** 分别访问 Admin 应用与 Mall 应用的 Swagger 文档入口
- **THEN** Admin 文档仅含运营端路由，Mall 文档仅含商城端路由，两份文档互不混杂

### Requirement: 应用间依赖方向约束

工作区 SHALL 维持单向依赖结构：`apps/admin` 与 `apps/mall` 互不 import 对方任何代码，二者仅依赖共享内核包；`@gvray/domain`（领域包）SHALL 仅依赖 `@gvray/core`，不依赖任何 app。Mall 应用对运营端领域能力的访问面 SHALL 仅限共享领域包暴露的 services 与 DTOs，SHALL 不接触 Admin 应用的控制器与管理专用查询能力。

#### Scenario: 应用源码互不引用

- **WHEN** 检查两个应用与共享包源码的全部 import 依赖
- **THEN** `apps/admin` 与 `apps/mall` 之间不存在任何 import 边；`packages/domain` 对 apps 无 import 边

#### Scenario: Mall 消费共享领域服务

- **WHEN** Mall 应用的浏览控制器查询设备与滤清器数据
- **THEN** 它通过共享领域包的 service 接口调用，调用面不包含 Admin 专用的管理查询方法

### Requirement: 限流预算按应用独立核算

两个应用的限流配额 SHALL 相互独立：Mall 应用的全局默认限流与 Admin 应用的全局默认限流各自计数，一端流量饱和 SHALL 不挤占另一端的配额。Mall 公开浏览端点既有的每分钟 60 次收紧配额 SHALL 保持不变。

#### Scenario: Mall 流量饱和不挤占 Admin 配额

- **WHEN** Mall 应用承受大量匿名流量并触发限流
- **THEN** Admin 应用的限流计数不受 Mall 流量影响，Admin 请求仍按自身配额正常处理

#### Scenario: Mall 公开浏览限流保持

- **WHEN** 同一 IP 在 60 秒内调用任一 Mall 公开浏览 GET 端点超过 60 次
- **THEN** Mall 应用返回 429 Too Many Requests，响应头包含 `Retry-After`

### Requirement: 横切设施按应用挂载

请求日志（结构化访问日志）、统一响应包装与异常响应格式 SHALL 两个应用共同具备，行为一致。数据库操作审计（OperationLog）与功能开关守卫（FeatureFlag）SHALL 仅挂载于 Admin 应用：Mall 应用的任何请求 SHALL 不产生操作审计数据库写入，也 SHALL 不触发功能开关配置查询。Admin 应用的横切挂载与现状保持一致。

#### Scenario: Mall 匿名请求不产生审计写

- **WHEN** 匿名访客请求 Mall 浏览端点并成功返回
- **THEN** 系统不向操作审计表（OperationLog）写入任何记录，但结构化访问日志正常记录该请求

#### Scenario: Mall 请求不触发功能开关查询

- **WHEN** 任意请求到达 Mall 应用
- **THEN** 该请求处理过程中不发生针对功能开关配置存储的查询

#### Scenario: Admin 审计行为不变

- **WHEN** Admin 登录用户执行带审计语义的写操作
- **THEN** 操作审计记录照常写入，含请求关联 ID，与迁移前行为一致
