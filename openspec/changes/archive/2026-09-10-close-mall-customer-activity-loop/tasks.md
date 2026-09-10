## 1. 收藏写入前校验（domain 单一谓词）

- [x] 1.1 在 `@gvray/domain` filters 模块新增共享谓词 `assertFilterBrowseable(prisma, filterId)`（filter 存在 + `status='enabled'` + `deletedAt IS NULL`），并让 `FiltersService` 的可见性判定（存在性/未删/enabled）与其对齐复用；确认 `findOne(id)` 对外仍抛 404，谓词共用不改变 browse 语义。验证：`pnpm test` 相关 domain spec 通过

- [x] 1.2 `CustomerActivityService.createFavorite` 在 create 前于同一事务调用 `assertFilterBrowseable`，失败抛 400 `FILTER_NOT_AVAILABLE`；`CustomerActivityModule` import `FiltersModule`（@gvray/domain）以注入该谓词/服务

- [x] 1.3 在 `customer-activity.service.spec.ts` 补负用例：收藏不存在滤清器 → 400；`status='disabled'` → 400；已软删 → 400；并对 `assertFilterBrowseable` 本身补单测。验证：`pnpm test` 通过

## 2. 浏览历史接线（深模块 FilterDetailFlow）

- [x] 2.1 mall/core 新增 `OptionalCustomerGuard extends AuthGuard('customer-jwt')`：`canActivate` 内 `await super.canActivate()`，鉴权失败（匿名/坏 token/非 customer realm）吞掉并按匿名处理，成功才设 `request.customer = request.user`；注册于 `customer-auth.module`（与 `CustomerJwtGuard` 并列）。补单测：有效客户 token → 注入；无/坏 token → 匿名不注入。验证：对应 spec 通过

- [x] 2.2 mall 本地新增 `FilterDetailFlow`（注入 `FiltersService` + `CustomerActivityService`），`viewFilterDetail(customerId?, filterId)`：调 `FiltersService.findOne(id, MALL_OPTS)`；`customerId` 非空则 `await recordView`（try/catch 仅 `logger.warn`，不失败详情返回）

- [x] 2.3 `MallFiltersController.findOne` 薄透传：`@UseGuards(OptionalCustomerGuard)` + `@CurrentCustomer()`，调 `filterDetailFlow.viewFilterDetail(customerId, id)`；`findAll` 保持原样

- [x] 2.4 装配：`BrowseModule` import `CustomerActivityModule` 并注册 `FilterDetailFlow`；改写 BrowseModule 模块注释为「公开浏览编排（含可选客户活动副作用）」；确认无循环依赖，否则按 D6 回退 `mall.module.ts` 注入。验证：`pnpm build` 通过、`pnpm start:mall:dev` 启动无模块注册报错

- [x] 2.5 浏览历史快照语义核验：`findHistory` 的 filter 快照在滤清器失效时仍返回（现有 include+select 保证），不改查询结构

## 3. 跨端点行为守卫

- [x] 3.1 匿名访客访问 `GET /filters/:id` 不写历史（OptionalCustomerGuard 无 Bearer/验签失败→匿名），浏览返回体与改造前一致

- [x] 3.2 失效滤清器详情（404，service 抛）不写历史（触发在 `findOne` 成功返回之后）

- [x] 3.3 集成验证：携带客户 token 访问详情触发一次 `recordView`、重复访问更新 `visitedAt`

## 4. 文档与收尾

- [x] 4.1 同步 `openspec/specs/customer/spec.md` 与 `openspec/specs/b2c/browse/spec.md` 至 delta 一致（archive 流程统一处理）

- [x] 4.2 全量 `pnpm test` + `pnpm build` 通过；`openspec validate close-mall-customer-activity-loop --type change` 无报错

## 5. 收藏收口细化（审查定案 · 本会话新增）

- [x] 5.1 `createFavorite` 抗并发幂等：把「存在则返回、不存在则校验并插入」折叠进单个 `$transaction`，`create` 捕获 `P2002`（`@@unique([customerId, filterId])`）后回查既存并返回。验证：`pnpm test` 相关 spec 通过

- [x] 5.2 `findFavorites` 投影滤清器快照 + 派生 `filterAvailable`：`include filter`（对齐历史 `model/gencode/typeName` 起），`filterAvailable` 复用 `assertFilterBrowseable` 同源；`favorite-response.dto.ts` 补对应字段（`filter` 子对象与 `filterAvailable`）。失效滤清器仍返回其最后快照、不丢记录，不加查询侧过滤。验证：`pnpm test` 通过

- [x] 5.3 取消收藏单入口：移除 `favorites.controller.ts` 的 `DELETE /favorites?filterId=`，删除 `CustomerActivityService.removeFavorite`；保留 `DELETE /favorites/:id`（按 `favoriteId`，仅当前客户，不存在抛 404）

- [x] 5.4 修正 `history.controller.ts`「删除浏览历史（软删除）」注释为硬删，与 `removeHistory`（`customerHistory.delete`）及 glossary event-type 语义一致

- [x] 5.5 单测补：并发 `P2002` 回查幂等、收藏列表投影与 `filterAvailable`、取消收藏单入口（`removeFavorite` 移除后无调用残留）。验证：`pnpm test` 通过；`grep removeFavorite` 确认无残留引用

- [x] 5.6 全量 `pnpm test` + `pnpm build` 通过；`openspec validate close-mall-customer-activity-loop --type change` 无报错

