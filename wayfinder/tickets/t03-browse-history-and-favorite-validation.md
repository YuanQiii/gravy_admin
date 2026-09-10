# T03 · 浏览历史埋点接线与收藏/查询校验口径

label: `wayfinder:grilling`
status: open
blocked_by: none

## Question

两条客户行为 loop：

**A. 浏览历史写入（`recordView` 目前零调用点）**
- 触发点：在 mall 哪个浏览端点/服务埋点？（滤清器详情查看？catalog/brand/equipment 详情？）接口当前是否就在 mall 应用内可及，还是需新增浏览 action？
- 匿名 vs 登录：未登录浏览是否记录？（customerId 为空则跳过？）
- 幂等 upsert 语义确认（`visitedAt` 更新）。

**B. 收藏与列表的 filter 有效性校验**
- `createFavorite`：filter 不存在/已软删/未启用各返回什么？（沿用询价 line 的 `EQUIPMENT_FILTER_NOT_FOUND` 口径还是独立错误码？）
- filter "启用/可见" 判定口径：与浏览域 `B2C_VISIBILITIES` 是否一致？
- 历史/收藏**列表查询侧**是否也过滤已删/停用 filter（防列表中残留失效条目的兜底，见 map 的 Not yet specified），以何种代价（include+where 或二次过滤）。

## Resolution

（待关闭后记录；map 仅一行要点。）