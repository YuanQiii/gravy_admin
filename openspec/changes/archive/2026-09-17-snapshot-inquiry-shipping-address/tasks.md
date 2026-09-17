## 1. 数据模型与迁移

- [x] 1.1 `prisma/schema.prisma` 的 `Inquiry` 增加 7 个快照字段（`shippingReceiver` / `shippingPhone` / `shippingProvince` / `shippingCity` / `shippingDistrict` / `shippingDetailAddress` / `shippingZipCode`，全部 `String?`），并按 design 决策 3 **不改** `shippingAddress` 关系的 `onDelete: SetNull`。字段区加注释指向快照语义。验证：`pnpm prisma:generate` 通过；`grep -n "shippingReceiver" prisma/schema.prisma` 命中。**已执行**：`prisma generate` 通过。
- [x] 1.2 生成迁移：`pnpm prisma:migrate:dev --name add_inquiry_shipping_address_snapshot`（**需用户确认后执行**，属数据库变更）。进入生成的 `migration.sql` 追加存量回填语句（`UPDATE "inquiries" SET ... FROM "customer_addresses" WHERE "shippingAddressId" = "addressId"`），并加注释说明「已被置空的引用无数据源，保持 null」。验证：迁移文件同时含 `ADD COLUMN` 与回填 `UPDATE`；在本地 dev 库上 `migrate dev` 成功。
  **已执行（经用户确认）**：
  - 迁移文件 `prisma/migrations/20260917080000_add_inquiry_shipping_address_snapshot/migration.sql`（7 × `ADD COLUMN` + 一条 `UPDATE ... FROM` 回填 + 「被置空引用无数据源」注释）。
  - **应用前**用只读方式核对：`prisma migrate status` 显示**仅此一条待应用、无 drift**；`prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel` 输出**恰好**是这 7 个 `ADD COLUMN`（迁移 SQL 与 Prisma 预期一致）。
  - **应用**：`npx prisma migrate dev` → `Applying migration 20260917080000_...`，随后 `Your database is now in sync with your schema.`；再查 `prisma migrate status` → `Database schema is up to date!`
  - **遗留告警（无害）**：同一命令尾部的 `prisma generate` 报 `EPERM: rename query_engine-windows.dll.node.tmp*`——Windows 文件锁（引擎 DLL 被占用），属已知问题且**无功能影响**：查询引擎是版本级而非 schema 级产物，本次只改了 schema。已确认生成客户端是当前版本：`.prisma/client/index.d.ts` 中 `shippingReceiver` 命中 **59** 处，且新列的实际查询在本轮验证中成功执行；重跑 `generate` 仍报同一 EPERM，属环境问题（锁持有者不是本会话的进程）。

- [x] 1.3 新增 `ShippingSnapshotShape`（TS 接口，7 个 `string | null`）与 `SHIPPING_SNAPSHOT_SELECT`（Prisma select 常量），位置贴近 `INQUIRY_DETAIL_INCLUDE`（同一文件、同一接缝区）。**不**从 `@gvray/domain` barrel 导出（控制器不需要，不扩大公开面）。验证：`grep -n "ShippingSnapshotShape\|SHIPPING_SNAPSHOT_SELECT" packages/domain/src/index.ts` 无命中；`tsc -p packages/domain/tsconfig.json` 通过。**已执行**：`SHIPPING_SNAPSHOT_SELECT` 落在 `inquiries.service.ts` 的接缝区；`ShippingSnapshotShape` 落在新文件 `dto/shipping-snapshot.shape.ts`（**偏离原任务措辞**：接口若留在 service，DTO 为 `implements` 它就得反向依赖 service；挪到两者共同的下游文件，方向不倒置。另附 `SHIPPING_SNAPSHOT_KEYS` + 穷尽性断言，使字段集同时具备编译期与运行时真值）。barrel 0 命中、tsc 通过。

## 2. 写路径：快照解析单点

