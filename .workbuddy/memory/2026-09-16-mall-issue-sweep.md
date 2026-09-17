# Mall 遗留问题清单 · 逐项规划 + 架构审查（2026-09-16/17）

来源：`reports/mall-business-review-20260916.html` 的 18 项问题（P0-1 已由归档变更 `2026-09-16-expose-inquiry-lines-in-detail` 修复）。
流程：每项 `openspec-propose` 生成 4 件规划件 → `improve-codebase-architecture` 审查规划件 → 按推荐项回写 design/tasks → 压缩记录。
决策口径：过程中所有提问一律按「同意推荐」处理。**17 项问题 → 17 个未归档变更，全部通过 `openspec validate --strict`。**

## 进度总览

| 问题 | 变更名 | 状态 |
|---|---|---|
| P0-2 地址快照 | `snapshot-inquiry-shipping-address` | ✅ **已归档**（2026-09-17，主规格已同步） |
| P0-3 状态流转原子化 | `atomic-inquiry-status-transition` | ✅ **已归档**（`ca25754`；主规格同步 + P1-3 重放） |
| P1-1 + P3-1 编号生成 | `deepen-inquiry-no-generation` | 🚧 已实施 11/12（BREAKING 6 位序号已生效，待归档） |
| P1-2 限流信任边界 | `harden-client-ip-trust-boundary` | 🚧 已实施 9/9 并**已提交**（`af9b0e5`；待归档） |
| P1-3 过期语义 | `resolve-inquiry-expiry-semantics` | 🚧 已实施 13/13 并**已提交**（`493f0dd`；delta 已三次重放至最新主规格） |
| P2-1 排序白名单 | `whitelist-pagination-sort-params` | 🚧 已实施 15/15 并**已提交**（`bcd2b20`；待归档） |
| P2-1b 异常响应收敛 | `converge-non-http-exception-response` | 🚧 已实施 13/14 并**已提交**（`6e19107`；待归档） |
| P2-2 自域 Query DTO | `align-mall-self-query-dtos` | 🚧 已实施 12/12 并**已提交**（`a1f7cbd`；待归档） |
| P2-3 客户门禁一致化 | `unify-customer-availability-gate` | 🚧 已实施 9/9 并**已提交**（`de93a3a`；待归档） |
| P2-4 地址归属校验 | `validate-inquiry-shipping-address-ownership` | ✅ **已归档**（2026-09-17，主规格同步 + 触发 P3-6 二次重放） |
| P2-5 recordView 异步化 | `take-history-write-off-request-path` | 🚧 已实施 10/10 并**已提交**（`a5229fe`；待归档） |
| P2-6 热门品牌下推 | `bound-hot-brand-candidate-set` | 🚧 已实施 12/12 并**已提交**（`0b39597`；待归档） |
| P3-2 软删/硬删统一 | `unify-soft-delete-mechanics` | ✅ |
| P3-3 幂等收藏状态码 | `align-favorite-idempotent-status` | 🚧 已实施 6/7 并**已提交**（待归档） |
| P3-4 unionid 契约 | `reconcile-wechat-unionid-contract` | 🚧 已实施 11/11 并**已提交**（待归档） |
| P3-5 自助注册范围 | `clarify-customer-registration-scope` | 🚧 已实施 8/10 并**已提交**（待归档） |
| P3-6 价格聚合口径 | `derive-inquiry-price-aggregates` | 🚧 已实施 17/20 并**已提交**（`1462744`；回填迁移暂缓有据） |

审查报告（系统临时目录，不落仓库）：`C:\Users\Admin\AppData\Local\Temp\architecture-review-<issue>-<slug>.html`（17 份；P0-2 为 `architecture-review-20260916-235219.html`）。

## ⚠️ 未归档变更之间的串行约束（实施前必读）

多个变更改写**同一文件的同一段代码**或**同一 Requirement**，必须串行归档/实现，否则 delta 互相覆盖：

