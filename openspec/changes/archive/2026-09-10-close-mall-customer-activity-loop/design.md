## Context

See proposal.md（Why：recordView 零调用点 = 浏览历史永不产生；createFavorite 无校验 = 可收藏失效/不存在滤清器）。注：schema 未设 `relationMode`，故 `CustomerFavorite`/`CustomerHistory` 对 `Filter` 走**原生外键 + `onDelete: Cascade`**，硬删滤清器不会产生孤儿；`createFavorite` 校验的真实价值是「当前可用性门禁」，而非孤儿预防。

现状约束（源码为准）：

- `MallFiltersController.findOne('GET /filters/:id')` 是 `@Public()` + `@Throttle` 的匿名公开端点，挂 `FiltersService.findOne(id, MALL_OPTS)`（domain 包）。`findOne` 的可见性判定在 service 内完成：`findUnique` → `deletedAt` 检查 → `assertVisible(filter, MALL_OPTS)`（enabled-only）；失效/未启用时 service 抛 404，控制器不接触过滤逻辑。

- 浏览路由现状**无任何 guard**，控制器拿不到客户身份；客户身份只在带 `CustomerJwtGuard` 的自助端点上经 `@CurrentCustomer()` 提供。

- `CustomerJwtStrategy.validate` 已单一拥有 realm 互斥判据（`!sub || !isCustomerRealm(payload.realm)`）；`CustomerJwtGuard` = `AuthGuard('customer-jwt')` 且把 `request.user` 复制到 `request.customer`，`@CurrentCustomer()` 读 `request.customer`。

- `CustomerActivityService.createFavorite`/`recordView` 均在 mall 应用，`CustomerActivityModule` 仅依赖 `PrismaModule`。

- **BrowseModule 无任何 providers**，其模块注释明文「仅暴露公开路由，不承载任何后台逻辑」。

## Goals / Non-Goals

**Goals:**

- 让浏览历史真正产生数据：已登录客户访问滤清器详情即写历史。

- 让收藏只落到有效滤清器：写前校验存在 + enabled + 未软删，且与浏览可见性共用单一判定源（当前可用性门禁；孤儿已由原生外键 + Cascade 兜底）。

- 让收藏列表可渲染且可识别失效：`GET /favorites` 投影滤清器快照并派生 `filterAvailable`，供前端置灰已失效收藏；收藏/取消收藏保持并发安全的幂等语义与单入口。

- 保持 `GET /filters/:id` 对匿名访客完全开放、返回体零回归。

- 消除「控制器既验签身份又编排历史副作用」的 auth 感知 orchestrator（架构审查候选一/二），把身份解析与副作用分别收敛进项目既有接缝与深模块内。

**Non-Goals:**

- 不强制登录、不启用强制鉴权 guard；可选身份经 OptionalCustomerGuard 注入，匿名行为不改（多一次可选 guard 运行，无 Bearer 即匿名）。

- 不改变浏览过滤/排序/响应字段；登录客户与匿名在"浏览返回体"上仍一致（仅多历史写副作用）。

- 不做收藏/历史列表对失效滤清器的新增过滤或排除：列表查询不下滑、不丢记录，失效滤清器仍返回其最后快照。但**收藏列表此前缺滤清器投影**（`GET /favorites` 仅裸收藏行，`GET /history` 有快照，两侧不一致），本 change 补齐收藏列表投影 + 派生 `filterAvailable` 标记（见 D7）。历史列表保持现状、不加该标记。

- 不含询价 CANCELLED / 客户会话心跳接线（属 wayfinder 其余 ticket，非本变更）。

## Decisions

**D1 · 历史写入触发点**：以滤清器详情端点 `GET /filters/:id` 为"浏览"唯一触点，在成功加载并可见（service 已保证 enabled+未删，失效已 404）后写历史。失败即 404 的语义由 service 保证，天然满足"失效不写历史"。备选：单独开浏览上报端点——被否，制造重复路径且无必要。

**D2（深化）· 可选客户身份接缝 =** **`OptionalCustomerGuard`**：新增 mall/core guard `OptionalCustomerGuard extends AuthGuard('customer-jwt')`——`canActivate` 内 `await super.canActivate()`，鉴权失败（含匿名无 Bearer、坏 token、非 customer realm）一律捕获并按**匿名**处理，成功才设置 `request.customer = request.user`；控制器配合 `@CurrentCustomer()` 取得可能为 `undefined` 的 customer。**复用** **`CustomerJwtStrategy`**，realm 互斥判据仍单源。取代规划原版的「控制器手写 `jwtService.verifyAsync` + realm 判断」——消除第三条鉴权路径。与既有 `CustomerJwtGuard` 是同策略的第二个 adapter（一 adapter=假设接缝、二=真实接缝）。

**D3（深化）· 历史写循序：深模块内** **`await`** **+ 局部兜底**：由 `FilterDetailFlow` 编排（见 D6），在 `viewFilterDetail` 内 `await` 一次 `CustomerActivityService.recordView(...)`，并仅对 recordView 包 try/catch：写生失败仅 `logger.warn`，**不打挂**详情返回。比规划原版 fire-and-forget 更确定、可测（调用完成才返回），又不让历史写失败连累公开浏览。

