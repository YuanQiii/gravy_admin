## Context

本变更是 P0-2（`openspec/changes/snapshot-inquiry-shipping-address/`）的下游补完，必须建立在它之上、不重复它、不与它冲突。

P0-2 已做的与本问题直接相关的事实（已读其 `design.md` 决策 4、`tasks.md` 2.2/2.3 确认）：

1. 引入私有接缝 `resolveShippingSnapshot(tx, addressId, ownerCustomerId?)`：在**事务内**读取地址，`ownerCustomerId` 非空时断言 `address.customerId === ownerCustomerId`，产出 7 字段快照（P0-2 范围）。
2. 客户路径 `createForCustomer` 改调该接缝并**删除**原先事务外的归属校验（语义/状态码不变，净删除）。
3. **管理端路径传 `ownerCustomerId = null`**（刻意不校验归属，保持 P0-2 落地前的外部行为），并在方法注释中写明「P2-4 将把它改为传 `dto.customerId`」。

因此本变更的 delta 边界是：**把 P0-2 预留的 `null` 实参改为 `dto.customerId`**（管理端归属校验生效）+ 在 DTO 层补跨字段约束 + 定义「`customerId` 空 + `shippingAddressId` 非空」语义。P0-2 的快照字段、迁移、`resolveShippingSnapshot` 本身的引入**不纳入**本变更。

**前置依赖与 fallback**：本变更消费 `resolveShippingSnapshot`，故 P0-2 必须**先于**本变更 archive。若 P0-2 在 apply 时尚未落地，本变更需**自行引入等价 helper**（同名 `resolveShippingSnapshot`、同签名 `tx, addressId, ownerCustomerId?`，行为：地址不存在/已软删 → `INVALID_SHIPPING_ADDRESS`；`ownerCustomerId` 非空时断言归属），使本变更的管理端调用点保持不变，避免重复定义。

当前代码事实（已核实）：`create` 管理端将 `...rest`（含 `shippingAddressId`、`customerId`）直接 `inquiry.create`，无任何地址校验（`inquiries.service.ts:93-112`）；`createForCustomer` 的归属校验在事务外（`inquiries.service.ts:159-167`）；`CreateInquiryDto` 的 `customerId` 与 `shippingAddressId` 是独立可选字段、无交叉约束（`create-inquiry.dto.ts:25-53`）；`grep -rn "shippingAddressId" apps packages` 确认仅 `create` 与 `createForCustomer` 两个写入入口，无其他创建入口。

## Goals / Non-Goals

**Goals:**

- 管理端代客下单时，「地址必须属于该询价单的 `customerId`」这一不变量在事务内统一校验，且不存在/已删/归属他人一律 400 而非 500。
- 用 DTO 跨字段约束把「`shippingAddressId` 非空 ⇒ `customerId` 非空」前置到校验层，消除「空客户 + 非空地址」的错挂与 500 路径。
- 与 P0-2 共用同一个 `resolveShippingSnapshot` seam，不新增平行校验。

**Non-Goals:**

- **不做**客户自助路径的归属校验重写——已由 P0-2 收进事务内 seam，行为一致。
- **不做** `customerId` 本身的存在性/有效性校验（如「`customerId` 引用的客户必须存在」）——属独立的写入完整性问题，不在 P2-4 范围，且同样可借 P0-2 接缝范式后续统一，但本次不动。
- **不做**快照字段/迁移（P0-2 范围）。
- **不做**软删化地址或外键 `Restrict`（P3-2 范围）。

## Decisions

### 1. 管理端 `create` 调用 `resolveShippingSnapshot(tx, dto.shippingAddressId, dto.customerId)`

把 P0-2 预留的 `null` 实参改为 `dto.customerId`，使归属校验进入事务内 seam，与客户路径共用同一不变量表达。

*备选（否决）*：在 `create` 另写一段 `customerAddress.findUnique` + `address.customerId === dto.customerId` 断言。这会重复 P0-2 的 seam 逻辑，且若写在事务外又会回到原 TOCTOU 缺陷；否决。

### 2. DTO 跨字段约束用 class-validator 的**类装饰器**表达

新增 `ShippingAddressRequiresCustomerConstraint`（`ValidatorConstraintInterface`），`validate(dto)` 逻辑为「`dto.shippingAddressId` 非空且 `dto.customerId` 为空 ⇒ false」，`defaultMessage` 返回 `'SHIPPING_ADDRESS_REQUIRES_CUSTOMER'`；在 `CreateInquiryDto` 类上挂 `@ShippingAddressRequiresCustomer()`。

**实现订正（实施时发现，原设计写法不可编译）**：`class-validator` 的 `@Validate(...)` 返回的是 **`PropertyDecorator`**，套在类上会得到 `TS1238: Unable to resolve signature of class decorator when called as an expression`。类级约束的正确写法是用 `registerDecorator({ target: <类>, propertyName: undefined, validator })` 包一层 **`ClassDecorator`** —— 所以该文件导出的是装饰器工厂 `ShippingAddressRequiresCustomer()`，DTO 上挂的也是它。另：`propertyName` 在类型上是 `string`，类级语义恰为空值，故用显式断言 + 注释交代。

