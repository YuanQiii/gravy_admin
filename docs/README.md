# docs/ — 人向文档索引

本目录**只放面向人的文档**；给 agent 的按需规范摘要不在这里（在 [`.agents/project/`](../.agents/project/)，取用方式见 [AGENTS.md](../AGENTS.md) 的任务路由表）。两者轴不同：本目录按**读者需求**分，语料按**改动类型**分。

分组采用 [Diátaxis](https://diataxis.fr/) 四象限（学 / 做 / 查 / 懂）。

## tutorial —— 学（跟着走一遍）

本格暂时空着：入门由 [README](../README.md) 的「快速开始」与 [CONTRIBUTING](../CONTRIBUTING.md) 的本地启动承担。文档多到需要单独一篇手把手教程时，放这里。

## how-to —— 做（解决具体问题）

| 文档 | 什么时候看 |
| --- | --- |
| [deployment.md](deployment.md) | 要部署 / 起容器 / 排查部署问题时 —— 开发、测试生产、独立部署三套工作流的操作步骤 |

## reference —— 查（事实与契约）

| 文档 | 什么时候看 |
| --- | --- |
| [configs.md](configs.md) | 查某个配置项的作用与前后端关联时 |
| [response-format.md](response-format.md) | 查 API 统一响应结构与 `showType` 语义时 |

## explanation —— 懂（为什么是这样）

| 文档 | 什么时候看 |
| --- | --- |
| [project-structure.md](project-structure.md) | 想知道"为什么这么挂"而不是"挂了什么"时 |
| [adr/](adr/) | 想知道某个设计**为什么不是别的方案**、哪些方案被否决过 —— 改架构 / 数据模型 / 认证 / 部署前先看 |
| [experience/](experience/) | 复现异常、新开接口或架构改动前 —— 踩坑（`pitfalls/`）与工程模式（`patterns/`），只记"为什么 / 别踩" |

## 维护约定

- **一篇只进一格**：新增文档时按"读者是想学、想做、想查，还是想懂"落位；找不到格子说明它可能不该写成文档（应落在 skill / 测试 / 配置上）。
- **本文件是 `docs/` 的唯一索引**：不要再建第二个（同一份映射的第二副本必然漂移，实证见 [ADR 0017](adr/0017-constraint-docs-single-routing-table.md) 补充说明）。
- **不在阅读路径**：`openspec/changes/archive/`、`reports/`、`dist/`、`openapi/`、`logs/` 不是文档，不进本索引。
