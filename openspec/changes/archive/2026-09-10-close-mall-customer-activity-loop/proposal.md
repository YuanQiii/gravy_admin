## Why

Mall 自助域的客户行为 loop 未闭环：`recordView(customerId, filterId)` 在 `CustomerActivityService` 中存在但全仓零调用点，导致浏览历史功能声明却永远不产生数据；`createFavorite` 不对滤清器的存在性/启用态/软删除做任何校验。虽然 `CustomerFavorite`/`CustomerHistory` 对 `Filter` 走原生外键 + `onDelete: Cascade`（schema 未设 `relationMode`，默认原生外键），硬删滤清器不会产生孤儿行，但校验的真实价值是**当前可用性门禁**：顾客不应收藏一个已下架/已停用/已软删的滤清器，且收藏列表此前不含滤清器投影、无法渲染。审查结论：历史 loop 断裂不产生数据、收藏可落在失效滤清器且列表缺投影，需在本 change 内闭合。

## What Changes

- **接线浏览历史写入**：在 Mall 的滤清器详情端点 `GET /filters/:id` 中，当请求携带有效客户 access token（经可选 `OptionalCustomerGuard` 解析出当前客户，低成本复用 `CustomerJwtStrategy`；匿名访客经同一接缝得匿名）时写入一条浏览历史（幂等 `recordView` upsert）；匿名访客不写历史，浏览行为与现状完全一致。身份解析与历史写副作用分别收敛进既有的 guard 接缝与 mall 本地深模块 `FilterDetailFlow`，控制器保持薄透传。

- **收藏写入前校验滤清器有效性**：`createFavorite` 在写入前校验目标 `filterId` 对应的滤清器存在、`status = 'enabled'` 且未软删除；不满足即拒绝（400 `FILTER_NOT_AVAILABLE`），不再产生孤儿收藏。

- **收藏列表投影滤清器快照与可用性标记**：当前 `GET /favorites` 只返回裸收藏行（`favoriteId/customerId/filterId/createdAt`，无滤清器字段），前端无法渲染收藏墙；`GET /history` 却有快照，两侧不一致。改为收藏列表投影滤清器当前字段（与历史快照对齐 `model/gencode/typeName` 起），并**派生** `filterAvailable: boolean`（沿用 `assertFilterBrowseable` 同一判定源），供前端置灰已停用/已软删的失效收藏。失效时仍返回记录与其最后快照，不下滑、不静默丢失（查询侧不新增过滤）。历史列表保持现状，不加该标记。

- **取消收藏单入口**：移除按 `filterId` 的取消收藏公开路由（`DELETE /favorites?filterId=`）及其 `removeFavorite(customerId, filterId)` 服务方法，唯一保留 `DELETE /favorites/:id`（按 `favoriteId`，本人不存在返回 404）。前端 toggle-off 直接使用列表响应中的 `favoriteId`。

- **移除过时契约表述**：`openspec/specs/customer/spec.md` 浏览历史管理项中"本 change 范围不含商城详情页的浏览触发接线"的措辞随之撤销，改由本 change 的接线场景替代。

均不涉及 **BREAKING**（新增行为，既有浏览/收藏/历史的匿名与登录读路径不变）。

## Capabilities

### Modified Capabilities

- `customer`: 浏览历史管理项由"仅提供写入原语、不含接线"改为"含滤清器详情浏览接线并生效的时间更新语义"，并新增"收藏前校验滤清器有效性与查询失效快照语义"需求场景。

- `b2c/browse`: 滤清器详情端点 `GET /filters/:id` 在已登录客户访问时记录浏览历史（登录客户行为不再与匿名完全一致——多出历史写入副作用，过滤/排序/响应字段保持完全一致）。

## Impact

- **代码**：`apps/mall/src/core/guards/optional-customer.guard.ts`（新增，复用 `customer-jwt` 策略）、`apps/mall/src/modules/mall/browse/filter-detail.flow.ts`（新增深模块：加载可见滤清器 + 登录才写历史）、`apps/mall/src/modules/mall/browse/mall-filters.controller.ts`（`findOne` 薄透传 + `@UseGuards(OptionalCustomerGuard)` + `@CurrentCustomer()`）、`apps/mall/src/modules/mall/browse/browse.module.ts` 与 `customer-auth.module.ts`（装配）、`apps/mall/src/modules/customer-activity/customer-activity.service.ts`（`createFavorite` 加校验并抗 `P2002` 并发幂等、`findFavorites` 投影滤清器快照与 `filterAvailable`、移除 `removeFavorite`、修正 `removeHistory` 注释）、`apps/mall/src/modules/customer-activity/favorites.controller.ts`（移除 `DELETE /favorites?filterId=`）、`apps/mall/src/modules/customer-activity/dto/favorite-response.dto.ts`（补滤清器投影字段 + `filterAvailable`）、`@gvray/domain` filters 模块（共享谓词 `assertFilterBrowseable`）、对应 DTO/错误码常量。

- **对齐源**：收藏校验与浏览可见性共用同一 domain 谓词 `assertFilterBrowseable`；收藏错误码独立 `FILTER_NOT_AVAILABLE`（400），与 `@gvray/domain` 询价 line 的 `EQUIPMENT_FILTER_NOT_FOUND`（404）区分但风格一致。

- **文档**：同步 `openspec/specs/customer/spec.md`、`openspec/specs/b2c/browse/spec.md`（本 change 的 delta 规格）。

- **依赖/系统**：无新增依赖；`recordView` 为纯 service upsert，不新增数据表。

