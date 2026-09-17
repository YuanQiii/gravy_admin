## REMOVED Requirements

### Requirement: 询价单状态只读约束

**Reason**: 该 Requirement 声称「B2C 客户端点 SHALL 不提供询价单状态流转能力」，与 ADR 0014 已实现并归档的行为相悖——客户已有 `POST /inquiries/:id/submit` 与 `POST /inquiries/:id/cancel`。文档与实现长期漂移，保留它会让任何按规格实现的探索者写出错误结论。

**Migration**: 由本变更 ADDED 的「客户提交与取消权限边界」取代——保留原 Requirement 的意图（界定客户在状态机上的能力边界），内容按实际能力重写。无代码迁移：实现已存在，本次只纠正文档。

## MODIFIED Requirements

### Requirement: 询价单状态流转

系统 SHALL 强制询价单状态按 `draft → submitted → quoted → expired` 单向流转；反向流转（如 `quoted → submitted`）SHALL 被拒绝。`draft → submitted` 时记录 `submittedAt`；`submitted → quoted` 时记录 `quotedAt` 与可选 `expiresAt`；`quoted → expired` 由定时任务或人工触发。

状态流转 SHALL 以原子方式执行：系统 SHALL 把「期望的当前状态」作为写入的前置条件，使校验与写入构成单一操作；任一并发写入不得使询价单落入「状态与时间戳互斥」的非法组合。当写入前置条件不再成立（状态已被并发操作改变）时，系统 SHALL 返回 409 且 SHALL NOT 写入任何字段。时间戳 SHALL 与状态保持一致：`submitted` 对应 `submittedAt`、`quoted` 对应 `quotedAt`（及可选 `expiresAt`）、`cancelled` 对应 `cancelledAt`；`expired` 不产生新时间戳。

#### Scenario: 提交询价单

- **WHEN** 客户/管理员将 draft 询价单状态改为 submitted
- **THEN** 系统记录 `submittedAt = now()`，状态变为 `"submitted"`

#### Scenario: 非法逆向流转

- **WHEN** 尝试将 quoted 询价单改回 submitted
- **THEN** 系统返回 409 Conflict，错误码 `INQUIRY_INVALID_STATUS_TRANSITION`

#### Scenario: 并发流转只有一个成功

- **WHEN** 两个请求并发对同一 `status = "draft"` 的询价单分别执行提交与取消，且提交先完成
- **THEN** 提交请求成功（`status = "submitted"`、`submittedAt` 非空）；取消请求返回 409；该记录 SHALL NOT 同时具备 `status = "submitted"` 与 `cancelledAt ≠ null`

#### Scenario: 失效更新不写入任何字段

- **WHEN** 一个请求基于已过期的状态视图发起流转，实际状态已被并发操作改变
- **THEN** 系统返回 409，该记录的 `status`、`submittedAt`、`quotedAt`、`expiresAt`、`cancelledAt` 全部保持并发操作后的值不变

#### Scenario: 重复提交被拒

- **WHEN** 对已处于 `submitted` 的询价单再次执行提交
- **THEN** 系统返回 409，状态与 `submittedAt` 均不变

## ADDED Requirements

### Requirement: 客户提交与取消权限边界

客户 SHALL 仅能执行两种状态流转：把本人 `draft` 询价单提交为 `submitted`（`POST /inquiries/:id/submit`），以及把本人 `draft`/`submitted` 询价单取消为 `cancelled`（`POST /inquiries/:id/cancel`，终态）。报价（`submitted → quoted`）、过期（`quoted → expired`）与软删除 SHALL 仅由后台具备相应权限码的运营人员执行；客户 SHALL NOT 能设置 `totalAmount`、`quotedAt`、`expiresAt`。客户对非本人询价单执行流转 SHALL 返回 404，不泄露存在性。Admin 应用 `inquiry/*` 端点行为与权限保持不变。

#### Scenario: 客户提交本人询价单

- **WHEN** 已登录客户对本人 `draft` 询价单调用 `POST /inquiries/:id/submit`
- **THEN** 状态变为 `"submitted"` 并记录 `submittedAt`，后台可查询到该状态

#### Scenario: 客户取消本人询价单

- **WHEN** 已登录客户对本人 `draft` 或 `submitted` 询价单调用 `POST /inquiries/:id/cancel`
- **THEN** 状态变为 `"cancelled"` 并记录 `cancelledAt`，该状态为终态

#### Scenario: 客户不能报价或过期

- **WHEN** 客户尝试把本人询价单置为 `quoted` 或 `expired`（无对应 B2C 端点，或以任何方式构造该意图）
- **THEN** 系统不提供该能力（404/405），报价与过期只能由后台执行

#### Scenario: 客户流转他人询价单

- **WHEN** 已登录客户对不属于本人的询价单调用 `submit` 或 `cancel`
- **THEN** 系统返回 404，不泄露该询价单是否存在

#### Scenario: 后台运营执行报价

- **WHEN** 具备询价单更新权限的后台管理员把 `submitted` 询价单置为 `quoted`
- **THEN** 系统记录 `quotedAt` 与可选 `expiresAt`，客户随后通过 `GET /inquiries/:id` 可见该状态
