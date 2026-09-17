# 归档操作与 delta 重放手册

## 归档前盘点

```bash
openspec list                                # 活动变更 + 任务完成度
grep -rn "\- \[ \]" openspec/changes/*/tasks.md   # 未勾项（多为归档期动作，逐条确认是"待归档"还是真未完成）
```

未勾项若标注「归档时由 xxx 合并」，属于归档期动作——先执行 sed/Edit 勾选再归档。**注意加粗标记会让裸 sed 不匹配**（`1.2 **归档前**核对`），用 node 前缀匹配：

```js
t = t.replace('- [ ] 1.2 **归档前**核对', '- [x] 1.2 **归档前**核对');
```

## 归档顺序

约束来源：台账的串行约束表。原则：

1. 同一 Requirement 被多个变更 MODIFIED/REMOVED+ADDED → 按「后写者后归档」排（后归档者的 delta 以更完整的主规格为基准）。
2. 有依赖引用（A 的 ADDED 正文引用 B 的 Requirement）→ B 先归档。
3. 不同 capability 互不影响的可任意排序，但每归档一个就验证剩余。

## 归档命令与行为

```bash
openspec archive <name> -y     # 应用 delta 进主规格并移动到 changes/archive/<日期>-<name>/
openspec validate --specs      # 全部归档后终验
```

- `archive -y` 的 delta 校验**每次只报第一个冲突的 Requirement**，修完重跑才暴露下一个——循环直到成功。
- 校验失败信息形如：`current spec contains scenario(s) not present in the modified block: "场景A", "场景B"`。
- `--skip-specs` 仅用于纯文档/基础设施变更。

## delta 重放（核心方法）

**触发条件**：归档报「缺场景」时，说明主规格已被先归档的变更改写过，本变更的 delta 过期。

**正确方法（2026-09-17 实证）**：以**合并后主规格的 Requirement 块为基底**，只叠加本变更自己的增量（约束句 + 新场景）；**不要**在旧 delta 上补场景——前者自动保住其他变更已合并的文本（如「返回 201（幂等）」措辞、fire-and-forget 描述）不回退。

操作脚本骨架：

```js
// 1. 取主规格该 Requirement 全文（到下一个 ### Requirement 前）
const s = main.indexOf('### Requirement: <名称>');
const e = main.indexOf('\n### Requirement:', s + 10);
let block = main.slice(s, e).trimEnd();
// 2. 把本变更新增的约束句插到描述段锚点句之后（block.replace(锚点, 锚点 + 新句)）
// 3. 块尾追加本变更的新场景
// 4. 用同一定位法替换 delta 文件里的对应块
```

替换后：`openspec validate <name> --strict` → 通过后 `archive -y`。

**验证合并结果**（重放是否成功以结果说话）：

- `grep -c "### Requirement:" openspec/specs/<cap>/spec.md`（归档前后 Requirement 总数守恒，除非 delta 本身 ADD/REMOVE）
- 被替换的旧 Requirement 名 grep 为 0、新名恰 1 条
- 各变更带入的关键措辞（201、fire-and-forget 等）仍各 1 条

## 归档期任务勾选与补记

归档动作完成后，在**已移入 archive 的 tasks.md** 追加「迁移应用记录 / 补记」段落（含验证证据：SQL 结果、grep 计数）。若发现漏勾但工作实际已做，补勾并写补记说明原因，不要静默改历史。

## 迁移（如 delta 涉及 schema）

1. 数据库变更必须用户显式确认（硬规则）；只读核查先行（行数、差异分布）。
2. 手写 `prisma/migrations/<时间戳>_<名>/migration.sql`；`npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` 核对与 schema 无 drift；`npx prisma migrate deploy` 应用（不用 `migrate dev`，它会重新生成而非采用手写迁移）。
3. 应用后 `information_schema` 复查列/索引、`_prisma_migrations` 登记、业务表读写冒烟。
4. 列名 camelCase 带双引号（`"unitPrice"`），表名以 `@@map` 为准。
5. 回填类 UPDATE 设计成幂等（WHERE 只命中与派生规则不符的行），干净库 no-op，可在生产安全重放。
