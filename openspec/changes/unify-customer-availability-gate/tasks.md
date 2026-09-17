## 1. 决策落地与文档

- [ ] T1: 归档前，将统一策略作为 ADR 0011 决策 3 的补充说明写入 `docs/adr/0011-customer-authorization-model-and-security-tradeoffs.md`：注明「access token TTL 内，所有受 `CustomerJwtGuard` 保护的写路径一致不校验客户可用性（存在性/`status`/`deletedAt`），业务状态仅在 refresh 路径校验」；并写明触发条件（出现「要求即时封禁」需求时改按守卫层缓存校验路线）。**验证：** ADR 0011 含统一策略注记且可被审阅/CI 引用；不改动其他 ADR 内容。

- [ ] T2: 确认本 change 的 `specs/customer-availability-gate/spec.md` 的 ADDED Requirement 已落地为单一来源。**验证：** `openspec validate unify-customer-availability-gate --strict` 通过。

- [ ] T2b: 新增 `CustomerAvailabilityPolicy` module 作为统一政策的真实代码边界（采纳架构审查候选 1）。interface 暴露政策契约（如 `checksWithinTtl(): false`、`source(): 'adr-0011'`），implementation 读 ADR 0011 注记 / 常量 `CUSTOMER_AVAILABILITY_CHECKED_WITHIN_TTL = false`；所有受保护写路径引用该 interface，消除隐式假设。**验证：** 一个单测断言 `checksWithinTtl() === false` 即覆盖全路径政策；grep 各写路径不再各自隐式假设可用性。

## 2. 代码变更（需协调）

- [ ] T3: **协调项**——待并行变更 `snapshot-inquiry-shipping-address` 归档后，移除 `packages/domain/src/inquiry/inquiries/inquiries.service.ts:144-157` 中 `createForCustomer` 的 `customer.deletedAt` 检查：删除 `select` 投影里的 `deletedAt` 字段及 `if (!customer || customer.deletedAt) throw NotFoundException('CUSTOMER_NOT_FOUND')` 分支；其后 `customer.nickName/email/phoneNumber` 快照改为在写入事务内或经独立轻量查询获取（不再依赖可用性检查查询）。**验证：** 该 `createForCustomer` 不再因 `customer.deletedAt` 返回 404；`customer-auth.service` 的 refresh 校验仍生效；与并行变更的地址归属/快照逻辑无冲突（同文件串行合并后单测通过）。

- [ ] T4: 确认 favorites/history/addresses 写路径无新增客户可用性校验（维持现状，不补 SQL）。**验证：** 在 `customer-activity.service.ts` 与 `customer-addresses.service.ts` 中 grep 无 `customer.status`/`customer.deletedAt` 可用性判断；`CustomerJwtStrategy.validate` 无 DB/Redis 调用。

## 3. 接缝与回归

- [ ] T5: 守卫/策略无状态回归。`CustomerJwtStrategy.validate` 仅依赖 JWT payload，不查 DB/Redis。**验证：** 单测断言 `validate(payload)` 不触发 Prisma/Redis 调用，返回 `{ customerId }`。

- [ ] T6: 软删/禁用客户 TTL 内端到端：以软删客户（与禁用客户）的 access token，分别调用创建询价单/新增收藏/新增地址，TTL 内均通过守卫且无 per-path 404。**验证：** 集成测试覆盖三路径在 TTL 内一致成功；刷新路径仍拒禁用/软删客户。

## 4. 无主数据后续（out of scope 动作项）

- [ ] T7: 归档前记录后续动作——新增「客户软删后异步清理」任务（级联/批量清其 favorites/history/addresses/inquiry，或经后台定期任务），owner 与排期待定，不计入本变更。**验证：** 已创建跟踪工单/任务项，明确归属与范围，不在本 change 内实现。

## 5. 架构审查回写（适配 seam）

- [ ] T8: 在 `CustomerJwtGuard` 与 `CustomerJwtStrategy` 之间预置 `AvailabilityGate` 适配 seam（采纳架构审查候选 3）。interface 定义 `assertWithinTtl(customerId)` 契约，提供 no-op implementation（与路线 ② 一致放行）。**验证：** 守卫单测不依赖该 seam 的具体实现；后续路线 ① 可替换 cached adapter 而不改 `CustomerJwtGuard`/`CustomerJwtStrategy`。