1. **`inquiries.service.ts`（改动面最大）**：`snapshot-inquiry-shipping-address`（create/createForCustomer + 快照接缝）、`validate-inquiry-shipping-address-ownership`（管理端归属校验，**依赖前者落地**）、`atomic-inquiry-status-transition`（流转接缝）、`derive-inquiry-price-aggregates`（报价时重算 + create 不再透传 totalAmount）、`resolve-inquiry-expiry-semantics`（报价时 expiresAt 必填）、`unify-customer-availability-gate`（移除 inquiry 里唯一的客户 deletedAt 检查）、`deepen-inquiry-no-generation`（create/createForCustomer 的编号段）。
   建议顺序：**P0-2 → P2-4 → P0-3 → P1-1 → P3-6 → P1-3 → P2-3**（由"改动面重叠最大 / 被依赖"排前）。
2. **`openspec/specs/inquiry/spec.md` 的「询价单创建」Requirement**：被 `snapshot-inquiry-shipping-address`（已归档）、`validate-inquiry-shipping-address-ownership`（已归档）、`derive-inquiry-price-aggregates` 三者 MODIFIED。**该链已实际发生两次连锁失效：每次归档后，其余未归档变更的 MODIFIED 块都会因缺场景/缺描述段被 validate --strict 拒绝，须对着合并后的主规格逐段重放（描述段也要对齐，不能只补场景名）。**
3. **`openspec/specs/customer/spec.md` 的「客户模型与管理员分离」Requirement**：被 `reconcile-wechat-unionid-contract` 与 `clarify-customer-registration-scope` 同时 REMOVED + ADDED。**先 P3-4 再 P3-5**（P3-5 的 ADDED 刻意不重复 unionid/username 细则，只引用"微信登录契约"）。
4. **客户可用性删除检查**：`unify-customer-availability-gate`（移除 `createForCustomer` 的 `customer.deletedAt` 检查）与 `snapshot-inquiry-shipping-address`（改写同一方法）冲突——P2-3 的 tasks 已写明"待 P0-2 归档后执行移除"。
5. **地址删除语义**：`unify-soft-delete-mechanics`（删 `CustomerAddress.deletedAt` 列）与 `snapshot-inquiry-shipping-address`（保留 `onDelete: SetNull`）已对齐为自洽组合（硬删触发 SetNull、快照兜住信息）。
6. **客户端 IP / 请求上下文**：`converge-non-http-exception-response` 只做 `req.id` 半边（回写响应头），ip 半边留给 `harden-client-ip-trust-boundary`，避免抢同一文件。
7. **`require` 顺序**：`resolve-inquiry-expiry-semantics` 复用 `atomic-inquiry-status-transition` 的 `buildStatusPatch` 接缝。

## 各问题要点（问题 → 方案 → 审查采纳 → 事实修正）

### P0-2 · `snapshot-inquiry-shipping-address`
- 问题：`Inquiry.shippingAddressId` 是引用不是快照；地址硬删 + DB 外键 `ON DELETE SET NULL` 静默清空 → 已提交/已报价询价单收货地址永久丢失。
- 方案：Inquiry 增 7 个快照字段（创建时冻结、不可变），`shippingAddressId` 降为溯源引用并**保留 SetNull**（不新增删除失败路径），迁移含存量回填。
- 审查采纳：A（Strong）`resolveShippingSnapshot` 收进归属校验（`ownerCustomerId` 入参）、客户路径事务外校验**净删除**；B（Worth exploring）`ShippingSnapshotShape` + `SHIPPING_SNAPSHOT_SELECT` 编译期锁步；C（Speculative）否决——回填不抽 module。
- 事实修正：`AGENTS.md` 声称 `relationMode = "prisma"`「无外键约束」为**不实**——datasource 未声明该选项，`0_init` 建立了真实 FK（SetNull 是 DB 级行为）。已列入 tasks 4.2。

### P0-3 · `atomic-inquiry-status-transition`
- 问题：两条流转路径都是「读状态 → 校验 → 按 `inquiryId` 无条件 update」，非事务、无版本列 → 并发可写出 `status=submitted ∧ cancelledAt≠null`。
- 方案：条件写（`where` 带 `expectedStatus` + `deletedAt`）+ 影响行数断言；`count=0` 重读归因 404/409；不引入版本列/事务/FOR UPDATE；409 复用既有错误码。
- 审查采纳：A（Strong）`buildStatusPatch` 收进接缝内部；B（Worth exploring）失败归因由接缝负责（`scope` 可选入参）；C 不做（属 P1-3）。
- 规格漂移修正：主规格「询价单状态只读约束」与 ADR 0014 相悖 → 用 **REMOVED + ADDED**（新增「客户提交与取消权限边界」）。`validate --strict` 明确拒绝部分改写的 MODIFIED（"MODIFIED omits scenario(s)"），RENAMED + MODIFIED 方案已尝试并放弃。

