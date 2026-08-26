# AI 开发指南

GVRAY Admin 内置 **AI-Ready** 开发体验，提供 `AGENTS.md` 与模块化 AI 文档，使 TRAE、Claude Code、Cursor 等 AI 编程助手能快速理解项目架构、编码规范和业务模块，生成符合项目规范的代码。

与传统后台模板不同，本项目为 AI 助手提供了结构化的上下文，避免默认加载过多文档导致信息过载。

## 文档体系

| 文件/目录 | 用途 |
|:---|:---|
| [`AGENTS.md`](../AGENTS.md) | AI 编程助手自动加载入口，只保留项目硬规则和按需索引 |
| [`.agents/project/`](../.agents/project/) | AI 助手按需知识库，包含工作流、架构、DTO、权限、响应格式等细分说明 |

## 按需阅读索引

| 主题 | 文档路径 |
|:---|:---|
| DTO / Swagger 规范 | [`.agents/project/dto-swagger.md`](../.agents/project/dto-swagger.md) |
| 权限码 / 权限扫描 | [`.agents/project/permissions.md`](../.agents/project/permissions.md) |
| 统一响应格式 | [`.agents/project/response-format.md`](../.agents/project/response-format.md) |
| 配置项或 seed 配置 | [`.agents/project/configs.md`](../.agents/project/configs.md) |
| 部署、Docker、环境变量 | [`.agents/project/deployment.md`](../.agents/project/deployment.md) |
| 密码/日志/审计/安全策略 | [`.agents/project/coding.md`](../.agents/project/coding.md) |
| 新增/重构业务模块 | [`.agents/project/architecture.md`](../.agents/project/architecture.md) |
| 工作流和上下文策略 | [`.agents/project/workflow.md`](../.agents/project/workflow.md) |

## 使用建议

使用 AI 编程时：

1. 先让助手读取相关模块文件
2. 涉及 DTO、权限、响应格式、配置或部署时，再按需读取 `.agents/project/` 下对应文档
3. 文档与源码冲突时以源码为准
