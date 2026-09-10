# T01 · 询价 CANCELLED 状态机语义

label: `wayfinder:grilling`
status: open
blocked_by: none

## Question

为询价状态机引入 `cancelled` 时，其完整语义如何定义？

- 哪些**当前状态**允许取消？（仅 `draft`？`draft`+`submitted`？`quoted`/`expired` 是否允许？）
- 谁**有权限**取消？（仅客户本人？后台运营？两者？——客户 cancel 是否等于后台 `updateStatus` 的同一路径，还是两条独立语义）
- 取消后**可否重开**（cancelled → 重开成 draft/submitted）？状态机是否加反向边？
- 客户取消与后台在该询价上的并发操作（如后台正在 `submitted→quoted`）如何互斥/防竞态？
- CANCELLED 是否需要记录取消人/取消原因（时间戳字段）？

现有状态机（`packages/core/src/shared/constants/inquiry.constant.ts`）：
`draft → submitted → quoted → expired`，无反向边。

## Resolution

（待本 ticket 关闭后记录决策；源活只存于本 ticket，map 仅一行要点。）