### P1-1 + P3-1 · `deepen-inquiry-no-generation`
- 问题：编号 `INQ{YYYYMM}-{4位}` 单月第 10000 单起新建全部 500；`create`/`createForCustomer` 双份同构实现。
- 方案：抽 `nextInquiryNo` 深模块（序号推导 + advisory lock + P2002 重试 + 超限行为）；序号 4 → **6 位零填充**（**BREAKING**，规格 line 28 写死了 4 位，需同步）。
- 审查采纳：A（Strong）深模块；B（Worth exploring）6 位等宽 + 数值比较下沉；C 暂缓（计数表/sequence 过度设计）。
- **事实修正（重要）**：主因**不是**报告说的「`slice(-4)` 得 `0000`」，而是 `orderBy: { inquiryNo: 'desc' }` 的**字典序误判最大值**（存在 `-10000` 时 `-9999` 被判更大 → 候选已存在 → P2002 → 500）。6 位等宽使字典序恒等于数值序，从根消除。`inquiryNo` 为 `TEXT` + 仅全局唯一约束，**改位数无需改表**。

### P1-2 · `harden-client-ip-trust-boundary`
- 问题：`resolveClientIp` 无条件信任 XFF 首段、未设 `trust proxy` → 随机头绕过登录 10/min 限流（ADR 0011 决策 5 前提失效）。
- 方案：收成唯一 deep module + 紧贴的 trust-boundary 配置 module；代理层数**必须配置化**。
- 审查采纳：1（Strong）删除副本、interface 即测试面；2（Worth exploring）config module 贴构造点；3（Speculative）否决——Redis 限流 store 属正交问题（切 Redis 仍以伪造 IP 为键）。
- 事实修正：`docker-compose` **无 nginx**（应用直连 3000/3001），`nginx.conf.example` 才是 1-hop 手动部署 → trust proxy 必须可配；限流 store 当前是**内存**；直读 XFF 的有 **3 处**（含 request-log、operation-log 拦截器）。
- delta 覆盖 `customer` + `logging` 两个 capability。

### P1-3 · `resolve-inquiry-expiry-semantics`
- 问题：`expireDueQuoted()` 在 4 个读路径前置全表 `updateMany`，与 ADR 0014 决策 5 直接冲突。
- 选定路线：**派生展示态**——移除 `expireDueQuoted` 与 4 处调用（`findMyInquiries:269`/`findOneForCustomer:292`/`findAll:384`/`findOne:427`），改为响应计算 `isExpired`（不落库）；物理 `expired` 仅人工流转；**BREAKING**：`submitted → quoted` 强制 `expiresAt`。
- 为什么不改 ADR 承认被动过期：仓库**零调度基础设施**（无 `@nestjs/schedule`/cron/bull），定时任务子选项要新增整模块；作用域收敛子选项仍是读路径写。派生态零新增依赖且直接消除写放大。
- 审查采纳：C1（Strong）`isInquiryExpired` 纯函数；C2 前瞻 read adapter 接缝；C3 暂缓（schema 约束）。

### P2-1 · `whitelist-pagination-sort-params`
- 问题：`sortBy`/`sortOrder` 无白名单进入 Prisma `orderBy` → 500 且原始异常 message 原样回显（匿名可触发）。
- 方案：白名单落在**共享基类** `PaginationSortDto`（单一自定义 `@Validate` + 可覆盖 `allowedSortBy`），避免 16 处重复样板。
- 审查采纳：1（Strong）默认排序字段由白名单主字段派生；2 删除孤儿 `SortDto` 浅重复；3 声明式 `@SortWhitelist`。
- 事实修正：继承者是 **16 个源 DTO**（domain 7 + mall 3 + admin 6），非报告称的 5 个；`ValidationPipe` 已启用 `whitelist/transform/forbidNonWhitelisted`。子项 (b) 拆出为独立变更（见 P2-1b）。

