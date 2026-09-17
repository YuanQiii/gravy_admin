import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { ResponseUtil } from '../../shared/utils/response.util';
import {
  resolveErrorPresentation,
  toHttpStatus,
} from './error-presentation';

/**
 * HTTP异常过滤器 —— **薄适配器**。
 *
 * 全部决策（异常分类、message 提取与环境收敛、showType 映射、业务码映射）
 * 在纯函数 `resolveErrorPresentation` / `toHttpStatus` 内，本类只负责：
 * 读环境 → 调纯函数 → 写响应。
 *
 * 失败请求的日志由最外层 RequestLogInterceptor 的错误分支统一产出（仅一次），
 * 此处不记录（"失败只记一次"的唯一归属）；生产环境的非预期异常 message 已
 * 泛化，客户端凭响应头 `x-request-id` 关联日志细节。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const { status, message, showType } = resolveErrorPresentation(exception, {
      isProduction: nodeEnv === 'production',
    });

    const errorResponse = ResponseUtil.error(message, status, showType);
    response.status(toHttpStatus(status)).json(errorResponse);
  }
}
