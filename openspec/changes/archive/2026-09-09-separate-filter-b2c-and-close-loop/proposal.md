## Why

滤清器 B2C 业务链在"转化"环节断裂：客户可以匿名浏览、登录收藏/查足迹，但**无法发起询价、看不到报价进度、无自助地址**（询价 `shippingAddressId` 引用客户地址），"浏览→询价→报价"闭环断在咽喉。同时，B2C 公开浏览接口与后台权限接口**混布在同一 Controller**（`@Public()` 与 `@RequirePermissions` 并存），后台与 B2C 的边界靠运行时判断（`user ? undefined : { visibility: 'anonymous' }`）隐式区分，随 B2C 能力扩张将不可持续，也不符合"与后台管理员模型明确分离"的既定方向。

## What Changes

- 新增 `src/modules/b2c/` 聚合模块，统一承载 B2C 端点，路由收敛到 `b2c/` 前缀。

- 公开浏览路由从 `equipment/*` 迁移到 `b2c/*`：`GET /b2c/filters`、`GET /b2c/filters/:id` 先行，equipment/catalogs/brands/filter-types 的只读浏览接口按同一模板迁移。

- 后台 equipment 域 Controller 瘦身：仅保留权限接口，删除 `@Public()` 与运行时 visibility 分流逻辑，路由 `equipment/*` 不变（后台契约零改动）。

- Service 层共用：B2C Controller 复用现有 Service，靠 `VisibilityOpts`（`anonymous`/`b2c`）分流，不复制查询逻辑。

- 补齐客户侧询价端点（`CustomerJwtGuard`）：创建询价（独立 `CreateCustomerInquiryDto`，`customerId` 取自登录态、DB 快照客户信息，`createForCustomer` 事务原子建主体+明细）、"我的询价"列表（`findMyInquiries`）、查看报价状态与明细（`findOneForCustomer`）。

- 补齐客户自助地址端点（`CustomerJwtGuard`）：新增 self 域深模块承载 `createForCustomer`/`findMyAddresses`/`updateForCustomer`/`removeForCustomer`/`setDefaultForCustomer`（独立 `CreateCustomerAddressDto`，归属过滤下沉 `findUnique({ addressId, customerId })`），支撑询价带地址；收敛 `isDefault` 事务为 `setAsDefaultInTx`。后台 `customer/addresses` 管理端点保持不动。

- 足迹写入（`recordView`）维持既有边界：由独立商城进程接线，本次不补。

- 阶段二"独立商城服务"不在本次范围。

- **ADR 0005 supersede**：本次将公开浏览路由迁至 `b2c/*`，推翻 ADR 0005 Decision 5 的"同 URL 原地分流"，落地时给 ADR 0005 补增补说明。

## Capabilities

### New Capabilities

- `b2c/browse`: B2C 公开浏览域——`b2c/` 前缀下滤清器/设备/目录/品牌/类型的只读浏览端点、`status='enabled'` 强制过滤、加权排序与匿名限流行为。

### Modified Capabilities

- `equipment`: "匿名访客只读访问设备目录"的接口路径从 `equipment/*` 迁移至 `b2c/*`；后台 `equipment/*` 仅保留鉴权接口。

- `inquiry`: 新增已注册客户自助下单、"我的询价"列表与报价状态查询的 B2C 端点行为契约（`CustomerJwtGuard` + 本人数据隔离）。

- `customer`: 收货地址管理新增客户自助语义（`CustomerJwtGuard` + 仅本人数据），与后台管理路径分离。

## Impact

- 新增模块 `src/modules/b2c/`（controller/service/dto；browse + inquiries + addresses 三个子模块），注册进根模块。

- 改动：`src/modules/equipment/filters/`、`equipment/`、`catalogs/`、`brands/`、`filter-types/` 各 Controller（删除 `@Public()` 路由，保留权限路由）；`InquiriesService`（新增 `createForCustomer`/`findMyInquiries`/`findOneForCustomer`）；`b2c/addresses/`（新增 self 域 Service，非在 `AddressesService` 平铺方法）。

- 复用：`FiltersService`/`EquipmentService`/`CatalogsService`/`BrandsService`/`FilterTypesService`（只读浏览，统一 `B2C_OPTS`）、`InquiriesService` 编号生成/事务、`InquiryLinesService` filter 快照逻辑、Customer 快照。

- 新增独立 DTO：`CreateCustomerInquiryDto`/`CreateInquiryLineItemDto`/`CreateCustomerAddressDto`（均无 `customerId`，靠 `forbidNonWhitelisted` 物理隔离字段）。

- 守卫：B2C 写端点统一 `CustomerJwtGuard`；公开浏览 `@Public()` + `Throttle`。

- 权限码：B2C 端点不新增权限码，靠登录态 + 本人数据隔离。

- 破坏性：**BREAKING** — 公开浏览路由 `equipment/*` → `b2c/*`，独立商城进程需同步改调用点（部署配合）。

