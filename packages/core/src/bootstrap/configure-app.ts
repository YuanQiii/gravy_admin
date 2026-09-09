import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { EmptyStringTransformPipe } from '../core/pipes/empty-string-transform.pipe';

/**
 * 共享应用引导接缝（design D9 / ADR 0010 决策 9）
 *
 * 收敛两个应用（admin / mall）与测试工厂共用的"应用无关"引导逻辑：
 * - pino 接管 NestJS 日志输出
 * - 全局管道组合（EmptyStringTransform → ValidationPipe）
 * - CORS 使能与来源解析
 *
 * 各端 main.ts 仅保留端特定差异（Swagger 标题 / 端口），测试工厂经此
 * 接缝复用同一路径，保证"测试环境 = 生产引导路径"（接口即测试面）。
 */
export function configureApp(app: INestApplication): void {
  // 让 pino 接管 NestJS 日志输出：prod 为单行 JSON，dev 为 pino-pretty
  app.useLogger(app.get(Logger));
  const configService = app.get(ConfigService);

  // CORS 配置
  const isDev = configService.get('app.nodeEnv') === 'development';
  const enableCors = isDev || configService.get('cors.enabled');

  if (enableCors) {
    const corsOrigins = configService
      .get<string>('cors.origins')
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    app.enableCors({
      origin: isDev ? true : corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Access-Token',
        'Cache-Control',
        'X-Requested-With',
      ],
      maxAge: isDev ? 3600 : 86400, // 24h
    });
  }

  // 全局管道：先转换空字符串为 null，再执行验证
  app.useGlobalPipes(
    new EmptyStringTransformPipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}