理由：跨字段校验需在对象层面判定，**类级约束**是 class-validator 的标准跨字段手段（实测 `validate()` 会执行它，即 Nest `ValidationPipe` 内部那一步）；它只读取已声明字段、**不引入任何新属性**，因此与全局 `forbidNonWhitelisted`（`whitelist + forbidNonWhitelisted: true`）**不冲突**——后者仅拒绝未声明属性，不关心字段间关系。

*备选（否决）*：用属性级 `@ValidateIf` / `@IsNotEmpty` 拼装。属性级装饰器只能单字段判定，无法表达「另一字段为空的依赖」，做不到该约束。
*备选（否决）*：用 `@ValidateNested` 把 `shippingAddressId` 包成子对象。破坏现有扁平 DTO 与 Swagger 契约，收益为零。

*备选（否决）*：用属性级 `@ValidateIf` / `@IsNotEmpty` 拼装。属性级装饰器只能单字段判定，无法表达「另一字段为空的依赖」，做不到该约束。
*备选（否决）*：用 `@ValidateNested` 把 `shippingAddressId` 包成子对象。破坏现有扁平 DTO 与 Swagger 契约，收益为零。

### 3. 「`customerId` 为空 + `shippingAddressId` 非空」语义定为**拒绝（400）**

地址由某一客户拥有；询价单的收货地址必须属于该询价单的 `customerId`。当 `customerId` 为空时，「属于谁」无从成立。若放行，seam 以 `ownerCustomerId = null` 仅做存在性检查，会把**他人**地址挂到空客户单上——既违背数据完整性，又制造错挂。故在 DTO 层 fast-fail 拒绝。

该语义与「匿名询价合法」不冲突：匿名询价是 `customerId` 与 `shippingAddressId` **均为空**，本约束只禁止「有地址无客户」的组合。

### 4. 跨字段约束仅挂在 `CreateInquiryDto`（管理端）

`CreateCustomerInquiryDto`（客户自助）不含 `customerId`（身份来自 `@CurrentCustomer()`），`customerId` 恒存在，不存在此二义，故**不挂**该约束。约束的适用范围精确到管理端 DTO，避免误伤客户路径。

## Risks / Trade-offs

1. **[依赖 P0-2 先落地]** → 本变更调用 `resolveShippingSnapshot` 与 `(tx, dto.shippingAddressId, dto.customerId)` 合同；若 P0-2 未落地，本变更自行引入等价 helper（同名同签名，见 Context fallback），保证调用点不变、不产生重复定义。归档顺序：P0-2 先 archive。
2. **[400 替代 500 的调用方影响]** → 原先不存在/他人地址 ID 触发 500 FK 兜底，现统一为 400 `INVALID_SHIPPING_ADDRESS`。属正确性修复（错误语义更正），非字段契约变更；需在 tasks 中加单测固化"断言 400 而非 500"，并提示前端/调用方：代客下单地址非法将收 400。
3. **[DTO 约束与 `forbidNonWhitelisted` 的交互]** → 类级 `@Validate` 不新增属性，与 `forbidNonWhitelisted` 无冲突（决策 2 已论证）；单测需断言 admin DTO 仅传 `shippingAddressId` 时校验失败返回 400。
4. **[客户路径不受本变更影响]** → 客户路径 `customerId` 恒来自登录态，其归属校验已由 P0-2 在事务内 seam 覆盖；本变更不改动该路径，需单测确认客户路径「他人地址 → 400」用例仍通过（防止回归）。

## Architecture Review Adoptions

架构审查（见 `architecture-review-P2-4-address-ownership.html`）的三条候选，用户已预授权「同意推荐」，结论如下回写：

### 采纳 A（Strong）：把归属不变量收口为单一 interface

新增 `shippingAddressOwnership.ts` 暴露 `assertShippingAddressOwned(address, ownerCustomerId?)`，集中「地址存在、未软删、`address.customerId === ownerCustomerId`」三件套判定与错误码 `INVALID_SHIPPING_ADDRESS`；P0-2 的 `resolveShippingSnapshot` 内部改为调用它而非内联断言。DTO 的 `ShippingAddressRequiresCustomerConstraint` 退化为该规则的「形状前置」：仅判定「有地址则必须有 owner」，真正的归属判定仍由此 interface 在事务内完成。理由：当前 DTO 前置校验与 service seam 把同一条不变量写了两半，正是 P0-2 决策 4 已点名的重复表达坏味道；收口后判定与错误码只有一份，interface 即测试面（locality + leverage）。

### 采纳 B（Worth exploring）：在调用边界一次性解析 ownerCustomerId

新增 adapter `resolveOwnerCustomerId(ownerSource)`（admin 取 `dto.customerId`、customer 取登录态 token），两条 create 路径都调用它再把结果传入 seam，不再各自写死 `ownerCustomerId` 来源。理由：owner 解析的 interface 只有一份实现与一份测试面，新增来源（如第三方代下单）零扩散。

### 否决 C（Speculative）：暂不抽取 `ShippingAddressSelection` 模块

采纳其推荐项「暂缓」。理由：删除测试不通过——抽取只会把对接 seam 的接线从两处搬到一处，不集中复杂度；当前仅两个消费者（admin / customer 路径），抽象收益为负。待出现第三消费者（如批量导入询价）时再议，维持 P0-2 现有 seam 形态不提前加深。
