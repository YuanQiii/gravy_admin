## 1. B2C 模块骨架与浏览路由迁移

- [x] 1.1 新建 `src/modules/b2c/` 骨架：`b2c.module.ts`（聚合导入 browse/inquiries/addresses 子模块并 export）、`b2c/browse/browse.module.ts`，注册进根 AppModule；定义共享常量 `B2C_OPTS = Object.freeze({ visibility: 'anonymous' })`；验证 `pnpm build` 通过
- [x] 1.2 迁移滤清器公开路由：在 `b2c/browse/` 新增 B2C FiltersController，暴露 `GET /b2c/filters` 与 `GET /b2c/filters/:id`（`@Public()` + `@Throttle(60/min)`，Service 调用统一传 `B2C_OPTS`），从 filters.controller.ts 删除对应 `@Public()` 路由；验证 e2e：匿名请求 `GET /b2c/filters` 返回 200 仅 enabled 记录，匿名请求 `GET /equipment/filters` 返回 401
- [x] 1.3 迁移设备/目录/品牌/滤清器类型公开路由：`b2c/browse/` 下新增 EquipmentController/CatalogsController/BrandsController/FilterTypesController，迁移 `GET /b2c/equipment(/:id)`、`GET /b2c/catalogs(/:id)`、`GET /b2c/brands(/:id)`、`GET /b2c/filter-types`、`GET /b2c/filter-types/options`、`GET /b2c/filter-types/:id`；热门品牌迁移到 `GET /b2c/brands/hot`（复用 BrandService.findHot，见实现期定案）；同步删除后台各 Controller 的 `@Public()` 路由与 `user ? undefined : {visibility}` 三元逻辑；验证 e2e：五个子域匿名浏览 200、后台同路径 401、登录用户后台行为不变（可筛 disabled）；设备关联滤清器查询 `GET /equipment/equipment/:id/filters` 为后台受保护路由，**不迁移**（不在 spec 内，见实现期定案）
- [x] 1.4 **精确 export**：equipment 各子模块只 export 被 `b2c/browse` 用到的 Service，不整 module export；B2C 只单向依赖 equipment/customer/inquiry 模块，禁止反向依赖；验证无循环依赖（`pnpm start:dev` 启动正常）

## 2. 客户自助询价

- [x] 2.1 新增独立 DTO：`CreateCustomerInquiryDto`（title/description/shippingAddressId?/lines[]，**无** customerId/customerName/email/phone）与 `CreateInquiryLineItemDto`（filterId?/productName?/quantity/remarks/sortOrder，去 inquiryId）
- [x] 2.2 在 `InquiriesService` 新增 `createForCustomer(customerId, dto, lines)`：`$transaction` 内原子建询价主体+明细行（复用编号生成/pg_advisory 逻辑），`customerId` 首参、`createdById=null`、快照自 DB（customerName/email/phone 从 Customer，明细 productName/model/typeName 复用 InquiryLinesService filter 快照逻辑），`shippingAddressId` 归属校验；验证单元测试覆盖跨客户注入被拒、快照来源
- [x] 2.3 新增 `findMyInquiries(customerId, query)`（分页 + `createdAt` 降序 + customerId 过滤）与 `findOneForCustomer(customerId, inquiryId)`（归属校验，他人返回 404，含明细行与报价字段）；验证单元测试覆盖"他人询价返回 404"
- [x] 2.4 新增 `b2c/inquiries/` 子模块：InquiriesController（`CustomerJwtGuard`）暴露 `POST /b2c/inquiries`（`@CurrentCustomer()` 取身份，不暴露状态流转端点）、`GET /b2c/inquiries`、`GET /b2c/inquiries/:id`；验证 e2e：客户创建询价单返回 inquiryNo 与 draft 状态、未登录 401、引用他人地址被拒（400）、他人询价 404
- [x] 2.5 B2C 询价子模块 imports InquiriesModule 复用其 Service exports；验证 `pnpm build` 与 e2e 全绿

## 3. 客户自助地址（self 域深模块）

- [x] 3.1 **不在** `AddressesService` 平铺方法。新增 `b2c/addresses/` self 域 Service：`createForCustomer(customerId, dto)`/`findMyAddresses(customerId, query)`/`updateForCustomer(customerId, addressId, dto)`/`removeForCustomer(customerId, addressId)`/`setDefaultForCustomer(customerId, addressId)`，归属过滤下沉 `findUnique({ addressId, customerId })`（他人地址 404）；`CreateCustomerAddressDto` 独立（**无** customerId）；验证单元测试覆盖跨客户隔离与默认地址事务切换
- [x] 3.2 收敛 `isDefault` 事务：抽私有深 helper `setAsDefaultInTx(tx, customerId, addressId)`，create/update/setDefaultForCustomer 三处复用；后台 `AddressesService` 原 6 方法不动
- [x] 3.3 新增 `b2c/addresses/` 子模块：AddressesController（`CustomerJwtGuard`）暴露 `GET/POST/PATCH/DELETE /b2c/addresses(/:id)` 与 `PATCH /b2c/addresses/:id/default`；验证 e2e：客户新增/改/删本人地址、操作他人地址 404、未登录 401、询价单可引用本人地址

## 4. 收尾验证与文档

- [x] 4.1 全量回归：`pnpm build`、`pnpm test`、相关 e2e（匿名浏览五子域、后台路径 401 与登录行为不变、客户询价全链、自助地址、跨客户隔离）；验证 B2C 写端点未误加 `@OperationLog`、未新增权限码
- [x] 4.2 同步更新文档：给 ADR 0005 补增补（supersede Decision 5 "同 URL 分流" + 被拒 Alternative C，说明 B2C 消费方进程分隔理由）；更新 `docs/specs/`（如匿名加权排序 spec 中 `equipment/*` 路径描述）与 CONTEXT.md 中涉及 B2C 浏览路径/边界词条；验证文档路径与代码一致