- [x] 2.1 `packages/domain/src/inquiry/inquiries/inquiries.service.ts` 新增私有 `resolveShippingSnapshot(tx, addressId, ownerCustomerId?)`：事务内按 `addressId` + `SHIPPING_SNAPSHOT_SELECT` 读取；地址不存在或 `deletedAt` 非空 → `BadRequestException('INVALID_SHIPPING_ADDRESS')`；`ownerCustomerId` 非空时断言 `address.customerId === ownerCustomerId`（同码）。验证：单测覆盖「地址存在」「不存在」「已软删」「属于他人（传 ownerCustomerId 时）」四种输入；`grep -c "INVALID_SHIPPING_ADDRESS" inquiries.service.ts` 为 **1**（校验单点）。**已执行**：三种失败合并为**一条**守卫（同一错误码与消息，故无需分支）→ grep 计数 **1**；`customerAddress.findUnique` 全文件仅 1 处（helper 内）。
- [x] 2.2 `createForCustomer`：把快照读取移入 `$transaction` 内（与主体 + 明细行同一事务），调用 `resolveShippingSnapshot(tx, dto.shippingAddressId, customerId)`；**删除**原先位于事务外的归属校验（语义与状态码相同，净删除）。验证：单测断言 `inquiry.create` 的 `data` 含 7 个快照字段且取自被引用地址；断言事务外不再有 `customerAddress.findUnique` 调用；「引用他人地址 → 400」用例保持通过。**已执行**：事务外校验已删除；单测断言快照 7 字段取自地址、且读取发生在 `tx` 上。
- [x] 2.3 `create`（管理端）：事务内调用 `resolveShippingSnapshot(tx, dto.shippingAddressId, null)` 并写入快照；`shippingAddressId` 传了但不存在/已删的场景由 helper 的 400 覆盖（原先为 Prisma FK 报错 500）。**归属校验仍不生效**（`ownerCustomerId` 传 `null`），保持本变更前的外部行为，在方法注释中写明 P2-4 将改为传 `dto.customerId`。验证：单测断言管理端路径写入快照；非法 `shippingAddressId` 抛 `BadRequestException` 而非 500。**已执行**：`dto` 解构出 `shippingAddressId` 后显式回写，快照 spread 并入；含一条 characterization 用例锁定「管理端暂不校验归属」（P2-4 接管时会改它）。

## 3. 响应投影与入参防线

- [x] 3.1 `dto/inquiry-response.dto.ts` 增加 7 个快照字段（`@Expose()` + `@ApiPropertyOptional`，描述明确「创建时点冻结」）。因 `Inquiry response projection` 接缝已收拢 9 个出口，**不需要**改任何 Service 方法签名。验证：`InquiryDetailResponseDto extends InquiryResponseDto` 单测断言快照字段在详情响应在场；列表响应的字段集断言同步更新。**已执行**：字段声明为 `string | null` + `implements ShippingSnapshotShape`（编译期锁步），Swagger 用 `@ApiProperty({ nullable: true })` 表达"字段在场、值可为 null"；详情/列表各有在场断言，另加 null 与"引用置空但快照仍在"两组用例。
- [x] 3.2 `dto/create-inquiry.dto.ts` 与 `dto/customer-b2c/create-customer-inquiry.dto.ts` **不**声明 7 个快照字段。验证：e2e 断言请求体携带 `shippingReceiver` 时返回 400（`forbidNonWhitelisted`）。**已执行**：两个入参 DTO 仅含 `shippingAddressId`；e2e 覆盖客户路径与后台路径各一条 400 用例。
- [x] 3.3 两个应用的控制器 Swagger：详情/列表端点的 `type` 指向的 DTO 自动带出新字段，核对描述为中文且口径一致（`apps/mall/src/modules/mall/inquiries/mall-inquiries.controller.ts`、`apps/admin/src/modules/inquiry/inquiries/inquiries.controller.ts`）。验证：`pnpm build` 后 Swagger 无告警，字段描述与实现一致。**已执行**：两应用 `nest build` 通过（控制器 `type` 指向 DTO，字段自动出现，无需改控制器）。

## 4. 规格与文档同步

- [x] 4.1 新增 ADR `docs/adr/0015-inquiry-shipping-address-snapshot.md`：记录「引用外部可变实体一律存快照」决策、与 `InquiryLine`/联系人快照范式的对齐、以及"快照冻结而非跟随"的取舍与备选否决。**已执行**。
- [x] 4.2 订正 `AGENTS.md` 关于 `relationMode = "prisma"` / "无外键约束" 的表述，使其与 `schema.prisma` 及 `0_init/migration.sql` 的实际状态一致（仅改描述，不动 schema）。验证：`grep -n "relationMode" AGENTS.md prisma/schema.prisma` 结果自洽。**已执行**：改为「未声明 `relationMode`（默认 `foreignKeys`），原生外键 + 级联由 DB 执行」，并点出硬删地址会把 `shippingAddressId` 置空这一实例。
- [x] 4.3 若 `docs/features.md` 或 `docs/` 下其他文档描述询价响应字段，同步补快照字段。验证：`grep -rn "shippingAddressId" docs/` 复核。**已执行**：`docs/` 无 `shippingAddressId` 命中 → 无需同步（新增 ADR 0015 除外）。
- [x] 4.4 核对 `openspec/specs/customer/spec.md` 与 `openspec/specs/inquiry/spec.md` 在归档时的 delta 合并（`/opsx-archive` 动作）。**已于归档时执行（2026-09-17）**：
  - `inquiry`「询价单创建」→ 描述补入「`shippingAddressId` 语义为溯源引用 + 7 个快照字段」与「创建时点写入且不可变」两段，场景 3 → **5**（新增「创建时写入地址快照」「未提供地址时快照为空」）。
  - `customer`「客户自助地址用于询价」→ 描述补入快照与「地址删除后仍可读」，场景 2 → **5**（新增「地址删除后询价单快照仍完整」「地址修改不回溯已创建询价单」「客户端不能自行指定快照」）。
  - `openspec validate --specs` → **10 passed / 0 failed**；主规格无 delta 操作头残留。

