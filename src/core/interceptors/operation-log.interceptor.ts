import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PrismaService } from '@/prisma/prisma.service';
import { LogResult } from '@/shared/constants/log-result.constant';
import {
  OPLOG_META,
  OperationLogOptions,
} from '@/core/decorators/operation-log.decorator';
import { OPLOG_SKIP } from '@/core/decorators/no-operation-log.decorator';
import { SENSITIVE_KEYS } from '@/shared/constants/sensitive-keys.constant';
import { REQUEST_ID_PROP } from '@/logging/logging.constants';

function maskSensitive(input: unknown, maskFields: string[]): unknown {
  const fields = new Set(maskFields.map((f) => f.toLowerCase()));
  const maxLen = 2000; // 控制体积

  const replacer = (key: string, value: any) => {
    if (fields.has(key.toLowerCase())) return '***';
    if (typeof value === 'string' && value.length > 1000)
      return `${value.slice(0, 1000)}...[TRUNCATED]`;
    return value;
  };

  try {
    const json = JSON.stringify(input, replacer);
    if (!json) return input;
    return json.length > maxLen
      ? `${json.slice(0, maxLen)}...[TRUNCATED]`
      : JSON.parse(json);
  } catch {
    return input;
  }
}

@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & any>();

    const enabled = this.configService.get<boolean>('app.oLogEnabled', true);
    this.logger.log(
      `OperationLog Interceptor - enabled: ${enabled}, method: ${req.method}`,
    );
    if (!enabled) return next.handle();

    // 仅拦截变更请求
    const method = (req.method || '').toUpperCase();
    this.logger.log(
      `OperationLog Interceptor - method: ${method}, should intercept: ${['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)}`,
    );
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // 跳过显式禁用
    const handler = context.getHandler();
    const controller = context.getClass();
    const skip = this.reflector.getAllAndOverride<boolean>(OPLOG_SKIP, [
      handler,
      controller,
    ]);
    if (skip) return next.handle();

    // 装饰器元数据
    const meta =
      this.reflector.getAllAndOverride<OperationLogOptions>(OPLOG_META, [
        handler,
        controller,
      ]) || {};

    const start = Date.now();
    const ip = (req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.ip ||
      req.socket?.remoteAddress ||
      '') as string;
    const ua = (req.headers['user-agent'] || '') as string;
    const path = req.originalUrl || req.url || '';

    // 脱敏名单单一来源：SENSITIVE_KEYS 为基座，OPLOG_MASK_FIELDS 仅追加"仅DB生效"字段。
    // pino redact（LOG_REDACT）负责 stdout 掩码，二者链路分开，互不影响。
    const configured = this.configService
      .get<string>(
        'app.oLogMaskFields',
        'password,oldPassword,newPassword,token,authorization,secret,captcha',
      )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const maskFields = [...new Set([...SENSITIVE_KEYS, ...configured])];

    const maskedQuery = maskSensitive(req.query, maskFields);
    const maskedBody = maskSensitive(req.body, maskFields);

    // 请求关联 ID：经 logging module 写入的稳定属性，不触碰 pino 内部
    const requestId: string | null =
      typeof req[REQUEST_ID_PROP] === 'string' ? req[REQUEST_ID_PROP] : null;

    const finish = async (status: number, message?: string) => {
      const resultStr =
        status >= 200 && status < 300 ? LogResult.SUCCESS : LogResult.FAILURE;
      try {
        const user = req.user || {};
        const latencyMs = Date.now() - start;
        const autoModule = (path.split('?')[0] || '/').split('/')[1] || '';
        const autoAction =
          method === 'POST'
            ? 'create'
            : method === 'PUT' || method === 'PATCH'
              ? 'update'
              : method === 'DELETE'
                ? 'delete'
                : 'unknown';
        await this.prisma.operationLog.create({
          data: {
            userId: user.sub || user.userId || null,
            username: user.username || null,
            nickname: user.nickname || null,
            module: meta.module || autoModule,
            action: meta.action || autoAction,
            resource: meta.resource || path,
            method,
            path,
            query: maskedQuery as any,
            body: maskedBody as any,
            ipAddress: ip,
            userAgent: ua,
            result: resultStr,
            message: message?.slice(0, 500),
            latencyMs,
            requestId,
          },
        });
      } catch (e) {
        // 写库失败不影响业务

        this.logger.error('OperationLog write failed', e);
      }
    };

    return next.handle().pipe(
      tap(async () => {
        await finish(200);
      }),
      catchError((err) => {
        const msg = (err?.message as string) || 'Unknown error';
        finish(0, msg);
        return throwError(() => err);
      }),
    );
  }
}
