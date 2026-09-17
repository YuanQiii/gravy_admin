## 1. DTO 拆分与字段删除

- [ ] 1.1 在 `apps/mall/src/modules/mall/addresses/dto/` 将 `QueryAddressDto` 重命名为 `QueryAddressSelfDto`，删除 `customerId`/`receiver`/`phone`，仅继承 `PaginationSortDto`；更新 `customer-addresses.service.ts` 与 `mall-addresses.controller.ts` 的 import。验证：`grep -rn "QueryAddressDto" apps/mall` 旧名清零且 `tsc` 编译通过。
- [ ] 1.2 将 `apps/mall/src/modules/customer-activity/dto/query-favorite.dto.ts` 改为 `QueryFavoriteSelfDto`，删除 `customerId`、保留 `filterId`；更新 `customer-activity.service.ts` 与 `favorites.controller.ts` 的 import。验证：编译通过，且 `findFavorites` 仍按 `filterId` 过滤。
- [ ] 1.3 将 `apps/mall/src/modules/customer-activity/dto/query-history.dto.ts` 改为 `QueryHistorySelfDto`，删除 `customerId`、保留 `filterId`；更新 `customer-activity.service.ts` 与 `history.controller.ts` 的 import。验证：编译通过，且 `findHistory` 仍按 `filterId` 过滤。

## 2. 移除 Controller 身份覆写

- [ ] 2.1 删除 `favorites.controller.ts:68` 的 `query.customerId = customer.customerId`（字段已不存在，否则编译错误）。验证：编译通过，集成测试断言列表仅含当前客户。
- [ ] 2.2 删除 `history.controller.ts:44` 的 `query.customerId = customer.customerId`。验证：编译通过。

## 3. 契约验证测试

- [ ] 3.1 新增/补全集成测试：已登录客户 `GET /favorites?filterId=<本客户某收藏滤清器>` 返回仅该滤清器收藏；换用非本客户 `filterId` 返回空。验证：断言结果集随 `filterId` 改变（查询参数确实影响结果）。
- [ ] 3.2 集成测试：`GET /addresses?customerId=...` 或 `?receiver=...` 返回 400（`forbidNonWhitelisted`）；`GET /favorites?customerId=...` 与 `GET /history?customerId=...` 同样返回 400。验证：断言状态码 400。
- [ ] 3.3 集成测试：三端点不带任何筛选参数时正常分页返回当前客户数据。验证：断言 200 且 `items` 符合当前客户身份。

## 5. 架构审查采纳项（grilling 回写）

- [ ] 5.1 在 `@gvray/core`（或 mall-shared）抽出 `SelfPagedQueryDto`（继承 `PaginationSortDto`）与 `SelfFilterableQueryDto extends SelfPagedQueryDto`（增添 `filterId`）；三处 self DTO 改为继承对应基类，仅声明差异，行为不变。验证：`grep -rn "extends PaginationSortDto" apps/mall/src/modules/mall/addresses apps/mall/src/modules/customer-activity` 显示三处改为继承新基类，编译通过。
- [ ] 5.2 新增共享测试适配器：断言三个 self 查询 DTO 不声明 `customerId`/`receiver`/`phone` 等身份/内容字段，且三端点未知查询字段返回 400；复用至 3.2 的 400 测试，防回归。验证：运行该测试套件全绿，且删除任一 DTO 的 filterId 声明时断言失败。

## 4. 文档与一致性

- [ ] 4.1 确认 admin `QueryAddressDto` 未受影响（独立本地文件）。验证：`grep -rn "QueryAddressDto" apps/admin` 引用数不变（仍为 `addresses.controller.ts` 与 `addresses.service.ts` 两处）。
- [ ] 4.2 运行 `openspec validate align-mall-self-query-dtos --strict` 通过。验证：命令退出码 0，无 "MODIFIED omits scenario(s)" 等报错。
