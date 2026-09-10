## ADDED Requirements

### Requirement: 滤清器详情浏览历史记录

系统 SHALL 在滤清器子域的详情端点 `GET /filters/:id` 上，为已登录 B2C 客户记录滤清器浏览历史；匿名访客不记录。该历史记录为**副作用**，不改变端点既有的浏览过滤、排序与响应字段语义（`status = 'enabled' AND deletedAt IS NULL` 强制过滤、B2C 加权排序、与后台一致的响应字段集保持不变）。已登录客户 SHALL 由请求携带的客户 access token 识别；记录写入仅以本次成功返回的滤清器为对象。该端点 SHALL 仍对匿名访客开放且返回行为与现状一致。

#### Scenario: 已登录客户浏览滤清器详情写入历史

- **WHEN** 已登录 B2C 客户请求 `GET /filters/:id` 访问 `:id` 对应的一条有效滤清器
- **THEN** 系统返回该滤清器详情（过滤/排序/响应字段与现状一致），并写入一条该客户的浏览历史（幂等 `recordView`，重复浏览更新 `visitedAt`）

#### Scenario: 匿名访客浏览滤清器详情不写历史

- **WHEN** 未携带有效客户 access token 的访客请求 `GET /filters/:id`
- **THEN** 系统返回与现状一致的滤清器详情，且不写入任何浏览历史记录

#### Scenario: 已登录客户浏览失效滤清器详情不写历史

- **WHEN** 已登录客户请求 `GET /filters/:id`，`:id` 对应 `status = 'disabled'` 或已软删除的滤清器
- **THEN** 系统返回 404，且不写入任何浏览历史记录