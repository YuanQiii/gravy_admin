import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { resolveClientIp } from '@gvray/core';

export interface ClientInfo {
  ip: string;
  userAgent: string;
}

/**
 * 提取当前请求的客户端信息（IP + User-Agent），是 `resolveClientIp` 之上的薄 adapter。
 * IP 来源单一事实来源在 `@gvray/core` 的 `resolveClientIp`。
 */
export const ClientInfo = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientInfo => {
    const request = ctx.switchToHttp().getRequest();
    const headers = request?.headers;
    return {
      ip: resolveClientIp(headers),
      userAgent:
        typeof headers?.['user-agent'] === 'string'
          ? headers['user-agent']
          : '',
    };
  },
);