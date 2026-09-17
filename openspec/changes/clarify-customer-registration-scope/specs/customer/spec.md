## REMOVED Requirements

### Requirement: 客户模型与管理员分离

**Reason**: 该 Requirement 的首个 Scenario「客户注册」描述了一条**不存在**的开通路径——Mall 应用没有任何注册端点（`apps/mall/src/modules/customer-auth/customer-auth.controller.ts` 仅有 `login`/`wechat-login`/`refresh`/`logout`），客户账号只能由后台创建或微信静默登录自动生成。文档承诺了不可用的能力，属规格虚挂；同一 Scenario 中「`unionid` 写入」「`username` 为 `wx_{openid前8位}`」两处措辞亦与实现不符（由 `reconcile-wechat-unionid-contract` 处理）。

**Migration**: 由本变更 ADDED 的「客户模型、账号来源与管理员分离」取代——实体字段契约原样保留，删除注册场景，改为断言真实的账号来源与「Mall 不提供自助注册」。若产品后续需要 H5/公众号自助开通，应新建独立变更引入 `POST /auth/register` 并重写该 Requirement，而不是复活本 Scenario。

## ADDED Requirements

### Requirement: 客户模型、账号来源与管理员分离

系统 SHALL 将 B2C 消费者建模为独立的 `Customer` 实体，不复用现有管理员 `User` 模型。`Customer` 字段包含：`customerId`（UUID 业务 ID）、`username`（唯一）、`password`、`email`（唯一）、`phoneNumber`（唯一）、`nickName`、`avatar`、`status`（默认 `"enabled"`，值：enabled/disabled）、`openid`（微信，唯一，可空）、`unionid`（微信，唯一，可空）。`Customer` 不携带 `createdById`/`updatedById` 审计字段。

`Customer` 账号的来源 SHALL 仅有两条：① 具备客户管理权限的后台管理员在 Admin 应用创建；② 微信静默登录时按 `openid` 未命中而由系统自动建号。Mall 应用 SHALL NOT 提供客户自助注册端点，也 SHALL NOT 提供设置或修改密码的端点；客户凭据由后台开号时设定，微信自动建号写入的密码 SHALL 为不可用于密码登录的占位值。

#### Scenario: 账号由后台创建

- **WHEN** 后台管理员在 Admin 应用提交客户 `username`/`password`/`email`
- **THEN** 系统创建 `Customer`，`status = "enabled"`，密码经哈希后存储（明文不落库），响应不含 `password` 与数据库自增 `id`

#### Scenario: 账号由微信静默登录创建

- **WHEN** 微信登录回调携带 `openid`，且系统未找到对应 `Customer`
- **THEN** 系统自动创建 `Customer`，`openid` 写入，`username` 按微信登录契约自动生成，`password` 为不可用于密码登录的占位哈希

#### Scenario: Mall 不提供自助注册

- **WHEN** 匿名请求访问 Mall 应用的注册类路径（如 `POST /auth/register`）
- **THEN** 系统返回 404，不创建任何客户账号

#### Scenario: 客户与管理员查询隔离

- **WHEN** 后台管理员查询客户列表
- **THEN** 系统仅返回 `Customer` 表记录，不返回 `User` 表；响应不含 `password`、`id`（自增）、`openid`/`unionid` 全量明文（脱敏为前 4 后 4）
