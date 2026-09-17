# equipment/brands/hot Specification

## Purpose
面向 B2C 首页运营位/品牌墙的"热门品牌"能力：由运营标记品牌并设定顺序，未标记时按有效设备数自动补足，最终以固定条数的公开列表对外展示，供运营在品牌集合层的强控制与平台内容质量的兜底兼顾。

## Requirements

### Requirement: 公开热门品牌列表

系统 SHALL 提供公开端点 `GET /equipment/brands/hot`（无需认证）返回固定条数的热门品牌列表。列表排序为：运营标记的品牌居前（按 `hotOrder` 升序，未设 `hotOrder` 的标记品牌靠后），未达上限时则按该品牌生效设备数降序补足未标记品牌，最终截取上限条数（默认 8，允许通过请求参数调整）。

热门列表中每个品牌 SHALL 仅返回 `status='enabled'` 且未软删的品牌。每条品牌 SHALL 附带其生效设备数。公开响应 SHALL 仅含品牌标识、名称与生效设备数字段，不含 `isHot`、`hotOrder` 等运营配置字段。
"生效设备数" SHALL 计为该品牌下未软删且 `status='enabled'` 的设备（`equipment.brandId` 指向该品牌）数量。未设 `hotOrder` 的标记品牌，其彼此相对顺序 SHALL 由生效设备数降序（再以入库时间兜底）决定，保证结果稳定。

参与排序与截取的**候选集**（即被取出的启用品牌集合）SHALL 受一个固定上限 `N` 约束（`N` 远大于展示条数上限，默认 200），该上限独立于请求条数参数 `limit`。候选集上限 `N` 仅约束被取出的品牌数量以控制系统资源占用；当 `N` 不小于请求展示上限时，对外返回的排序与条数结果 SHALL 与无上限候选集时完全一致，候选集上限不得改变任何既有的排序不变量或结果内容。

#### Scenario: 仅返回启用的热门品牌

- **WHEN** 请求 `GET /equipment/brands/hot`

- **THEN** 返回的品牌均 `status='enabled'` 且未软删

#### Scenario: 运营标记品牌排在未标记品牌之前

- **WHEN** 品牌 A 与品牌 B 均已启用，A 被标记为热门而 B 未被标记

- **THEN** A 在列表中位于 B 之前，即便 B 的生效设备数更高

#### Scenario: 标记品牌按 hotOrder 升序排列

- **WHEN** 多个品牌已被标记为热门且分别设置了 `hotOrder=1`、`hotOrder=2`

- **THEN** 列表按 `hotOrder` 升序返回（`hotOrder=1` 在前）

#### Scenario: 未设顺序的标记品牌按设备数兜底

- **WHEN** 两个标记品牌均未设置 `hotOrder`

- **THEN** 生效设备数较高的品牌在前；设备数相同时按入库时间较晚者在前

#### Scenario: 未到上限时按设备数补足未标记品牌

- **WHEN** 已启用且标记的品牌数少于请求条数上限

- **THEN** 列表补入未标记但生效设备数最高的品牌，直至达到上限

#### Scenario: 结果条数上限与参数微调

- **WHEN** 请求未传条数参数

- **THEN** 列表默认返回 8 条；传入条数参数时按该值截取

#### Scenario: 设备数只计生效设备

- **WHEN** 某品牌下存在软删设备与 `status='disabled'` 设备

- **THEN** 这些设备不计入该品牌的生效设备数，因而不会抬高其热门排序

#### Scenario: 响应附带设备数

- **WHEN** 请求 `GET /equipment/brands/hot`

- **THEN** 返回的每条品牌均包含其生效设备数字段

#### Scenario: 候选集受固定上限约束且不改变结果

- **WHEN** 启用品牌总数超过候选集上限 `N`，且 `N` 不小于请求展示上限

- **THEN** 系统仅取出至多 `N` 个候选品牌参与排序，且对外返回的列表排序与条数与"取出全部启用品牌"时完全一致（候选集上限仅影响资源占用，不改变对外行为）

### Requirement: 后台配置热门品牌

系统 SHALL 允许已授权管理员（具备 `equipment:hotBrand:update` 权限）为品牌设置/取消热门标记并设定排序顺序。热门配置 SHALL 通过专用端点 `POST /equipment/brands/hot-status` 提交，接收一组 `ids` 与 `isHot`（以及可选的 `hotOrder`）；该端点同时服务单条与批量操作。运行者转向品牌并设置为热门时，`isHot/hotOrder` 不得经普通品牌更新接口写入。

#### Scenario: 标记品牌为热门并设顺序

- **WHEN** 已授权管理员通过 `POST /equipment/brands/hot-status` 提交某品牌的 `isHot=true` 与 `hotOrder`

- **THEN** 该品牌的存储值被更新，并在热门列表中按序展现

#### Scenario: 单条与批量同端点

- **WHEN** 已授权管理员对该端点提交单个 `id` 或一组 `ids`

- **THEN** 单条以 `ids=[id]` 表达，行为一致；多 `ids` 一次写全部目标品牌

#### Scenario: 取消品牌热门标记

- **WHEN** 已授权管理员通过 `POST /equipment/brands/hot-status` 将某已标记品牌的 `isHot` 设为 `false`

- **THEN** 该品牌从热门列表的标记段移除，仅可能按生效设备数兜底出现在列表

#### Scenario: 无权用户不可配置热门

- **WHEN** 不具备 `equipment:hotBrand:update` 权限的用户调用 `POST /equipment/brands/hot-status`

- **THEN** 请求被拒绝，不产生任何热门配置变更

#### Scenario: 普通品牌更新不可改动热门字段

- **WHEN** 调用品牌普通更新接口（`PATCH /equipment/brands/:id`）

- **THEN** 该接口不接收也不改动 `isHot`/`hotOrder`，热门字段仅经 `hot-status` 端点维护

### Requirement: 热门品牌配置的只读权限

系统 SHALL 提供 `equipment:hotBrand:view` 权限供后台查询热门品牌配置状态。具备该权限者可读取品牌的热门标记与顺序信息。热门状态字段（`isHot`、`hotOrder`）SHALL 承载于后台品牌响应（品牌列表与详情）中一并返回。

#### Scenario: 具备只读权限者可查看热门状态

- **WHEN** 具备 `equipment:hotBrand:view` 权限的用户查询品牌列表/详情

- **THEN** 返回中包含 `isHot`、`hotOrder` 字段

#### Scenario: 更新权限不要求只读权限

- **WHEN** 用户仅具备 `equipment:hotBrand:update` 而无 `view`

- **THEN** 该用户仍可配置热门标记（更新行为不依赖只读权限）
