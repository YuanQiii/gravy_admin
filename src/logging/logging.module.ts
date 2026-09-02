import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import {
  DEFAULT_REQUEST_ID_HEADER,
  REQUEST_ID_PROP,
} from './logging.constants';
import { buildRedactPaths, SENSITIVE_KEYS } from '@/shared/constants/sensitive-keys.constant';
import { RequestIdMiddleware } from './request-id.middleware';
import { RequestLogInterceptor } from './request-log.interceptor';

/**
 * 深日志模块（Deep logging module）
 *
 * 对外接口 = 薄 Nest Logger 签名 + @RequestId() 访问器；
 * 内部收敛 pino 初始化/prod-JSON、redact（LOG_REDACT）、corr-id 写入与命名、
 * 以及最外层 RequestLogInterceptor 的成功/慢/失败三分支。见 design.md / ADR 0006。
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('app.nodeEnv') === 'production';
        const level =
          configService.get<string>('app.logLevel') || 'info';
        const extraRedact = (
          configService.get<string>('app.logRedact') || ''
        )
          .split(',')
          .map((s) => s.trim().replace(/^\.\*\./, ''))
          .filter(Boolean)
          .map((name) => `*.${name}`);

        // 关联 ID 头名（小写），与 RequestIdMiddleware 保持一致
        const headerName = (
          configService.get<string>('app.logRequestIdHeader') ||
          DEFAULT_REQUEST_ID_HEADER
        ).toLowerCase();

        return {
          pinoHttp: {
            // 访问日志由 RequestLogInterceptor 统一产出，避免 pino-http 自动记录造成重复
            autoLogging: false,
            level,
            // 让 req.id 即关联 ID：优先取请求头（缺失生成 UUID），
            // 避免 pino-http 默认的数字自增 id 覆盖我们写入的关联 ID
            genReqId: (req) => {
              const headerValue = (req.headers[headerName] as string) || '';
              return headerValue || randomUUID();
            },
            // redact 作用于最终 JSON 对象（无论来源），敏感字段在输出层统一掩码
            redact: {
              paths: buildRedactPaths(SENSITIVE_KEYS, extraRedact),
            },
            // 生产输出纯 JSON；开发输出可读格式
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: { colorize: true, singleLine: true },
                  },
                }),
          },
        };
      },
    }),
  ],
  providers: [RequestIdMiddleware, RequestLogInterceptor, ConfigService],
  exports: [RequestLogInterceptor, RequestIdMiddleware],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 全局注入请求关联 ID
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}