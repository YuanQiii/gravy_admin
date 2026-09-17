## MODIFIED Requirements

### Requirement: 询价单状态流转

系统 SHALL 强制询价单状态按 `draft → submitted → quoted → expired` 单向流转；反向流转（如 `quoted → submitted`）SHALL 被拒绝。`draft → submitted` 时记录 `submittedAt`；`submitted → quoted` 时记录 `quotedAt` 并 SHALL 强制提供 `expiresAt`（不可为空），否则系统 SHALL 拒绝该流转；`quoted → expired` SHALL 仅由后台人工状态流转（admin/ops 显式执行）抵达，系统 SHALL NOT 在任一读路径（列表/详情查询）中对 `quoted` 行执行任何过期写操作。

#### Scenario: 提交询价单

- **WHEN** 客户/管理员将 draft 询价单状态改为 submitted
- **THEN** 系统记录 `submittedAt = now()`，状态变为 `"submitted"`

#### Scenario: 非法逆向流转

- **WHEN** 尝试将 quoted 询价单改回 submitted
- **THEN** 系统返回 409 Conflict，错误码 `INQUIRY_INVALID_STATUS_TRANSITION`

#### Scenario: 报价必须携带有效期

- **WHEN** 后台将 submitted 询价单状态改为 quoted 且未提供 `expiresAt`
- **THEN** 系统拒绝该流转（校验失败，返回 400 类错误），询价单保持 `submitted`

#### Scenario: 读路径不触发过期写

- **WHEN** 调用任一询价单列表或详情查询端点（Admin 或 Mall）
- **THEN** 查询返回后，数据库中 `status='quoted'` 的行不因该查询而变为 `expired`（查询端点不修改任何行状态）

## ADDED Requirements

### Requirement: 询价单过期派生展示态

系统 SHALL 在询价单响应（Admin 与 Mall 的列表与详情）中提供派生只读布尔 `isExpired`：`status='quoted'` 且 `expiresAt` 非空且早于当前时间时为真；其余情况（含 `status` 非 `quoted`，或 `expiresAt` 为空/未到）为假。`isExpired` SHALL NOT 修改 `status` 字段、SHALL NOT 落库，仅用于展示。物理 `expired` 状态仍仅由后台人工状态流转产生。

#### Scenario: 管理员见派生过期标记

- **WHEN** 后台查询一条 `status='quoted'` 且 `expiresAt` 早于当前时间的询价单
- **THEN** 响应中 `isExpired` 为 `true`，且 `status` 仍为 `"quoted"`（未落库变更）

#### Scenario: 未过期报价标记为假

- **WHEN** 某 `status='quoted'` 询价单的 `expiresAt` 晚于当前时间
- **THEN** 响应中 `isExpired` 为 `false`

#### Scenario: 非 quoted 状态标记恒为假

- **WHEN** 询价单 `status` 非 `quoted`（如 `draft` / `submitted` / `expired` / `cancelled`），无论 `expiresAt` 取值
- **THEN** 响应中 `isExpired` 为 `false`

## REMOVED Requirements

（无）
