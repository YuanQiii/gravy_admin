# ADR 0010: Monorepo 双应用（apps/admin + apps/mall）+ 共享内核

- 状态：已接受

- 日期：2026-09-09

- 关联：ADR 0002（独立 Customer 模型）、ADR 0005（匿名访问与 VisibilityOpts 三分流；其 `b2c/` 路由前缀决策被本 ADR 决策 10 supersede）、ADR 0009（B2C Customer JWT 认证域；其 `authenticateByRealm` 缓做触发条件由决策 12 重述）

## 背景

单 NestJS 进程（`gvray-admin-app` 单容器、单端口、单 Swagger）同时承载两个消费域：**Admin**（运营端：RBAC、Equipment/Inquiry/Customer 数据代管、系统管理）与 **B2C 商城端**（`src/modules/b2c/` 的 browse/inquiries/addresses + `src/modules/customer/` 的 customer-auth/customer-activity）。

耦合痛点（经架构评审确认）：

1. **部署与爆炸半径共享**：任一端发版即另一端重启；限流预算按进程而非按域核算（全局 1000 req/min 与两端共享）。
2. **模块图耦合**：`BrowseModule` 整图 import 后台 `EquipmentModule` 等 5 个领域 Module——admin 侧全部 provider（含 admin 专用查询方法）对 mall 端可见，"B2C 依赖 admin、反向禁止"只是约定而非物理结构。
3. **目录混居**：`src/modules/customer/` 混四种关注点（admin 代管 customers/addresses + mall 自助 customer-auth/customer-activity）；mall 代码散落 `b2c/`、`customer/`、`core/` 三处。
4. **横切语义污染**：mall 匿名请求每请求空穿 FeatureFlagGuard（查 admin 配置表）、OperationLogInterceptor（写 admin 审计表）。

ADR 0009 已预言「阶段二独立商城服务」。本 ADR 把演进落定为**仓库内 Monorepo 双应用 + 共享内核**，而非立即拆仓。

## 决策

1. **裸 pnpm workspace**：`apps/` + `packages/` 目录，各包独立 `package.json`。**不用** nest-cli monorepo mode（`libs/` 多 project 模式）——被 nest-cli project 生命周期绑架，docker 多阶段构建、独立发版、未来拆仓都要跟它的约定搏斗。
2. **命名收敛**：商城端应用命名 `apps/mall`（对应 `MallModule`、`MALL_OPTS`）。CONTEXT.md 已禁用 `b2c` 作为应用/模块名——它是商业模式形容词（描述卖给谁），不是应用名（描述这是什么）。
3. **领域 Service 平移共享**：equipment 五件套（equipment/filters/catalogs/brands/filter-types）+ inquiry 的 Service/DTO 上提 `packages/domain`；**VisibilityOpts 三分流 seam（ADR 0005 增补）原样随行，不推翻**。**发散即拆触发条件**：mall 出现第一个与「浏览可见性」无关的独立需求（如购物车、订单）时，该需求直接在 mall 自建 module，不进 domain 包。
4. **Prisma 单一所有权**：`schema.prisma` + `prisma/migrations` + PrismaService 全部归 `@gvray/core`，两 app 禁止各自 generate；`migrate deploy`（db-bootstrap，ADR 0007）只随 admin 镜像入口执行，mall 容器永不碰 migration——防双容器启动竞争。
5. **双镜像双容器**：`gvray-admin` / `gvray-mall` 各自 Dockerfile、compose service、端口。拆分目的就是隔离，单镜像双进程是半吊子。
6. **两包共享内核**：`@gvray/core`（prisma+schema/migrations、redis、SessionStore、JwtService、logging、Response/Exception、SoftDelete、BaseService、constants/utils）+ `@gvray/domain`（equipment + inquiry 领域）。分界线是**变更节奏**：core 随基础设施演进（季度级），domain 随业务漂移（周级）。DAG：`apps → {core, domain}`、`domain → core`。否决单包（god package，改一行加权排序也 bump 基础设施版本）与七包细粒度（2 人团队负杠杆）；domain 出现第 3 个部署节奏不同的子域时按域再拆。
7. **providers-only 包**：包只导出 Nest Module（services + DTOs，无 controllers）；controller 是两端各自的**薄 adapter**——路由前缀、guard 组合、Throttle 预算、Swagger 分组是端特定关注点，归端不归包。与现有代码形态一致（BrowseModule import 领域 Module 拿 Service，controller 在 b2c 侧），平移零重写。
8. **无 customer 共享包（非目标清单）**：admin 代管（customers/addresses custody）与 mall 自助（auth/activity/addresses-self）各留各家——已核两端 customer 相关**零共享 service 代码**（`setAsDefaultInTx` 是 mall 侧私有），合并是空接缝且违背 ADR 0002 两种信任维度的立论。SessionStore + JwtService 入 core；`CustomerJwtStrategy`/`CustomerJwtGuard`/`@CurrentCustomer()` 归 mall，`jwt.strategy`/`JwtAuthGuard`/`PermissionsGuard` 归 admin。
9. **源码直连消费**：apps 的 tsconfig paths 把 `@gvray/*` 指向 `packages/*/src`，包源码进 app 同一次编译（现有构建已验证别名→相对路径重写机制）。代价：公共 rootDir 上移后 dist 结构变为 `dist/apps/... + dist/packages/...`，启动命令与 Dockerfile 相应调整。否决预构建包（独立 tsc 编排 + dev watch 痛点）。升级触发：出现第三个消费方（CLI/worker）或需版本冻结。
10. **路由前缀全剥**（supersede ADR 0005 的 `b2c/` 前缀增补）：mall app 路由 `b2c/filters` → `/filters`、`customer/auth` → `/auth`、`customer/favorites` → `/favorites`、`customer/history` → `/history`，依此类推——资源名即路径，端口即命名空间。窗口依据：mall 前端尚在建设期（browsing history 的 HTTP 集成尚未做），ADR 0005 supersede 已有路由迁移先例，等前端全面对接后成本翻倍。**BREAKING**：现有 mall 调用点需同版本更新。
11. **横切按端挂载**：mall = RequestLogInterceptor（pino）/ResponseInterceptor/HttpExceptionFilter/ThrottlerGuard（独立预算，公开浏览 60/min 不变）；admin 另加 OperationLogInterceptor（DB 审计）、FeatureFlagGuard、JwtAuthGuard/RolesGuard/PermissionsGuard。`public/runtime-config` 归 **admin**（服务 admin 前端初始化，消费 admin system 域的 ConfigsService）；mall 将来需要运行时配置时自建薄 controller，届时（两个消费者出现时）再议 ConfigsService 上提。
12. **认证不收敛，只补显式校验**：搬家时给 admin `jwt.strategy` 补 `realm === 'user'` 显式断言——关闭 ADR 0009 标注的安全项（后台侧拒绝 customer token 靠「恰好缺 roleKeys」的巧合防线）。`authenticateByRealm` **维持缓做**：两 strategy 无真实共享行为（user 查 roleKeys/status，customer 查 realm），拆分后分居两 app，core 里建深接缝会重新耦合两域；JwtService 已覆盖真实共享部分（签发/验签）。触发条件重述：第三个 realm 出现（如微信小程序态）或两 strategy 产生真实共享行为。
13. **六步迁移路径**（每步结束 `pnpm test` + 两端启动冒烟，各自可提交可回滚，`git mv` 保 blame 链）：① `pnpm-workspace.yaml` + 根 package.json 重构（纯构建层，代码不动）② `packages/core` 平移（`src/{core,shared,prisma,logging,redis}` + SessionStore/JwtService）③ `packages/domain` 平移（equipment 五件套 + inquiry Service/DTO，VisibilityOpts seam 随行）④ `apps/admin` + `apps/mall` 拆壳（admin 吃剩余模块，mall 吃 b2c + customer-auth + customer-activity；admin jwt.strategy 补 realm 断言）⑤ 构建与 dist 重构（别名延伸、启动命令修正）⑥ Docker/compose 双镜像双 service（migrate deploy 只挂 admin 入口，测试 compose 同步）。
14. **每 app 独立 .env**：`apps/admin/.env.*`、`apps/mall/.env.*`，本地连接串重复两行可接受；生产环境变量由部署平台注入（12-factor）。
15. **根 jest 统一配置**：rootDir 上移仓库根，testRegex 不变，moduleNameMapper 加 `@gvray/*` 映射——spec 零搬迁一条命令全跑。否决每包独立 jest + turbo 编排（2 人团队配 3 套 jest config 是负杠杆）。升级触发同决策 9。

