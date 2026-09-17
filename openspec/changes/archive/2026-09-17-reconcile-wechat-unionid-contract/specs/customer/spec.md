## MODIFIED Requirements

### Requirement: 客户模型与管理员分离

系统 SHALL 将 B2C 消费者建模为独立的 `Customer` 实体，不复用现有管理员 `User` 模型。`Customer` 字段包含：`customerId` (UUID 业务 ID)、`username`（唯一）、`password`、`email`（唯一）、`phoneNumber`（唯一）、`nickName`、`avatar`、`status`（默认 `"enabled"`，值：enabled/disabled）、`openid`（微信，唯一，可空）、`unionid`（微信，唯一，可空）。`Customer` 不携带 `createdById`/`updatedById` 审计字段（B2C 自助注册/微信登录无操作管理员）。

#### Scenario: 客户注册

- **WHEN** 消费者提交 `username`/`password`/`email` 注册
- **THEN** 系统创建 `Customer`，`status = "enabled"`，返回 `customerId`；密码经哈希后存储，明文不落库

#### Scenario: 微信登录创建客户

- **WHEN** 微信 `code2Session` 仅返回 `openid`，系统未找到对应 `Customer`
- **THEN** 系统自动创建 `Customer`，仅写入 `openid`（`unionid` 本期不写入，仅可由后台 `customers` 模块手工维护），`username` 自动生成（形如 `wx_{openid 后 12 位}`），`password` 为随机占位哈希

#### Scenario: 客户与管理员查询隔离

- **WHEN** 后台管理员查询客户列表
- **THEN** 系统仅返回 `Customer` 表记录，不返回 `User` 表；响应不含 `password`、`id`（自增）、`openid`/`unionid` 全量明文（脱敏为前 4 后 4）

## ADDED Requirements

### Requirement: 微信登录契约（仅 openid，unionid 待接入）

系统 SHALL 在微信小程序静默登录（`wechatLogin`）中仅消费 `code2Session` 返回的 `openid` 定位或创建 `Customer`；本期 SHALL NOT 依赖或写入 `unionid`。系统 SHALL 明确：`unionid` 归并与跨小程序账号合并均不在本期范围，其前置条件为接入微信开放平台绑定（同主体多小程序/公众号）使 `code2Session` 返回 `unionid`。后台 `customers` 模块 SHALL 继续保留 `unionid` 的手工读写入口（创建/更新时可选填并做唯一校验），与微信静默登录路径相互独立。

#### Scenario: 微信登录仅消费 openid

- **WHEN** 微信 `code2Session` 仅返回 `openid`（个人主体小程序不返回 `unionid`）
- **THEN** 系统以 `openid` 定位或创建 `Customer`，登录照常成功，不产生 `unionid` 写入或归并错误

#### Scenario: 本期不实现 unionid 归并

- **WHEN** 同一自然人通过不同途径产生多个 `Customer`
- **THEN** 系统不自动合并，各 `Customer` 的收藏与历史各自独立（与 ADR 0012 决策 2 一致）

#### Scenario: 后台手工维护 unionid

- **WHEN** 管理员在后台创建/更新 `Customer` 时填写 `unionid`
- **THEN** 系统对 `unionid` 做唯一性校验后写入，不影响微信静默登录路径

#### Scenario: unionid 归并前置条件未满足

- **WHEN** 项目未接入微信开放平台绑定、`code2Session` 不返回 `unionid`
- **THEN** 系统不触发任何 `unionid` 归并逻辑，spec 与 ADR 0012 保持一致声明"unionid 待接入"

## REMOVED Requirements

（无）
