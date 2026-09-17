## 1. DTO 跨字段约束

- [x] 1.1 在 `packages/domain/src/inquiry/inquiries/dto/` 新增约束类 `ShippingAddressRequiresCustomerConstraint`（`ValidatorConstraintInterface`）：`validate(dto)` 当 `dto.shippingAddressId` 非空且 `dto.customerId` 为空时返回 `false`，`defaultMessage` 返回 `'SHIPPING_ADDRESS_REQUIRES_CUSTOMER'`；并在 `CreateInquiryDto` 类上挂类级约束。验证：DTO 单测断言「仅传 `shippingAddressId`」时 `validate` 失败、消息含该错误码；`tsc` 通过。
  **已执行，但装饰器形态与任务措辞不同（必须偏离）**：`class-validator` 的 `@Validate(...)` 返回的是 **`PropertyDecorator`**，套在类上会得到 `TS1238: Unable to resolve signature of class decorator`（实测报错）。类级约束的正确写法是 `registerDecorator({ target: 类, propertyName: undefined, validator })` 包一层**类装饰器**，故文件同时导出 `ShippingAddressRequiresCustomer()`（`ClassDecorator`），DTO 上挂的是它而不是裸约束类。`propertyName` 字段在类型上是 `string`，类级语义恰为空，已用显式断言 + 注释说明。另：约束文件用 `import type` 引 `CreateInquiryDto`，避免 dto ⇄ 约束互相 import 成环。验证通过：DTO 单测 5 条（含「仅传地址被拒」「两者同传通过」「匿名通过」「只传客户通过」「客户 DTO 不受影响」），`tsc` 通过。
- [x] 1.2 确认约束**不**挂在 `CreateCustomerInquiryDto`（客户路径 `customerId` 恒来自 `@CurrentCustomer()`）。验证：`grep -c "ShippingAddressRequiresCustomer" .../customer-b2c/create-customer-inquiry.dto.ts` → **0**；DTO 单测另有一条断言客户 DTO 不产生该错误码。
- [x] 1.3 确认与全局 `forbidNonWhitelisted` 无冲突（类级约束不引入新属性）。验证：e2e「管理端创建同样写入快照」带合法 `shippingAddressId`+`customerId` 通过（201），未触发白名单 400。

## 2. 管理端写路径：事务内归属校验

- [x] 2.1 前置变更 `snapshot-inquiry-shipping-address`（P0-2）已落地并归档 → 本任务适用：管理端 `resolveShippingSnapshot` 的实参由 `null` 改为 `dto.customerId` 经 `resolveOwnerCustomerId({ realm: 'admin', ... })` 解析后传入，调用仍在 `$transaction` 内。验证：`grep -n "resolveOwnerCustomerId" inquiries.service.ts` 在两处调用点命中（管理端 + 客户路径）。
- [x] 2.2 **不适用**——P0-2 已落地，无需自行引入等价 helper（等价实现已存在于 `resolveShippingSnapshot` + `shipping-address-ownership.ts`）。
- [x] 2.3 管理端 `create` 在事务内调用接缝（`shippingAddressId` 非空时）并透传快照字段。验证：单测「地址归属该客户时通过」+「错挂他人地址 → 400 且未创建询价单」；e2e「管理端创建同样写入快照」（201）+「错挂他人地址 → 400 含 `INVALID_SHIPPING_ADDRESS`」+「地址不存在 → 400（不再是 500）」。

## 3. 规格与文档同步

