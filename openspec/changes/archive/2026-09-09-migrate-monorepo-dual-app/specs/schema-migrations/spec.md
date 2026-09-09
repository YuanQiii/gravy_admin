# schema-migrations Delta

## MODIFIED Requirements

### Requirement: 生产环境 schema 同步仅应用已提交迁移

生产环境下的数据库 schema 同步 SHALL 只运行 `prisma migrate deploy`（仅应用已提交的迁移），不受 `db push` 影响。schema 同步 SHALL 仅由 Admin 应用的容器入口执行：`prisma/migrations` 目录与 `schema.prisma` 归共享内核包单一所有，Mall 应用容器 SHALL 不执行任何 schema 同步（既不运行 `migrate deploy`，也不以任何其他方式修改 schema）。当 Admin 应用容器启动时 `prisma/migrations/` 目录缺失或为空，程序 SHALL 以非零状态码退出并输出明确的错误信息，绝不回退到 `prisma db push`。

#### Scenario: 生产启动时应用迁移

- **WHEN** Admin 应用在生产环境以标准流程启动，且存在一组已提交的迁移
- **THEN** 程序在启动前对该数据库执行 `prisma migrate deploy`，仅有未应用的迁移被执行，已应用的迁移被跳过

#### Scenario: Mall 容器不执行 schema 同步

- **WHEN** Mall 应用容器在生产环境以标准流程启动
- **THEN** 该容器不执行 `migrate deploy` 或任何 schema 变更操作，应用直接进入服务状态

#### Scenario: 缺失迁移目录时即失败

- **WHEN** Admin 应用在生产环境启动，但 `prisma/migrations/` 目录不存在或为空
- **THEN** 程序不进行任何 schema 变更、以非零退出码终止，并在日志中输出提示开发者先建立迁移基线的明确信息

#### Scenario: 生产绝不使用 db push

- **WHEN** 任一应用在生产环境启动或运行
- **THEN** 程序不执行 `prisma db push`，也不以任何带 `--accept-data-loss` 的方式修改 schema