**D4（深化）· 收藏校验用 domain 单一谓词** **`assertFilterBrowseable`**：在 `@gvray/domain` filters 模块新增共享谓词 `assertFilterBrowseable(prisma, filterId)`（filter 存在 + `status='enabled'` + `deletedAt IS NULL`），`FiltersService` 的可见性判定与 `createFavorite` 共同消费；`createFavorite` 于 create 前在同一 `$transaction` 调谓词，失败抛 400 `FILTER_NOT_AVAILABLE`（spec 错误码与文案不变——比 browse 404 更贴合"当前不可收藏"语义）。原因：收藏可接受性与浏览可见性是同一事实（顾客只能收藏看得到、在售的滤清器），单一真值防漂移。

**D5（深化）· 控制器薄透传**：`MallFiltersController.findOne` 退化为 route + `@UseGuards(OptionalCustomerGuard)` + `@CurrentCustomer()` + 调 `filterDetailFlow.viewFilterDetail(customerId?, id)`，不再注入 JwtService / CustomerActivityService，不内联任何身份/副作用逻辑。

**D6（深化）· 深模块与装配**：mall 本地 `FilterDetailFlow`（单方法深模块）注入领域 `FiltersService` + mall `CustomerActivityService`，公开 `viewFilterDetail(customerId?, filterId)`。因 `recordView` 在 mall、`findOne` 在 domain，编排只能落 mall 应用内，进不了 domain 包。装配：`OptionalCustomerGuard` 注册于 `customer-auth.module`（与 `CustomerJwtGuard` 并列）；`FilterDetailFlow` 注册于 `BrowseModule`，故 `BrowseModule` import `CustomerActivityModule`。**改写 BrowseModule 模块注释**：由「仅公开路由、不承载任何后台逻辑」改为「公开浏览编排（含可选客户活动副作用）」，如实反映集成客户自助域。若装配发现循环依赖，回退为在 `mall.module.ts` 注入 `FilterDetailFlow` 并传入控制器。

**D7（审定）· 收藏收口的三个细化**：
- **并发安全幂等**：`createFavorite` 把「存在则返回、不存在则校验并插入」折叠进单个 `$transaction`；`create` 捕获 `P2002`（`@@unique([customerId, filterId])` 冲突）后回查既存并返回，使「重复收藏返回原记录」在并发下也成立（原实现 findUnique 后独立事务写入，双请求可双双通过判重→一请求撞 P2002→500）。
- **列表投影 + 可用性标记**：`findFavorites` `include filter` 投影滤清器当前字段（对齐历史快照 `model/gencode/typeName` 起），并派生 `filterAvailable: boolean`（复用 `assertFilterBrowseable` 同源），供前端置灰失效收藏；失效记录仍返回其最后快照，不丢。历史列表不加该标记。排序沿用现状（`paginateWithSort` 默认 `createdAt DESC`）。
- **取消收藏单入口**：移除 `DELETE /favorites?filterId=` 及其 `removeFavorite(customerId, filterId)`（deleteMany），唯一保留 `DELETE /favorites/:id`（按 `favoriteId`，仅当前客户，本人不存在抛 404）；前端 toggle-off 使用列表响应中的 `favoriteId`。顺带修正 `history.controller.ts` 中「软删除」注释与实际硬删的矛盾。

## Risks / Trade-offs

\[OptionalCustomerGuard 在公开端点跑 passport] → 仅当请求带 Bearer 才走策略验签；无 Bearer passport 直接放 fail、被吞→匿名，匿名零开销；非 customer realm 被策略本身拒绝→匿名。
\[历史写增加登录详情一次 upsert 延迟] → 低（单行 upsert），且写失败被局部吞掉仅 log；避免 fire-and-forget 的不确定性与不可测。
\[domain 新增谓词] → browse 与收藏共用单一真值；需为谓词补单测，且 `findOne` 对外 404 语义不因谓词共用而变化（谓词抛错只在收藏侧映射为 400）。
\[BrowseModule 依赖 CustomerActivityModule] → 与 `mall.inquiries` 等客户自助子模块同级、同依赖域，接受；已用注释改写如实表达。
[P2002 捕获回查] → 幂等在并发下成立，但需回查保持与读路径一致的投影；仅对收藏 create 捕获，不泛化。
[收藏列表新增投影 join] → 收藏墙可渲染 + `filterAvailable` 置灰；列表多一次 filter join 单行读取，代价低，且与历史列表现有 include 一致。

## Migration Plan

- 纯增量行为，**无数据迁移**、无 schema 变更。

- 发布：随 mall 应用下次发布。回滚：撤销 `OptionalCustomerGuard`/`FilterDetailFlow` 接线与收藏校验，即恢复旧行为，无数据残留（历史为新产生记录，回滚不删）。

- 文档同步：本 change 的 `specs/customer`、`specs/b2c/browse` delta 经 OpenSpec archive 并入 main spec。

## Open Questions

- `FILTER_NOT_AVAILABLE` 文案与所在常量文件（`@gvray/domain` filters 谓词模块）——实现/测试时评审即可定，不改变行为口径。

- `OptionalCustomerGuard` 是否后续复用于其他"公开但可带登录"端点（如列表页登录态高亮）——本轮仅用于详情触点，留作 future。

