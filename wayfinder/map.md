# Wayfinder Map: mall 自助业务逻辑闭环审查修复

label: `wayfinder:map`
status: active

## Destination

mall 自助域的业务循环语义全部定案，产出可直接落地修复的行为规格：**浏览历史真正写入、收藏不再产生孤儿、询价 CANCELLED 状态机与客户提交/取消闭环、客户会话活性语义调和**。地图走完时，six 处未闭环缺口各有明确行为口径与修复清单，交给实现按图落地。

## Notes

- 涉域：mall（`apps/mall`）+ 客户行为域（`customer-activity`）+ 询价域（`@gvray/domain` inquiry）+ 会话内核（`@gvray/core` `SessionStore`）。

- 会话技能需 consult：`grilling`、`domain-modeling`、`nestjs-best-practices`、`prisma-postgres`。

- 已定基线（本轮 grilling 定案，勿重开）：决策先行；recordView 由 mall 主动埋点；收藏校验存在+enabled+未删；询价保留 DRAFT 并新增客户提交/取消端点、状态机加 CANCELLED；access token 维持无状态（5m 宽限）；心跳接线与受信代理头均入。

- 禁止重开：Q5 无状态 AT 语义不在本地图推翻，只在 ticket 04 中"调和"，不"改为有状态"。

## Decisions so far

（index：每个 closed ticket 一行，含名称链接 + 一行要点。当前为空，随 ticket 逐个关闭追加）

## Not yet specified

- 后台侧对客户取消的**感知**：客户 CANCELLED 后，后台询价列表/详情是否需区分取消来源（客户 vs 运营），是否需运营审批后取消（超出"客户自助"边界，待 ticket 01 触及后可细化或排除）。

- 浏览历史与收藏列表在 filter 被软删后的**二次确认兜底**：查询侧是否过滤已删/停用 filter（防历史/收藏列表出现失效条目），未经 ticket 03 定案。

## Out of scope

- **access token 即退即失效 / 状态化会话**（Q5 否决）：5m TTL + RT 撤销已阻断续期，强失效动到核心鉴权路径，属独立高风险 effort，归本 effort 之外。

- **非 mall 端修复**（admin 代管、后台询价 status 端点）不在本地图；仅在契约一致性上被 ticket 02 触及。

<!-- CI 探针（任务 2.4，验证完即回退）：下方链接指向不存在的文件 -->
[CI 探针：故意死链](./ci-probe-does-not-exist.md)

