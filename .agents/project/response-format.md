# 统一响应格式摘要

详细说明见 [../../docs/response-format.md](../../docs/response-format.md)（面向人的使用指南：响应 JSON 结构、组件清单、`ResponseUtil` 速查与代码示例）。
当前实现以 `packages/core/src/core/interceptors/response.interceptor.ts`、`packages/core/src/shared/utils/response.util.ts` 和 `packages/core/src/shared/interfaces/response.interface.ts` 为准。

## 核心约定

- 全局 `ResponseInterceptor` 自动包装 Controller 返回的业务数据；已含 `success/code/message/data/timestamp` 时不会重复包装。
- 自定义 message/code、分页或语义化响应用 `ResponseUtil`；分页键集固定为 `{ items, total, page, pageSize }`（字段语义与示例见 `docs/response-format.md`）。
- `@SkipResponseFormat()` 用于文件流等特殊响应。

## 默认包装语义

| Method | 默认方法 |
|--------|----------|
| `POST` | `ResponseUtil.created()` |
| `PUT` / `PATCH` | `ResponseUtil.updated()` |
| `DELETE` | `ResponseUtil.deleted()` |
| 其他 | `ResponseUtil.found()` |

## 错误展示类型

`HttpExceptionFilter` 根据状态码选择 `showType`：401/403/500/503→`NOTIFICATION`；400/422/409→`ERROR_MESSAGE`；404→`WARN_MESSAGE`。

## 修改响应格式时

1. 检查 `ResponseUtil`、`ResponseInterceptor`、`HttpExceptionFilter` 输出是否一致。
2. 同步 [../../docs/response-format.md](../../docs/response-format.md) 和相关 Swagger 响应示例。