### P2-1b · `converge-non-http-exception-response`
- 问题：`HttpExceptionFilter` 非 `HttpException` 分支把原始异常 message 原样下发（含字段名/查询片段/驱动细节），状态码 500。
- 方案：生产环境泛化文案、非生产保留 message；**不动日志**（`RequestLogInterceptor` 已是失败日志唯一所有者，`logging/spec.md` 有「失败请求不重复记录」场景）；关联 ID 由 `request-id.middleware` 回写响应头（ID 的所有者）。
- 审查采纳：A（Strong）抽纯函数 `resolveErrorPresentation(exception, {isProduction})`，filter 退化为薄适配器；B 只做 id 半边（ip 半边留给 P1-2）；C（错误码常量表）记为后续。
- 边界：`HttpException` 分支逐字不变（业务错误码是对外契约）。

### P2-2 · `align-mall-self-query-dtos`
- 问题：地址/收藏/历史 Query DTO 声明了不被消费的参数（地址的 `customerId/receiver/phone` 全死；收藏/历史的 `customerId` 被控制器覆写为 no-op），Swagger 契约失真。
- 方案：拆 `*SelfQueryDto`（无 `customerId`），identity 只经 `@CurrentCustomer()`；删除 `receiver`/`phone`（选删除而非实现：PII 模糊查询会暴露 PII、触发全表 LIKE，属未评审新功能）。**BREAKING**：`forbidNonWhitelisted` 下旧客户端传被删字段从"静默忽略"变 **400**。
- 审查采纳：1（Strong）合并 self 查询 DTO 为深模块；2（Worth exploring）共享测试适配器；3 否决（query→where 适配器对 2 个调用点过度工程）。
- 事实修正：admin 用的是**独立本地 DTO**，拆分对 admin **零影响**；收藏/历史的 `filterId` **真实有效**（保留）。

### P2-3 · `unify-customer-availability-gate`
- 问题：只有 `createForCustomer` 查 `customer.deletedAt`，收藏/历史/地址写路径完全不查，同一语义结论不同。
- 选定路线：**路线 ②**——一致接受"TTL 内不校验"，写 ADR 0011 决策 3 补充，**移除** inquiry 里唯一多余的检查以消除分叉。
- 理由：`CustomerJwtStrategy.validate` **确实无状态**（只解析 JWT，不读 DB/Redis）、无会话撤销机制，ADR 0011 已接受该取舍；路线 ① 会重开被否决的"每请求查业务状态"并引入真实 Redis 往返。
- 审查采纳：1（Strong）收敛为 `CustomerAvailabilityPolicy` module；3（Worth exploring）守卫边界预置 `AvailabilityGate` 适配 seam；2 否决（无主数据清理属 Non-Goal）。

### P2-4 · `validate-inquiry-shipping-address-ownership`
- 问题：客户路径归属校验在事务外（TOCTOU）；admin `create` 靠 `...rest` 透传 `shippingAddressId`，完全不校验存在与归属（不存在 → FK 报错 **500**）。
- 方案（建立在 P0-2 之上，不重复其客户路径改造）：管理端路径改传 `dto.customerId` 走接缝归属断言；DTO 跨字段约束。
- 语义决定：`customerId` 空 + `shippingAddressId` 非空 → **拒绝（400）**（归属无从成立，若放行会把他人地址挂到空客户单上）；与"匿名询价两者皆空"不冲突。
- 审查采纳：A（Strong）归属不变量收口为单一 interface；B（Worth exploring）`resolveOwnerCustomerId` adapter；C 暂缓（删除测试不通过）。

### P2-5 · `take-history-write-off-request-path`
- 问题：公开详情端点（匿名可访问）同步 `await` 浏览历史写入事务（3+ 次 DB 往返），登录客户 P95 被写路径拖累。
- 选定路线：**fire-and-forget**（不采纳阈值淘汰）。失败可见性：强制 `void p.catch(...)`（防 `--unhandled-rejections=throw` 下进程退出）+ 稳定 message key `record_view_failed` + `{filterId, customerId, requestId}` + 始终输出 `err.stack`；不新增大局 metrics 模块。
- 审查采纳：C1（Strong）抽 `HistorySideEffect` 深 module 独占 detached 写与失败可见性；C2 经 logging seam 透传 `requestId`；C3 否决（阈值淘汰）。
- 事实修正：`recordView` 失败**当前确实不影响响应**（既有 try/catch 仅 warn），本次只解除延迟耦合；`(customerId, visitedAt)` 索引**已存在**（`findMany(skip:100)` 是索引 seek，报告"每次全量有序扫描"被削弱）；100 条上限来源是 `HISTORY_LIMIT=100` + spec + ADR 0013 三方一致。**本变更反转了归档变更 `2026-09-10-close-mall-customer-activity-loop` 的 D3**（当时为"确定性、可测"选 `await`），并补齐了 D3 缺失的失败可见性论证。

