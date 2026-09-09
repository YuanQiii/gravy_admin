## Context

现状（详见 proposal.md - Why）：equipment 域 5 个 Controller 混布 `@Public()` 公开只读路由与 `@RequirePermissions` 后台路由，靠 `user ? undefined : { visibility: 'anonymous' }` 运行时分流；`VisibilityOpts` 三分流（anonymous/b2c/admin）与加权排序机制已在 `src/shared/services/base.service.ts`、`src/modules/equipment/weighted-sort.ts` 就绪。客户域已有 `CustomerJwtGuard` + `@CurrentCustomer()` 模式（收藏/足迹/认证），是 B2C 写端点的既有样板。询价 `Inquiry`/`InquiryLine` 数据模型已支持 `customerId`/`shippingAddressId`/`filterId`，但 [inquiries.controller.ts](file:///c:/Project/gvray/src/modules/inquiry/inquiries/inquiries.controller.ts) 仅暴露后台权限端点。`AddressesService` 方法均无 `customerId` 参数（后台代管语义）。

## Goals / Non-Goals

**Goals:**

- 新增 `src/modules/b2c/` 聚合模块，B2C 端点统一 `b2c/` 前缀，与后台 `equipment/*`、`inquiry/*`、`customer/*` 隔离。

- 后台 equipment 域 Controller 瘦身为纯权限接口，`equipment/*` 路径与行为零改动。

- 复用现有 Service 层与 `VisibilityOpts` 分流，不复制查询逻辑。

- 补齐 B2C 转化链：客户自助询价（创建/列表/详情报价）+ 客户自助地址。

**Non-Goals:**

- 阶段二"独立商城服务"（B2C 模块迁出本仓库）——不在本次范围，但模块组织为其预留清晰边界。

- 足迹写入接线（`recordView` 调用点）——维持 spec 既定边界，归独立商城进程。

- 询价状态流转的 B2C 侧能力——客户只读状态，流转仍由后台运营执行。

- 不新增权限码、不新增数据表（复用 `Inquiry`/`CustomerAddress`/`Filter` 等现有模型）。

## Decisions

### D1: `src/modules/b2c/` 聚合模块组织

新建 `src/modules/b2c/`，内含 `b2c.module.ts`（聚合注册）与三个子模块：

- `b2c/browse/`：公开浏览 Controller（filters/equipment/catalogs/brands/filter-types 五个只读端点组），全部 `@Public()` + `@Throttle`，调用 Service 时统一传共享常量 `B2C_OPTS = Object.freeze({ visibility: 'anonymous' })`（`b2c` 保留给未来已登录客户浏览分流）。

- `b2c/inquiries/`：客户询价端点（`CustomerJwtGuard`）。

- `b2c/addresses/`：客户自助地址端点（`CustomerJwtGuard`）。

`b2c.module.ts` 聚合导入三个子模块并 export，注册进根 `AppModule`。**理由**：路由前缀、鉴权范式、Swagger tag 三类关注点集中，与既有的 `CustomerModule`/`EquipmentModule` 聚合模式一致；阶段二整模块迁移时边界即模块根。

**`B2C_OPTS`** 定义在 `b2c/browse/` 内共享处（frozen 常量），五个 browse 控制器统一 `findAll(query, B2C_OPTS)`，避免各控制器手敲 `{ visibility: 'anonymous' }` 字面量——enabled-only 触发器单点定义，不靠调用方记忆（卡3 定案）。

### D2: 公开浏览路由迁移（filters 先行，模板复用）

- 将 [filters.controller.ts](file:///c:/Project/gvray/src/modules/equipment/filters/filters.controller.ts) 中 `GET equipment/filters`、`GET equipment/filters/:id` 迁至 `b2c/browse/` 下的 `GET /b2c/filters`、`GET /b2c/filters/:id`，保持 `@Public()` + `@Throttle(60/min)`，Service 调用统一传共享常量 `B2C_OPTS`（不再依赖 `@CurrentUser()` 判断，见 D1）。

- 同一模板迁移 equipment/catalogs/brands/filter-types 的只读路由；迁移后后台各 Controller 删除 `@Public()`、`@Throttle` 相关路由与 `user ? undefined : {visibility}` 三元逻辑，仅保留权限路由。

- 保留 `GET /equipment/equipment/:id/filters`（设备关联滤清器查询）迁移到 `b2c/browse/` 对应端点。

- **备选**：不迁移、仅新增 b2c 端点并保留旧公开路由做兼容代理——被否：双路径长期并存会造成"同一能力两套入口"，违背分隔目标，且 `equipment/*` 保留公开路由会让后台守卫语义再次混浊。**BREAKING**：商城进程需同步改调用点为 `b2c/*`。

### D3: Service 层共用 + VisibilityOpts 分流

B2C browse Controller 直接复用 `FiltersService.findAll/findOne`、`EquipmentService`、`CatalogsService`、`BrandsService`、`FilterTypesService`，通过 `VisibilityOpts`（`{ visibility: 'anonymous' }`）触发 `applyVisibility`（强制 enabled）+ 加权排序。B2C 子模块 `imports` 对应 equipment 子模块以复用其 exports 的 Service，**不**新建/复制查询实现。备选"B2C 独立 Service"被否：造成同一查询逻辑双份漂移（加权排序字段表、visibility 判断各有两份）。

### D4: 客户自助询价（所有权下沉到接口 — 卡1 定案）

**背弃"复用** **`InquiriesService.create`** **+ controller 覆盖"**：`CreateInquiryDto` 携带 `customerId?`（后台代管语义），若 B2C 直接复用，customer 可任意指定 `customerId` 挂单，`forbidNonWhitelisted` 拦不住合法字段。独立 B2C 接口让"身份只来自接缝（guard）"在类型/验证层表达。

- **`CreateCustomerInquiryDto`**（独立）：`title`/`description`/`shippingAddressId?`/`lines[]`；**剔除** `customerId`/`customerName`/`customerEmail`/`customerPhone`/`totalAmount`。全局 ValidationPipe 已开 `whitelist + forbidNonWhitelisted: true`（[main.ts](file:///c:/Project/gvray/src/main.ts#L59-L66)），字段不存在即注入不可能。

- **`CreateInquiryLineItemDto`**（独立）：`filterId?`/`productName?`/`quantity`/`remarks`/`sortOrder`；去 `inquiryId`（归属当次询价）。

- **`InquiriesService.createForCustomer(customerId, dto, lines)`**：`$transaction` 内**原子**建询价主体 + 明细行（复用编号生成 + pg\_advisory 逻辑）；`customerId = 首参`（忽略任何 DTO/请求），`createdById = null`，`status = draft`；快照自 DB 取——`customerName/email/phone` 从 Customer 记录、明细行 `productName/model/typeName` 复用 `InquiryLinesService` 的 filter 快照逻辑；`shippingAddressId` 校验归属当前客户。

- **查询**：`findMyInquiries(customerId, query)`、`findOneForCustomer(customerId, inquiryId)`（归属不符 404），复用分页/详情组装。

- **状态只读**：B2C 不暴露 `PATCH status`；流转仍由后台运营执行。

- 后台 `create(dto, createdById?)`/`findAll`/`findOne` 与 `InquiryLinesService` 保持不动（admin 维度无关）。

### D5: 客户自助地址（self 域深模块 — 卡2 定案）

`AddressesService` 现有 6 个方法为**后台代管语义**（`customerId` 在 DTO；`findOne/update/setDefault/remove` 按 `addressId` 查且**不做归属校验**——持有任意 addressId 即可操作他人地址）。admin 代管与 B2C self 是**两个信任维度**，硬并入单一方法族会让"谁能操作谁"又靠调用方记忆。**不**在 `AddressesService` 平铺 5 个 `*ForCustomer`。

- **拆 self 域深模块**：B2C 地址专用 Service（并入 `b2c/addresses/`），承载 `createForCustomer(customerId, dto)`/`findMyAddresses(customerId, query)`/`updateForCustomer(customerId, addressId, dto)`/`removeForCustomer(customerId, addressId)`/`setDefaultForCustomer(customerId, addressId)`。归属过滤下沉：`findUnique({ addressId, customerId })`，他人 addressId 视为"不可见"返回 404（接口表达不变量）。

- **`CreateCustomerAddressDto`**（独立）：地址业务字段，**无** `customerId`（身份取自 `@CurrentCustomer()`）。

- **收敛** **`isDefault`** **事务**：抽私有深 helper `setAsDefaultInTx(tx, customerId, addressId)`（updateMany 置 false → 设 true），create/update/setDefault 三处复用——bug 单点修（记忆：`isDefault` 是 "Service transaction 强制保证"）。

- 后台 `AddressesService` 原 6 方法 + `customer/addresses` 管理端点与权限保持不动。

### D6: Swagger 与鉴权约定

- B2C 子模块 `@ApiTags('B2C 滤清器浏览')` 等独立 tag，`@ApiBearerAuth('JWT-auth')` 仅挂写端点（`CustomerJwtGuard`），浏览端点标记"公开，无需认证"。

- 写端点统一 `CustomerJwtGuard` + `@CurrentCustomer()`；不引入新权限码（B2C 靠登录态 + 本人数据隔离，与收藏/足迹既有一致）。

- B2C 写端点跳过 `OperationLog`？**否**：客户行为属于业务审计范畴，但现有 `OperationLog` 面向后台用户（`@CurrentUser()`）。B2C 写端点默认不加 `@OperationLog`（与收藏/足迹一致），审计依托访问日志 + 事件型表自身的 createdAt。

## Risks / Trade-offs

- **公开路由 BREAKING**（`equipment/*` → `b2c/*`）→ 部署时与商城进程改版同步发布；提供过渡说明文档；限流/过滤行为不变，仅路径变化。ADR 0005 的"同 URL 分流"被本次 supersede，需补 ADR 增补说明（见 proposal / ADR 同步）。

- **双守卫体系并存**（后台 `AccessGuard` + 客户 `CustomerJwtGuard`）→ B2C 模块内只允许 CustomerJwtGuard，避免混用；Controller 级 `@UseGuards` 显式声明，杜绝继承歧义。

- **exports 面扩大** → 精确 export 被 `b2c/browse` 用到的 Service（过滤/目录/品牌/设备/类型），**不**整 module export；B2C 只单向依赖 equipment/customer/inquiry 模块，禁止反向依赖；e2e 冒烟验证无循环依赖。

- **本人隔离漏网风险** → 所有权下沉到接口（`customerId` 首参 / `findUnique({ addressId, customerId })` / DTO 物理剔除 customerId + `forbidNonWhitelisted`），e2e 覆盖"跨客户访问返回 404/空/400"用例。

## Migration Plan

1. 新增 `src/modules/b2c/` 骨架（b2c.module + browse 子模块），迁移 filters 公开路由，后台 filters Controller 瘦身。
2. 按同模板迁移 equipment/catalogs/brands/filter-types 公开路由，后台对应 Controller 瘦身。
3. 新增 `b2c/inquiries/`（`createForCustomer`/`findMy*` + 独立 DTO）与 `b2c/addresses/`（self 域深模块 + `setAsDefaultInTx` 收敛）。
4. 注册 `B2cModule` 进根模块；全量 e2e（公开浏览 / 客户询价 / 自助地址 / 跨客户隔离 / 后台路径 401）。
5. 部署：与商城进程调用点迁移同步上线；回滚：保留本次 commit 为可整体 revert 的单点，`equipment/*` 公开路由恢复即回退到改造前行为。

## Open Questions

- 无（均已在 grilling 收敛：闭环范围、足迹边界、路由归属、Service 复用、询价/地址补齐、后台路径不变均已定案）。

