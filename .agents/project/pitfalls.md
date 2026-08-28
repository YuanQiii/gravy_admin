# 踩坑记录

> 工程反模式与教训清单，随实践演进。与 [coding.md](coding.md) 互补：coding 讲"该如何写"，此处讲"曾因此踩坑，别再犯"。

## 死代码删除

- 删除前必须 `grep -rn "\.methodName(" src/` 确认调用方归零，而非凭"名字很像"判断。`touchSession`/`heartbeat`/`paginateWithResponse` 曾看似在用，实为零调用。
- 删除后再次 grep 归零；保留同族现役 API（如 `touchSessionByJti`、`paginateWithSort`）避免误删。

## 硬编码重复

- 同一语义的键/常量多处字面量会分叉。`'auth:sessions:'` 曾各写一处。提取单一常量后，以「业务代码中裸字面量仅存常量定义一处」为验收。

## 筛选逻辑双重维护

- Prisma `where` 与 raw SQL `conditions` 各自维护同一筛选（尤其 keyword），改一处漏一处。收敛为单一来源纯函数（`buildWeightedConditions`），列表与 count 共享，单测断言参数化与注入安全。

## 投影漂移

- 增改返回结构时若在多处手写投影，会漏字段。曾致 `assignRoles`/`removeRoles` 响应缺 `description`。收敛为统一 select 常量（`USER_RESPONSE_SELECT`）+ 单一 `findUserForResponse` helper；列表专用瘦 select（`USER_LIST_SELECT`）控制负载。

## 收敛共享判断

- 重构守卫/校验时，把"数据投影"与"逻辑守卫"两类重复同批收敛（`assertRoleMutationAllowed` 四分支：404 → 改自己 → 超管层级 → roleIds 校验），收益叠加。

## 纯重构的验证

- 无 spec 级行为变更（`skip_specs`）时，验收全靠：既有单测全绿 + 重灾区接口 e2e 逐字通过 + 交叉 grep 归零。触碰重灾区接口（如 equipment 匿名域 27 例 e2e）时，单测可能覆盖不全，必须把 e2e 逐字通过设为 task 完成门槛。

## 归档前

- 先 `prettier` 确认格式，避免格式噪音混入重构 commit。

## 待后续（已声明为边界，勿在本范围顺手做）

- filters/catalogs 存在与 equipment 同款的 B2C 筛选双重维护，应作独立变更收敛。
- `remove()` 未失效权限缓存为有意非目标（JWT 生命周期问题），CONTEXT.md 已留 TODO 线索。