### P2-6 · `bound-hot-brand-candidate-set`
- 问题：`findHot` 全量 enabled 品牌入内存排序后 `slice`，候选集不受 `limit` 约束。
- 选定路线：**下推 SQL + 保留纯函数**（激进路线），候选集上限 **N=200**。
- 事实修正：`rankHotBrands` 不变量为「标记段优先 → `hotOrder` 升序（NULLS LAST）→ `deviceCount` 降序 → `createdAt` 兜底」，**可用 `ORDER BY` 数组精确表达，下推不改变 tie-break**；`deviceCount` 是跨表聚合（`equipment` 的 `groupBy`）**非列**，故需 raw SQL 相关子查询才能保序下推；filters 域**无**同型接口（其 B2C 加权排序已下推）。
- 审查采纳：A1（Strong）`HotBrandCandidateSource` 接口；A2 候选集上限常量与 `rankHotBrands` 同 module；A3 否决（通用 ranked-candidate 机制 YAGNI）。

### P3-2 · `unify-soft-delete-mechanics`
- 问题：`Inquiry.remove` 走 `SoftDeleteService` 而 `removeMany` 裸 `updateMany`；`CustomerAddress` 全硬删但保留 `deletedAt` 列 + 读路径死条件。
- 选定路线：**删列 + 明确硬删**。理由：与 P0-2 的 `onDelete: SetNull` 自洽（硬删触发 SetNull、快照兜住信息）；规格与 admin 注释本就规定硬删；真软删会与 SetNull **互斥**（软删不触发物理删除 → SetNull 永不触发 → 悬挂引用无法清理）。
- 审查采纳：①（Strong）共享地址可见性 seam `ADDRESS_ACTIVE_WHERE`（对标既有 `ACTIVE_FILTER_WHERE`）；②（Worth exploring）`CustomerAddressDeletion` module + 两信任维度 adapter；③（Speculative）显式 `DeleteStrategy.Hard` 标记（最小化）。
- 事实修正：地址删除在**两个应用都是硬删**，且 **admin 确有 `remove`/`removeMany` 入口**；`CustomerAddress.deletedAt` **从未被任何代码写入**（全局零命中）→ 删列数据风险为零；`Inquiry` 的 `remove`/`removeMany` **两者都是软删**，分歧只在机制；`InquiryLine.deletedAt` 是活条件，**不在本变更范围**。

### P3-3 · `align-favorite-idempotent-status`
- 问题：幂等命中仍返回 201，规格要求 200。
- 选定路线：**改规格接受 201**（而非改实现）。依据：实现遵循强约定（POST 默认 201、拦截器从不设状态码、全仓无控制器手动设码）；`grep` 全仓**无任何**前端/测试/文档依赖收藏的 200 或 201；改实现需改签名 + 刺穿 `ResponseInterceptor` seam，仅换 REST 纯度。
- 审查采纳：1 改规格收口为 201；2 改实现返回 200 **否决**；3 扩展响应 seam 统一 `httpStatus` 搁置（cross-cutting）。
- 事实修正：`openspec/specs/b2c/spec.md` **不存在**（仅 `b2c/browse/spec.md`），收藏端点只在 `customer/spec.md`；`ResponseUtil` **无 `ok` 方法**（等价者为 `found`/`success`）；同型不一致**不存在**（仅 favorites 是幂等 POST）。