## 归档时未结清的项（验证报告 2026-09-17）

验证报告：`./verification-20260917.md`（随本归档目录一同入库；仓库 `/reports/` 被 gitignore，故验证报告放在此处而非那里）。两条 warning 未在本变更内处理（都超出其规格范围），**留痕以便立项**：

- **W1（建议优先立项）· PATCH 可改地址引用而不动快照**：`InquiriesService.update` 的 `...rest` 仍透传 `shippingAddressId`（`UpdateInquiryDto extends PartialType(CreateInquiryDto)`），可造成「引用指向 B、快照是 A」。规格只定义了"地址的改动不影响快照"，未定义"询价单自身换引用"。两条候选：(a) 创建后引用不可变（`update` 剔除该字段）；(b) 允许换引用但同事务重解析快照。倾向 (a)。
  → **落点建议**：并入 `validate-inquiry-shipping-address-ownership`（同改「询价单创建」Requirement 与同一条地址写路径）。
- **W2 · Scenario「地址修改不回溯已创建询价单」无测试覆盖**：结构上成立（无任何路径更新 `inquiries.shipping*`），但无用例断言。→ 补一条便宜断言（e2e：`PATCH /addresses/:id` 后 `GET /inquiries/:id` 快照逐字不变）。

## 5. 测试

- [x] 5.1 单测（`inquiries.service.spec.ts`）：创建时写入快照、未提供地址时快照全为 `null`、非法地址抛 400、管理端路径同样写快照。验证：`pnpm test` 通过。**已执行**：`makePrisma` 的 `$transaction` 改为复用同一个 `tx` mock（测试因此能断言"读取在事务内"）；新增 6 条用例（他人地址 400 / 不存在 400 / 已软删 400 / 本人写快照 / 未提供不写快照且不读地址表 / 管理端写快照+非法地址 400+归属暂不校验）。domain 47/47 通过。
- [x] 5.2 DTO 单测：快照字段进入列表与详情两个响应形状，且 `null` 保持 `null`、不出现字段缺失以外的异常行为。验证：`pnpm test` 通过。**已执行**：新增 4 条用例（列表携带 7 字段并取地址值、详情携带、未选地址时字段在场且为 null、引用置空而快照仍在），断言用 `SHIPPING_SNAPSHOT_KEYS` 遍历（加字段忘了加清单 → 编译失败）。
- [x] 5.3 e2e（新增或扩展 `test/`）：① 客户创建带地址的询价单 → 详情返回快照；② 删除该地址后再次查询 → 快照仍完整、`shippingAddressId` 为 `null`；③ 请求体携带 `shippingReceiver` → 400。验证：`pnpm test:e2e` 相关套件全绿。**已执行**：新增 `test/inquiry-shipping-snapshot.e2e-spec.ts`（10 用例，含 Mall 与 Admin 两条路径；②用行数据模拟外键 SetNull 的结果）。全量 e2e **5 套件 / 60 用例**通过。
- [x] 5.4 迁移验证：在本地 dev 库上对含存量询价单的数据集执行迁移，断言引用存活的行已回填、引用为空的行保持 `null`。验证：迁移后手工查询两条 SQL 的结果符合预期。
  **已执行（真实 Postgres）**：
  - 迁移后字典核对：`inquiries.shipping*` 7 列齐备（`text` / 全部 nullable）；`information_schema` 实测。
  - 一致性核对：`引用存活却未回填` → **0**；`引用为空却凭空有快照` → **0**。
  - **回填路径的实证**：dev 库原有 2 张询价单、**0 张带地址引用**，即存量数据无法exercise回填。因此在**可回滚事务**内造数据实证：插入 1 临时 customer + 1 address + 1 引用该地址的 inquiry → 断言新行快照为 `null` → 执行迁移里那条回填 `UPDATE`（影响 **1** 行）→ 断言 `shippingReceiver='张三'` / `shippingCity='无锡市'` / `shippingDetailAddress='太湖大道 100 号'` / `shippingZipCode='214000'` 全部落入 → 断言「引用为空却带快照」为 0 → **抛错回滚**。
  - 回滚后核对：`inquiries` 行数 2 → 2、临时 customer 残留 0 → **测试数据零残留**（回填语句的正确性因此是实证的，而不是"vacuous pass"）。
