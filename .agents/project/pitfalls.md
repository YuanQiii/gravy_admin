# 踩坑记录

> 工程反模式与教训清单，随实践演进。与 [coding.md](coding.md) 互补：coding 讲"该如何写"，此处讲"曾因此踩坑，别再犯"。

## 死代码删除

- 删除前必须 `grep -rn "\.methodName(" apps/ packages/` 确认调用方归零，而非凭"名字很像"判断。`touchSession`/`heartbeat`/`paginateWithResponse` 曾看似在用，实为零调用。
- 删除后再次 grep 归零；保留同族现役 API（如 `touchSessionByJti`、`paginateWithSort`）避免误删。
- "建模了却永不生效"的抽象要分清"管理面"与"执行面"：`DataScopeService` 的分配/查询方法真实在用，但其强制执行方法（`getUserDataScope`/`buildDataScopeQuery` 等）grep 核实为零调用、且业务表无 `departmentId` 可过滤——属自包含死代码，直接删除而非标注保留，并在 CONTEXT.md 声明"记录型元数据、未接入查询"为显式边界，防再次误判为已生效。

## 硬编码重复

- 同一语义的键/常量多处字面量会分叉。`'auth:sessions:'` 曾各写一处。提取单一常量后，以「业务代码中裸字面量仅存常量定义一处」为验收。

## 筛选逻辑双重维护

- Prisma `where` 与 raw SQL `conditions` 各自维护同一筛选（尤其 keyword），改一处漏一处。收敛为单一来源纯函数（`buildWeightedConditions`），列表与 count 共享，单测断言参数化与注入安全。

## 投影漂移

- 增改返回结构时若在多处手写投影，会漏字段。曾致 `assignRoles`/`removeRoles` 响应缺 `description`。收敛为统一 select 常量（`USER_RESPONSE_SELECT`）+ 单一 `findUserForResponse` helper；列表专用瘦 select（`USER_LIST_SELECT`）控制负载。

## 收敛共享判断

- 重构守卫/校验时，把"数据投影"与"逻辑守卫"两类重复同批收敛（`assertRoleMutationAllowed` 四分支：404 → 改自己 → 超管层级 → roleIds 校验），收益叠加。
- 特权判定（super-admin）散落多处内联 `roleKey === SUPER_ROLE_KEY` 时，先 grep 核实调用点清单（5 处），再收敛为纯函数 `isSuperAdminOf(roleKeys)`，杜绝语义漂移。其输入约定为"角色码数组"，由 `extractRoleKeys(userRoles)` 从嵌套结构生成，或取自 JWT 的 `request.user.roles`；语义 fail-closed（空/缺省返回 false），超管角色未配置时无法被误放行。
- 守卫内"运行时旁路"（super-admin 直放）信号必须取自已验签的 JWT 角色码而非 DB/缓存，才能做到**零额外查询 + 不要求权限码完整**；且旁路判定必须放在任何缓存/DB 访问之前，否则缺失权限码会被缓存空值/DB 结果短路。测试需补"super-admin 缺失权限码仍放行"且断言 cache/DB 零访问。

## 缓存失效窗口

- 权限/资源缓存失效若只手动散落在各变更方法内，新增变更路径极易漏：`permissions-scanner` 软删除权限后不失效缓存，已登录用户会在 TTL(1h) 内继续持有已下线权限码 → 已下线接口仍可访问。
- 收口做法：在缓存服务提供统一的"按权限反查受影响用户"入口（权限 → 角色 → 用户，`invalidateUsersByPermissionIds`），并在**所有**权限集变更点（含扫描器）调用；角色/用户级已有精确失效（`invalidateRole`/`invalidateUser`）则保留。
- 反查入口要 fail-closed：空输入、Redis 不可用、无关联角色/用户时均 no-op 返回 0，不抛异常；返回受影响数量供日志观测。
- 明确失效边界：缓存只存权限码，`permissions.service.update` 仅改 `name`/`description` 不改 `code`，故不产生守卫失效窗口——需显式代码注释声明，防止后续被误判为"新的失效遗漏"而盲目补失效。

## "重复"声称须先 grep 核实

- 当外部断言"某逻辑散落 N 处调用点"时，先 `grep` 归零核实调用方与语义，再谈是否收敛，勿凭名字/相似度直接动手。案例：据称"权限码解析散落 3 处"，grep 后仅 `permissions-scanner.service.ts:254` 一处是真 `module:resource:action` 解析，另 3 处 `.split(':')` 属 `token.service.ts` 的 session/jti 键解析，语义不同。
- 收敛共享抽象前用"一个消费者 vs 两个消费者"测试：仅 1 处真实消费时（如权限码解析）倾向 YAGNI 就地保留；≥2 处同语义才下沉共享纯函数/常量。
- 提取共享解析时锁定自洽约束：若契约定义码固定 3 段 `{module}:{resource}:{action}`，解析应显式取段，而非 `parts[len-1]/[len-2]` 端索引（后者对 4+ 段码会把 action 误当 resource）。
- 归档同一改革的验收门槛同理：先 `prettier` 保证无格式噪音。

## 纯重构的验证

- 无 spec 级行为变更（`skip_specs`）时，验收全靠：既有单测全绿 + 重灾区接口 e2e 逐字通过 + 交叉 grep 归零。触碰重灾区接口（如 equipment 匿名域 27 例 e2e）时，单测可能覆盖不全，必须把 e2e 逐字通过设为 task 完成门槛。

## 归档前

- 先 `prettier` 确认格式，避免格式噪音混入重构 commit。

## 待后续（已声明为边界，勿在本范围顺手做）

- filters/catalogs 存在与 equipment 同款的 B2C 筛选双重维护，应作独立变更收敛。
- `remove()` 未失效权限缓存为有意非目标（JWT 生命周期问题），CONTEXT.md 已留 TODO 线索。