- [x] 3.1 核对 `openspec/specs/inquiry/spec.md` 在归档时的 delta 合并。**已于归档时执行（2026-09-17）**：
  - MODIFIED「询价单创建」→ 描述补入归属校验与跨字段约束段；场景 5 → **7**（新增「管理端代客下单携带有效地址」「管理端仅传地址不传客户被拒」），并同步「匿名询价」措辞（显式断言 `shippingAddressId` 为空）。
  - ADDED「管理端询价单收货地址归属校验」→ 新增于「询价单创建」之后（与创建路径相邻，便于阅读），含 3 个场景。
  - `openspec validate --specs` → **10 passed / 0 failed**；主规格 Requirement 数 10 → **11**；无 delta 操作头残留。
  **⚠️ 本次归档再次触发连锁**（与 P0-2 归档时同一机制）：`derive-inquiry-price-aggregates` 的 MODIFIED 块是在 P0-2 归档后、P2-4 归档**前**重放的，本次合并后它又缺了这两个场景**以及本变更刚并入的归属描述段**——`validate --strict` 立刻报 `omits scenario(s)`。已把该块**二次重放**到本次合并后的主规格之上（描述三段齐备，场景 7 + 4 = **11**）。**结论：每次归档都会让所有改写同一 Requirement 的未归档变更失效，必须逐个重放。**
- [x] 3.2 记录「`customerId` 空 + `shippingAddressId` 非空 ⇒ 拒绝（400）」的语义决策。验证：`design.md` 决策 3 与 delta 场景「管理端仅传地址不传客户被拒」一致；e2e 断言错误码 `SHIPPING_ADDRESS_REQUIRES_CUSTOMER`。

## 4. 测试

- [x] 4.1 单测（`inquiries.service.spec.ts`）：管理端代客下单地址归属正确通过；错挂他人地址 → 400；地址不存在 → 400 而非 500；地址已软删 → 400（客户路径用例覆盖同一 seam，管理端由「错挂」+「不存在」两条覆盖）。验证：`pnpm test` → domain **59/59** 通过。
- [x] 4.2 DTO 单测（新增 `dto/create-inquiry.dto.spec.ts`）：仅传 `shippingAddressId` 时校验失败并返回 `SHIPPING_ADDRESS_REQUIRES_CUSTOMER`；两者同时提供时通过；匿名（都空）通过；只传客户通过；客户自助 DTO 不受影响。验证：5 条用例通过（走 `class-validator` 的 `validate()`，即 `ValidationPipe` 内部那一步）。
- [x] 4.3 回归：客户路径「他人 `shippingAddressId` → 400」用例仍通过，确认本变更未改动客户路径的对外语义。验证：domain 全部套件 + 全量 e2e 全绿。

## 5. 架构审查采纳项（回写）

- [x] 5.1 新增 `shipping-address-ownership.ts`（**文件名用 kebab-case**，与仓内文件命名一致；任务原文写的是 `shippingAddressOwnership.ts`）暴露 `assertShippingAddressOwned(address, ownerCustomerId?)`；P0-2 的 `resolveShippingSnapshot` 改为调用它。验证：`grep -rn "INVALID_SHIPPING_ADDRESS" packages/domain/src` 仅命中该文件 **1** 处（判定单点；错误码从 service 迁到此模块，service 内已无该字面量）。
  **实现细节**：声明为**断言函数**（`asserts address is T`，泛型保留 Prisma 行的完整类型）而非返回布尔——否则调用方在守卫之后仍需再写一次空值判断（首版即因此产生 7 处 `address possibly null` 编译错误）。
- [x] 5.2 `ShippingAddressRequiresCustomerConstraint` 退化为「有地址则必须有 owner」的形状前置；真正归属判定交由 5.1。验证：DTO 单测断言仅传地址时失败；service 单测断言归属判定在事务内 seam 触发（`assertShippingAddressOwned` 调用位于 `resolveShippingSnapshot` 内）。
- [x] 5.3 新增 `resolveOwnerCustomerId(ownerSource)`（admin → `dto.customerId` 可空；customer → 登录态），两条 create 路径经它取得 `ownerCustomerId` 再传 seam。验证：`grep -n "resolveOwnerCustomerId" inquiries.service.ts` 两处调用点命中；管理端与客户路径单测均通过。
- [x] 5.4 记录「暂不抽取 `ShippingAddressSelection` 模块」决策。验证：`design.md` 的 Architecture Review Adoptions 含否决理由（删除测试不通过、仅两个消费者、待第三消费者再议），本变更未引入该模块。
