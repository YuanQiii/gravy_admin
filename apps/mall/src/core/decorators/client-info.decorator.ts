import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { clientIpResolver } from '@gvray/core';

export interface ClientInfo {
  ip: string;
  userAgent: string;
}

/**
 * 提取当前请求的客户端信息（IP + User-Agent）。
 * IP 来源单一事实来源是 `@gvray/core` 的 `ClientIpResolver`（req.ip，
 * 受 `trust proxy` 配置约束）—— 不再自行读任何转发头。
 */
export const ClientInfo = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const request = ctx.switchToHttp().getRequest();
    const headers = request?.headers;
    return {
      ip: clientIpResolver.resolve(request),
      userAgent:
        typeof headers?.['user-agent'] === 'string'
          ? headers['user-agent']
          : '',
    };
  },
);
