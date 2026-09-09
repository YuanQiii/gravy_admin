import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { REQUEST_ID_PROP } from './logging.constants';

/**
 * 当前请求关联 ID 访问器（accessor seam，非 adapter seam）
 *
 * 由 RequestIdMiddleware 负责写入 req[REQUEST_ID_PROP]，此处只负责读取。
 * 无 HTTP 上下文（定时任务/CLI）时返回 null。读取方不接触 pino 内部。
 */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & Record<string, unknown>>();
    const value = request?.[REQUEST_ID_PROP];
    return typeof value === 'string' && value.length > 0 ? value : null;
  },
);