## 备选方案（已否决）

- **nest-cli monorepo mode**：构建统一但被 project 生命周期绑架；docker 多阶段、独立发版、拆仓返工。

- **单镜像双进程**：省构建但爆炸半径没隔离，依赖升级互相绑架。

- **mall 自立门户复制领域逻辑**：加权排序 + 可见性 + 单源 filter seam 两处维护；deletion test 不过（删共享实现，复杂度在两端重写）。

- **`@gvray/customer-domain`** **共享包**：空接缝（两端零共享 service 代码），且违背 ADR 0002。

- **`authenticateByRealm`** **转正**：两 adapter 分居两 app 后，core 里的接缝重新耦合两域；为不存在的共享行为付耦合税。安全价值由「admin 侧显式 realm 断言」吸收。

- **路由前缀保留** **`b2c/*`** **+** **`customer/*`**：零破坏，但废弃词汇按 CONTEXT.md 已成违禁词，且单 app 两套前缀混用永续存在。

## 后果

正面：

- 两端变更/发版/回滚互不相扰（locality）。

- 限流/审计/日志预算按端独立核算；mall 匿名流量不再触发 admin 域查询与审计写。

- 「mall 依赖 admin、反向禁止」从约定升级为物理结构（apps 之间零 import）。

- Swagger 按端一份，路由不再混杂。

- ADR 0009 阶段二（拆独立仓）时 `apps/mall` 是零成本平移。

负面/风险：

- 共享包发版触发双镜像重建，CI 变重。

- dist 结构变化波及 `entrypoint.sh` / `start:admin`、`start:mall` 路径（注意：entrypoint 必须 LF；迁移步骤 ⑥ 需回归容器冒烟，记忆中有 CRLF→exit 127 先例）。

- 路由剥前缀是 BREAKING：mall 调用点需同版本更新（同 ADR 0005 supersede 先例）。

- admin jwt.strategy 补 realm 断言后须回归「customer token 打 admin 路由 401」用例。

- 两份本地 .env 连接串重复，改口令要改两处（接受）。

- mall 与 admin 仍共享同一 DB 与 Redis——本 ADR 拆进程不拆数据；数据级拆分留待商城域出现独立写模型需求时另立 ADR。

## 参考

- CONTEXT.md 词条 `Admin` / `Mall` / `Anonymous Visitor`（应用命名定案）

- ADR 0005（VisibilityOpts 三分流与加权排序**保留**；`b2c/` 路由前缀被本 ADR 决策 10 supersede）

- ADR 0009（SessionStore 深接缝随 core 迁移；「authenticateByRealm 缓做」触发条件由决策 12 重述）

- 架构评审报告（5 候选 deepening：工作区拆分 / 领域包化 / 认证收敛 / customer 拆家 / 横切裁剪）