### P3-4 · `reconcile-wechat-unionid-contract`
- 问题：`code2Session` 只消费 `openid`，`unionid` 永不写入；规格声称写入 `unionid`、`username` 为 `wx_{openid前8位}`。
- 结论：**本期仅纠正文档，不实现归并**。依据：**`code2Session` 在本项目不返回 unionid**（个人主体小程序未绑开放平台，ADR 0012 已记录）→ 归并无数据来源；ADR 0012 **已含**"unionid 待接入"澄清。
- 事实修正：`username` 真实实现是 `wx_{openid后12位}`（`wechat-identity.ts:25-31`），规格写错已一并纠正；admin 确有 unionid 手工入口，Mall 永不写；**`packages/domain` 下无 Customer 模块**（仅 equipment/inquiry），"domain 唯一性校验"不实——实际是 Mall 的 P2002 兜底 + admin 的 `assertUniqueActive`。
- 审查采纳：1（Worth exploring）拓宽 `WechatSessionResult` 值类型（记录不实现）；2（Strong）`WechatCustomerReconciler` 作为归并 intended 落点（记录不实现）；3 否决（统一唯一性 adapter，受产品事实阻断）。

### P3-5 · `clarify-customer-registration-scope`
- 问题：规格有「客户注册」场景，但 Mall 无任何注册端点（只有 login/wechat-login/refresh/logout），账号来源只能后台创建或微信静默建号。
- 选定路线：**纠正文档，不实现自助注册**。理由：交付渠道是个人主体微信小程序（ADR 0012），微信路径已实现；现存的账密登录是**邀请制账号**的登录方式（由 admin 侧确有创建能力支撑）；新增公开注册端点会引入密码策略/验证/限流/枚举防护等一整套未评审能力，属新需求。
- 纠正手法：**REMOVED + ADDED**（「客户模型与管理员分离」→「客户模型、账号来源与管理员分离」），ADDED 正文刻意不重复 unionid/username 细则（避免与 P3-4 冲突）。
- 审查采纳：A（Strong，**采纳为代码产出**）客户认证公开路由清单 + 表驱动契约测试，使"不提供注册端点"在 CI 中可被拦住；B（两个建号 adapter 值得一个 `createCustomer(origin, payload)` 深 module）记为后续；C 把能力边界写成 ADR 注记（动作项）。

### P3-6 · `derive-inquiry-price-aggregates`
- 问题：`totalAmount` 无服务端写入方（只由 admin 手工传）、`subtotal` 由人工填写不按 `quantity × unitPrice` 推导，四者（quantity/unitPrice/subtotal/totalAmount）可任意矛盾；客户已能看到这些字段（P0-1 归档后）。
- 方案：`subtotal` 派生（空单价 → `null` 而非 `0`）；`totalAmount = Σ 未软删明细 subtotal`，在明细写操作与报价动作后**同一事务内**重算；聚合在 **Decimal/SQL 层**完成（不得用 JS `number` 逐行相加）；**BREAKING**：DTO 移除 `totalAmount`/`subtotal`（`forbidNonWhitelisted` 下旧客户端 → 400）；迁移回填存量（附核查 SQL，超预期则暂停）。
- 审查采纳：A（Strong）触发点收成 `writeLine` 接缝（4 出口 → 1 次调用，漏算结构上不可能）；B（Worth exploring）branded `Money` 类型把精度约束升级为编译期约束；C（Worth exploring）「报价」编排 module（跨三个变更）记为后续。
- 记录的开放问题：`quoted` 后是否锁价；是否需要整单折扣/抹零（应新增显式字段，而非恢复可自由填写的 `totalAmount`）。

## 跨问题约定（复用）

- 规划件模板：proposal(Why / What Changes / Capabilities / Impact) · specs(## REMOVED/MODIFIED/ADDED Requirements) · design(Context / Goals-NonGoals / Decisions / Risks) · tasks(分组 + 每条带「验证：」)。
- **`MODIFIED` 必须承载原 Requirement 全部 Scenario**，否则 `validate --strict` 报 "MODIFIED omits scenario(s)"；**纠正文档里的错误/虚挂主张优先用 `REMOVED + ADDED`**（可留下"此规格曾出错"的记录，且不受场景承载规则约束）。
- 架构审查报告落系统临时目录，不落仓库；术语只用 codebase-design 词汇（module / interface / implementation / depth / seam / adapter / leverage / locality）。
- 每组收尾跑 `openspec validate <name> --strict`。
