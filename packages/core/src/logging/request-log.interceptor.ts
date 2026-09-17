import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_SLOW_MS, REQUEST_ID_PROP } from './logging.constants';
import { clientIpResolver } from '../core/client-ip.resolver';

/**
 * 请求日志拦截器（最外层 APP_INTERCEPTOR，单一 owner）
 *
 * 单一 seam 内用 catchError 同时拥有成功/慢/失败三分支，失败只记一次（error+stack），
 * 成功请求不再被其它拦截器/过滤器重复记录。敏感字段交给 pino redact 在输出时统一掩码，
 * 此处不做二次脱敏。
 *
 *  - 正常   → info：userId/method/route/path/status/duration/req.id/IP/UA/query
 *  - 慢请求 → info + 附加脱敏后的 body（超 LOG_SLOW_MS）
 *  - 抛错   → error + stack
 */
@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly slowMs: number;

  constructor(configService: ConfigService) {
    this.slowMs = configService.get<number>('app.logSlowMs', DEFAULT_SLOW_MS);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & any>();
    const res = http.getResponse<Response>();

    if ((req.method || '').toUpperCase() === 'OPTIONS') {
      return next.handle();
    }

    const start = Date.now();
    const requestId: string | null =
      typeof req[REQUEST_ID_PROP] === 'string' ? req[REQUEST_ID_PROP] : null;

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        const status = res.statusCode || HttpStatus.OK;
        const base = this.buildBase(context, req, status, durationMs, requestId);

        // 慢请求附加脱敏后的 body
        if (durationMs >= this.slowMs) {
          this.logger.log({
            ...base,
            msg: 'slow request',
            slow: true,
            body: req.body,
          });
          return;
        }

        this.logger.log({ ...base, msg: 'request completed' });
      }),
      catchError((err) => {
        const durationMs = Date.now() - start;
        const status =
          err instanceof HttpException
            ? err.getStatus()
            : err?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const base = this.buildBase(context, req, status, durationMs, requestId);
        this.logger.error(
          {
            ...base,
            msg: 'request failed',
          },
          err instanceof Error ? err.stack : String(err),
        );
        return throwError(() => err);
      }),
    );
  }

  private buildBase(
    context: ExecutionContext,
    req: Request & any,
    status: number,
    durationMs: number,
    requestId: string | null,
  ) {
    const user = req.user || {};
    const path = req.originalUrl || req.url || '';
    const ip = clientIpResolver.resolve(req);
    return {
      userId: user?.sub || user?.userId || user?.id || null,
      method: (req.method || '').toUpperCase(),
      route: req.route?.path || req.path || '/',
      path,
      status,
      duration: durationMs,
      requestId,
      ip,
      ua: (req.headers['user-agent'] || '') as string,
      query: req.query,
    };
  }
}