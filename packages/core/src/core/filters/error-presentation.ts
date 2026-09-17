import { HttpException, HttpStatus } from '@nestjs/common';
import {
  ResponseCode,
  ErrorShowType,
} from '../../shared/interfaces/response.interface';

/** 「异常 → 对外展示」的纯决策结果。 */
export interface ErrorPresentation {
  /** 业务/HTTP 状态码（含业务码 → HTTP 的映射前值）。 */
  status: number;
  /** 对外 message：生产环境对非预期异常泛化，其余为业务契约。 */
  message: string;
  showType: ErrorShowType;
}

const GENERIC_SERVER_ERROR = '服务器内部错误';

/**
 * 异常分类、message 提取与环境收敛、showType 映射、业务码 → HTTP 状态映射
 * ——四件规则的单点（whitelist-pagination 同型收口：filter 退化为薄适配器）。
 *
 * **纯函数**：不起 HTTP、不读环境，`isProduction` 由调用方注入 —— 全部规则
 * 可在无 HTTP 的单测中穷举。
 *
 * **边界（决策 4）**：`HttpException` 分支的 message 是业务契约（如
 * `INQUIRY_NOT_FOUND`），逐字保留，任何环境下都**不**泛化；环境收敛只作用于
 * 「非 `HttpException`」的非预期异常 —— 那类异常的原始 message 可能含内部
 * 字段名/查询片段，生产环境一律替换为泛化文案（细节仅进访问日志，由
 * `RequestLogInterceptor` 唯一记录，本函数不负责日志）。
 */
export function resolveErrorPresentation(
  exception: unknown,
  options: { isProduction: boolean },
): ErrorPresentation {
  let status: number;
  let message: string;

  if (exception instanceof HttpException) {
    status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObj = exceptionResponse as Record<string, unknown>;
      message =
        (responseObj.message as string) ||
        (responseObj.error as string) ||
        exception.message;

      // 如果是验证错误，聚合详细信息到message中
      if (Array.isArray(responseObj.message)) {
        message = `请求参数错误: ${(responseObj.message as string[]).join(', ')}`;
      }
    } else {
      message = exception.message;
    }
  } else if (exception instanceof Error) {
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    // 非预期异常：生产环境不回显原始 message（可能含内部信息），
    // 泛化文案 + 响应头 x-request-id 关联日志；非生产保留原文便于调试。
    message =
      options.isProduction && exception.message
        ? GENERIC_SERVER_ERROR
        : exception.message || GENERIC_SERVER_ERROR;
  } else {
    status = HttpStatus.INTERNAL_SERVER_ERROR;
    message = '未知错误';
  }

  return { status, message, showType: getShowType(status) };
}

/** @returns HTTP 状态码（业务状态码 → HTTP 映射） */
export function toHttpStatus(code: number): number {
  // 如果是标准HTTP状态码，直接返回
  if (code >= 100 && code < 600) {
    return code;
  }

  // 根据业务状态码映射HTTP状态码
  switch (code) {
    case ResponseCode.SUCCESS:
    case ResponseCode.CREATED:
    case ResponseCode.NO_CONTENT:
      return HttpStatus.OK;
    case ResponseCode.BAD_REQUEST:
      return HttpStatus.BAD_REQUEST;
    case ResponseCode.UNAUTHORIZED:
      return HttpStatus.UNAUTHORIZED;
    case ResponseCode.FORBIDDEN:
      return HttpStatus.FORBIDDEN;
    case ResponseCode.NOT_FOUND:
      return HttpStatus.NOT_FOUND;
    case ResponseCode.METHOD_NOT_ALLOWED:
      return HttpStatus.METHOD_NOT_ALLOWED;
    case ResponseCode.CONFLICT:
      return HttpStatus.CONFLICT;
    case ResponseCode.INTERNAL_SERVER_ERROR:
      return HttpStatus.INTERNAL_SERVER_ERROR;
    case ResponseCode.SERVICE_UNAVAILABLE:
      return HttpStatus.SERVICE_UNAVAILABLE;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/** @returns 错误展示类型 */
function getShowType(code: number): ErrorShowType {
  switch (code) {
    // 认证/授权相关 - 使用通知提醒
    case HttpStatus.UNAUTHORIZED:
    case HttpStatus.FORBIDDEN:
      return ErrorShowType.NOTIFICATION;

    // 验证错误 - 使用错误消息提示
    case HttpStatus.BAD_REQUEST:
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorShowType.ERROR_MESSAGE;

    // 资源不存在 - 使用警告消息
    case HttpStatus.NOT_FOUND:
      return ErrorShowType.WARN_MESSAGE;

    // 冲突 - 使用错误消息提示
    case HttpStatus.CONFLICT:
      return ErrorShowType.ERROR_MESSAGE;

    // 服务器错误 - 使用通知提醒
    case HttpStatus.INTERNAL_SERVER_ERROR:
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ErrorShowType.NOTIFICATION;

    // 默认使用错误消息提示
    default:
      return ErrorShowType.ERROR_MESSAGE;
  }
}
