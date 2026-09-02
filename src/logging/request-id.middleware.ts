import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { DEFAULT_REQUEST_ID_HEADER, REQUEST_ID_PROP } from './logging.constants';

/**
 * 请求关联 ID 中间件
 *
 * 从 LOG_REQ_ID_HEADER（默认 x-request-id）取值，缺失则生成 UUID，
 * 写入 req[REQUEST_ID_PROP]（即 req.id）。operation-log 与访问日志拦截器
 * 都经该处读取同值，实现同一请求的跨记录关联。
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly header: string;

  constructor(configService: ConfigService) {
    const configured =
      configService.get<string>('app.logRequestIdHeader') ||
      DEFAULT_REQUEST_ID_HEADER;
    this.header = configured.toLowerCase();
  }

  use(req: Request, res: Response, next: NextFunction) {
    const target = req as Request & Record<string, unknown>;
    if (!target[REQUEST_ID_PROP]) {
      const headerValue = (req.headers[this.header] as string) || '';
      target[REQUEST_ID_PROP] = headerValue || randomUUID();
    }
    next();
  }
}