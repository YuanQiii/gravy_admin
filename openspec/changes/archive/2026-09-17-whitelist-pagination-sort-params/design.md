## Context

共享分页排序基类 `PaginationSortDto`（`packages/core/src/shared/dtos/pagination.dto.ts:78-106`）被 `b2c`/`customer`/`inquiry`/`equipment`/`rbac` 共 **16** 个源 DTO 继承（见 proposal.md Impact 清单），是全部列表端点排序入参的唯一继承点。`sortBy` 为无约束 `string`，`sortOrder` 仅有 `@IsOptional()`，二者经 `BaseService.paginateWithSort` → `getOrderBy`（`base.service.ts:223-241`）原样进入 Prisma `orderBy`。非法值触发 Prisma 异常，被 `HttpExceptionFilter` 的「非 `HttpException`」分支（`http-exception.filter.ts:50-52`）以 500 + 原样 message 回显。`ValidationPipe` 现状（`configure-app.ts:51-58`）已启用 `whitelist/transform/forbidNonWhitelisted`，但 `sortBy`/`sortOrder` 是已知装饰属性，不会被剥离，且缺少 `@IsIn`/`@Validate` 故非法值直接透传。

## Goals / Non-Goals

**Goals:**
- 在共享基类上以最小样板为全部列表端点补上 `sortBy`/`sortOrder` 白名单校验，非法值统一收敛为 400。
- 保证 B2C 浏览「加权排序忽略 `sortBy`」的既有语义不被破坏（`filters.service.ts:127-139`）。

**Non-Goals:**
- 不改动 `HttpExceptionFilter` 的「非 `HttpException`」分支（见下方拆分说明，列为独立后续变更）。
- 不为每个域重复编写 `@IsIn([...])` 样板。
- 不改 `ValidationPipe` 配置（已具备将校验失败转为 400 的能力）。

## Decisions

**D1 — 白名单落在共享基类 `PaginationSortDto`，而非每个域 DTO 各自 `@IsIn`。**
理由：基类是 16 个列表 DTO 的唯一继承点，约束放在此处可一处修复、全局生效，避免跨 5 个能力域重复样板与校验逻辑漂移。备选否决：① 每域 `@IsIn` —— 需在 16 个文件各写一份校验与字段清单，易随新增 DTO 漏配、难以统一维护；② 仅在 `getOrderBy`/`paginateWithSort` 里做运行时校验 —— 校验时机过晚（已在 Service 层），无法产出 400 语义，且把契约校验混入业务逻辑。故采用「基类 + 可覆盖白名单字段」机制。

**D2 — 机制：基类声明可覆盖字段 `allowedSortBy: string[]`（默认 `['createdAt','updatedAt']`），`sortBy` 挂排序白名单校验；每个域 DTO 用一行 `allowedSortBy = [...]` 覆盖列表。（采纳 D9 后首选声明式 `@SortWhitelist(['field',...])` 装饰器，白名单闭包捕获、校验器自包含；详见 D9。）**
理由：一份校验逻辑服务所有域，域只需声明字段清单，校验策略集中在 `@gvray/core`。校验对未提供的 `sortBy`（`@IsOptional`）放行，由 `getOrderBy` 回退默认（默认来源见 D7）。备选否决：把白名单硬编进基类（`protected abstract`）会强制每个子类实现方法，样板更重；当前字段覆盖方案最轻。

**D3 — `sortOrder` 直接在基类补 `@IsIn(['asc','desc'])`。**
理由：方向枚举与域无关，可无差别地放在基类，零域样板。这单独将 `?sortOrder=DROP` 由 500 收敛为 400。

**D4 — 拆分 (a) 与 (b)：本变更只做 DTO 白名单（a），`HttpExceptionFilter` 响应收敛（b）列为 Non-Goal。**
理由：二者根因不同 —— (a) 是请求契约缺失（应在 DTO/校验层解决，400 语义），(b) 是错误响应泄密面（应在过滤器/日志能力解决）。它们独立可发布、独立可测试、改动文件不相交（(a) 改 `pagination.dto.ts`+16 DTO，(b) 改 `http-exception.filter.ts`）。合并会模糊所有权与回滚边界。建议 (b) 的独立变更名：`converge-non-http-exception-response`（归属 `logging` 能力）。

