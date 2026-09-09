## Purpose

为系统提供迁移驱动的数据库 schema 变更管理：生产环境只允许应用已提交的迁移、缺失迁移时显式失败而不是退化为不可回滚的 `db push`，同时保证既有数据的库可建立可靠基线、全新环境可完整重建 schema。

## ADDED Requirements

### Requirement: 生产环境 schema 同步仅应用已提交迁移

生产环境下的数据库 schema 同步 SHALL 只运行 `prisma migrate deploy`（仅应用已提交的迁移），不受 `db push` 影响。当容器启动时 `prisma/migrations/` 目录缺失或为空，程序 SHALL 以非零状态码退出并输出明确的错误信息，绝不回退到 `prisma db push`。

#### Scenario: 生产启动时应用迁移

- **WHEN** 应用在生产环境以标准流程启动，且存在一组已提交的迁移

- **THEN** 程序在启动前对该数据库执行 `prisma migrate deploy`，仅有未应用的迁移被执行，已应用的迁移被跳过

#### Scenario: 缺失迁移目录时即失败

- **WHEN** 应用在生产环境启动，但 `prisma/migrations/` 目录不存在或为空

- **THEN** 程序不进行任何 schema 变更、不以非零退出码终止，并在日志中输出提示开发者先建立迁移基线的明确信息

#### Scenario: 生产绝不使用 db push

- **WHEN** 应用在生产环境发生 schema 同步

- **THEN** 程序不执行 `prisma db push`，也不以任何带 `--accept-data-loss` 的方式修改 schema

### Requirement: 可建立在既有数据上的迁移基线

系统 SHALL 提供一次性基线流程，把已存在数据的生产库在不清空数据的前提下接入迁移历史：以「线上库与 schema.prisma 的 diff 为空」作为提交闸门，用空库到完整 schema 的全量 CREATE 脚本生成 `migrations/0_init/`，并在现有生产库上经 `prisma migrate resolve --applied` 将其标记为已应用。基线迁移文件 SHALL 提交进 git。

#### Scenario: 线上库无漂移时建立基线

- **WHEN** 一次性基线流程运行，且线上库现状态与 `schema.prisma` 的 diff 为空

- **THEN** 生成全量的初始迁移文件（`migration.sql` + `migration.lock`）并提交进 git，现有生产库被标记为该迁移已应用，无需执行迁移 SQL 或重置数据

#### Scenario: 线上库有漂移时阻止建立基线

- **WHEN** 一次性基线流程运行，且线上库现状态与 `schema.prisma` 的 diff 非空

- **THEN** 流程报告漂移差异并中止，不生成基线，等待漂移被修正后再重新运行

#### Scenario: 漂移校验无法连接数据库

- **WHEN** 一次性基线流程运行，且漂移校验命令自身运行失败（如数据库不可达）

- **THEN** 流程以硬错误终止，并明确区分「校验失败」与「存在漂移」两种结果，不把连接错误当作漂移差异报告

#### Scenario: 全新环境从基线完整重建

- **WHEN** 对一个空数据库执行 `prisma migrate deploy`

- **THEN** 初始基线迁移被执行，从零建成符合 `schema.prisma` 的完整 schema

### Requirement: 开发环境经 migrate dev 生成并应用迁移

开发环境的 schema 变更 SHALL 通过 `prisma migrate dev` 生成迁移并应用，使迁移历史成为 schema 变更的唯一来源。破坏性的 `db:reset` 工具 SHALL 保留用于彻底重置本地数据库。

#### Scenario: 开发者生成迁移

- **WHEN** 开发者在本地修改 `schema.prisma` 后运行迁移生成命令

- **THEN** 生成与变更对应的新迁移文件，并将其应用到开发库

#### Scenario: 惰性 db push 不再作为开发同步路径

- **WHEN** 开发者在开发环境改变 schema

- **THEN** 日常 schema 同步不依赖 `prisma db push`；`db push` 仅留在破坏性重置工具中

### Requirement: 运行镜像不携带一次性迁移产物

构建进入运行镜像的 `prisma/` 内容 SHALL 只包含迁移目录本身（白名单），排除一次性历史迁移产物（如 `prisma/scripts/` 下的原始数据迁移 SQL 与 `prisma/backups/` 下的数据库备份），使其不进入生产镜像，也不进入 `prisma migrate deploy` 的迁移链。`prisma/` 下新增的任何其他子目录 SHALL 默认不进入运行镜像。

#### Scenario: 构建镜像时排除一次性产物

- **WHEN** 构建生产运行镜像

- **THEN** `prisma/scripts/` 与 `prisma/backups/` 的内容不被复制进镜像

#### Scenario: 新增子目录默认不进镜像

- **WHEN** `prisma/` 下出现新的子目录且未显式加入镜像白名单

- **THEN** 运行镜像不包含该目录（镜像内 `prisma/` 仅含显式白名单的内容：迁移目录与运行必需的 `schema.prisma`）

#### Scenario: 迁移链不包含一次性数据迁移

- **WHEN** 执行 `prisma migrate deploy` 或 `prisma migrate dev`

- **THEN** 一次性数据迁移 SQL 不作为一个待执行或被纳入历史表的迁移

### Requirement: 提供迁移工具脚本

系统 SHALL 在脚本配置中提供生成、部署与建立基线的迁移命令，便于开发者以一致方式执行上述流程。

#### Scenario: 运行部署命令

- **WHEN** 开发者/运维运行迁移部署脚本

- **THEN** 该脚本执行 `prisma migrate deploy`，仅应用已提交且未应用迁移

#### Scenario: 运行基线命令

- **WHEN** 开发者/运维运行基线脚本

- **THEN** 该脚本执行「线上库漂移校验 → 生成全量初始迁移 → （对既有库）标记已应用」的一次性流程