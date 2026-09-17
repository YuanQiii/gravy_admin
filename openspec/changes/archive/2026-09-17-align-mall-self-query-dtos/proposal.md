## Why

Mall 自助域三处列表查询 DTO 声明了不被消费的字段，Swagger 契约失真：客户端按文档传入 `customerId`/`receiver`/`phone` 会静默失效（无报错、结果不符），是长期低成本的困扰来源；而身份本应由 `@CurrentCustomer()` 统一提供。已逐字段核实（见 Impact 证据），`findMyAddresses` 的 where 仅 `{ deletedAt: null, customerId }`（customerId 来自方法参数而非 DTO），`findFavorites`/`findHistory` 的 where 虽读 `query.customerId` 但被 Controller 无条件覆写为当前客户，地址 DTO 的 `receiver`/`phone` 在服务端从未进入 where。

## What Changes

- 拆分 Mall 侧三个自助查询 DTO，移除全部未被消费的 `customerId`：`QueryAddressSelfDto` / `QueryFavoriteSelfDto` / `QueryHistorySelfDto` 均不声明身份字段。
- **BREAKING**：`QueryAddressSelfDto` 删除未被消费且从未实现的 `receiver` / `phone` 筛选字段；自助地址列表不再接受任何内容筛选。
- `QueryFavoriteSelfDto` / `QueryHistorySelfDto` 保留功能性 `filterId`，删除被 Controller 无条件覆写的 `customerId`；相应移除 `favorites.controller.ts:68` 与 `history.controller.ts:44` 的 `query.customerId = customer.customerId` 覆写行。
- 因全局 `ValidationPipe` 开启 `forbidNonWhitelisted`，删除字段后旧客户端继续发送这些查询参数将由「静默忽略」变为 **400 拒绝**（fail-fast，契约诚实化）。
- 补充集成测试断言「查询参数确实影响结果」（`filterId` 改变结果集；未知字段被拒）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `customer`：修改「客户自助管理收货地址」「收藏管理」「浏览历史管理」三处 Requirement，明确自助列表查询 DTO 不含 `customerId` / `receiver` / `phone`，仅 `filterId` 可筛选，未知字段 400。

## Impact

- 代码：
  - `apps/mall/src/modules/mall/addresses/dto/query-address.dto.ts`：删除 `customerId`/`receiver`/`phone`，重命名为 `QueryAddressSelfDto`（仅继承 `PaginationSortDto`）。
  - `apps/mall/src/modules/mall/addresses/mall-addresses.controller.ts:39-48`：保持不变（已通过 `@CurrentCustomer()` 传参，未覆写 query）。
  - `apps/mall/src/modules/mall/addresses/customer-addresses.service.ts:72-87`：`findMyAddresses` 不变，where 仍 `{ deletedAt: null, customerId }`。
  - `apps/mall/src/modules/customer-activity/dto/query-favorite.dto.ts`：删除 `customerId`、保留 `filterId`，重命名为 `QueryFavoriteSelfDto`。
  - `apps/mall/src/modules/customer-activity/favorites.controller.ts:63-70`：删除 `query.customerId = customer.customerId` 覆写（字段已不存在）。
  - `apps/mall/src/modules/customer-activity/dto/query-history.dto.ts`：删除 `customerId`、保留 `filterId`，重命名为 `QueryHistorySelfDto`。
  - `apps/mall/src/modules/customer-activity/history.controller.ts:39-47`：删除 `query.customerId = customer.customerId` 覆写。
- 接口：**BREAKING** —— `GET /addresses`、`GET /favorites`、`GET /history` 不再接受 `customerId`/`receiver`/`phone` 查询参数；携带即 400。
- 复用确认（推翻报告担忧）：admin 侧 `apps/admin/src/modules/addresses/dto/query-address.dto.ts` 为**独立本地文件**，其 `AddressesService.findAll`（`apps/admin/src/modules/addresses/addresses.service.ts:54-61`）仍消费 `customerId`/`receiver`/`phone`，本变更**不影响 admin**；Mall 与 Admin 的 `QueryAddressDto` 早已分文件存在，拆分 mall DTO 不波及 admin。
- 依赖：无新增；`@gvray/core` 的 `configureApp` 中 `forbidNonWhitelisted: true`（`packages/core/src/bootstrap/configure-app.ts:54-56`）是本变更契约行为（未知字段 400）的前提。