**D5 — B2C 浏览 DTO 的白名单须含 `sortOrder`（加权排序列），以保留「`?sortBy=sortOrder` 被忽略」场景。**
理由：`filters.service.ts` 在 B2C 可见性下忽略 `sortBy` 走加权排序；但校验在控制器入参阶段已执行，若 `sortOrder` 不在白名单则会 400，破坏既有 `b2c/browse`「加权排序生效」场景。将 `sortOrder` 纳入浏览 DTO 白名单后，校验通过、Service 仍忽略该值，语义不变。

**D6 — `getOrderBy` 的回退 `defaultSortBy` 必须落在对应域 `allowedSortBy` 内。**
理由：`sortBy` 省略时 `getOrderBy` 用 `defaultSortBy`（默认 `createdAt`）；若 `defaultSortBy` 不在白名单，校验虽放行省略值，但回退字段本身应始终合法。实现任务需核对每个 `paginateWithSort(..., 'xxx')` 调用的 `defaultSortBy` ∈ 该 DTO `allowedSortBy`。

**D7 —（采纳架构审查候选 1 · Strong）默认排序字段由 DTO 白名单派生，而非 Service 独立字符串参数。**
理由：原 D6 标记的脆弱点——`paginateWithSort(model, query, where, include, defaultSortBy)` 的 `defaultSortBy` 与 DTO 的 `allowedSortBy` 须手动同步——根因是排序契约被拆成两块（白名单在 DTO、回退在 Service）。采纳后，`getOrderBy`/`paginateWithSort` 的回退取自 `allowedSortBy` 中的主字段（如首项），DTO 同时持有白名单与默认，成为唯一真相源。这消除了跨 module 同步义务，并把 16 个 call site 的默认排序合法性收拢到一处。备选否决：保留独立 `defaultSortBy` 参数——省去改调用点，但把 drift 风险永久留在两 module 之间。

**D8 —（采纳架构审查候选 2 · Worth exploring）删除孤儿 `SortDto`。**
理由：grep 确认 `packages/core/src/shared/dtos/pagination.dto.ts:57-73` 的 `SortDto` 无继承者、源中无类型引用，属浅重复 module；删除测试通过（删除只移动、不浓缩复杂度）。采纳后排序形状仅余 `PaginationSortDto` 一处，杜绝两份 `sortBy`/`sortOrder` 形状漂移。若后续发现确有类型使用，则将其契约折入 `PaginationSortDto` 而非保留重复。

**D9 —（采纳架构审查候选 3 · Speculative）以声明式 `@SortWhitelist(['field',...])` 装饰器取代实例字段耦合。**
理由：原 D2 机制中 `IsAllowedSortBy` 在运行时读 `args.object.allowedSortBy`，校验器越过 seam 探入 DTO 实例，且依赖 `transform:true` 实例化子类（原 Risk 已标记）。采纳装饰器后，白名单在声明时闭包捕获、直接传给校验器，校验器自包含，seam 收紧，去除 transform 时机依赖。该候选强度为 Speculative，但因用户已预授权采纳推荐项，规划件按此落地；若实现评估成本过高可回退至 D2 的实例字段方案，二者对外行为一致。

## Risks / Trade-offs

- **[Risk] 某域白名单列漏真实可排字段 → 合法客户端被 400。** → Mitigation：实现阶段按各 Service 实际传入的 `defaultSortBy` 与 Prisma 模型字段逐域列出 `allowedSortBy`，并补端到端用例覆盖默认排序字段。
- **[Risk] 校验器与白名单的耦合方式。** → Mitigation：优先采用 D9 的声明式 `@SortWhitelist` 装饰器（白名单闭包捕获、校验器自包含，无实例字段依赖）；若实现回退至 D2 实例字段方案，`ValidationPipe` 已 `transform:true`（`configure-app.ts:55`）保证子类字段初始化器随实例存在，单测覆盖一个子类断言校验器读到覆盖值。
- **[Risk] 既有客户端依赖「任意 sortBy 被静默接受」。** → Mitigation：仅非法值变 400，合法值行为不变；属安全加固，影响面限于构造非法请求的调用方（多为攻击/误用）。
- **[Trade-off] 白名单需随模型字段演进维护**，换取杜绝 500 + 信息泄露的确定性收益。

## Migration Plan

1. 在 `@gvray/core` 增 `IsAllowedSortBy` 校验器与基类 `allowedSortBy`/`sortOrder @IsIn`。
2. 逐个域 DTO 覆盖 `allowedSortBy`（含 B2C 浏览的 `sortOrder`）。
3. 验证 `defaultSortBy` ∈ 白名单。
回滚：revert DTO 改动即可，无数据迁移、无其他依赖。

## Open Questions

（无 —— 上述决策均可在实现内确定，不改变规格或任务拆分。）
