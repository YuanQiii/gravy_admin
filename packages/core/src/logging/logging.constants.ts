/**
 * src/logging 深模块内部常量
 *
 * 该模块是「记录这次请求」的唯一 owner：日志初始化、corr-id、redact、
 * 以及成功/慢/失败三分支访问日志都收敛在此。外部只暴露一个对齐 Nest Logger
 * 的薄签名与 @RequestId() 访问器。
 */

/** 请求关联 ID 头名（不暴露 pino 内部给外部读取方） */
export const DEFAULT_REQUEST_ID_HEADER = 'x-request-id';

/** 写入 req 对象的关联 ID 属性名（稳定命名约定，operation-log 依此读取） */
export const REQUEST_ID_PROP = 'id';

/** 慢请求阈值默认值（毫秒） */
export const DEFAULT_SLOW_MS = 1000;