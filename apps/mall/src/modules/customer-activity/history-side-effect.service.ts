import { Injectable, Logger } from '@nestjs/common';
import { CustomerActivityService } from './customer-activity.service';

/**
 * 浏览历史副作用 module（take-history-write-off-request-path C1/D3）。
 *
 * 「记录浏览历史」从详情响应链上摘除的**唯一出口**：对外只暴露 fire-and-forget
 * 的 `record()`，内部保证失败可见性 —— `.catch` 是强制项（杜绝 unhandled
 * rejection），失败以稳定 key `record_view_failed` 记 warn 并携带
 * `filterId`/`customerId`/`requestId` 与 `err.stack`，不打挂公开浏览详情。
 *
 * 为什么是独立 module 而非 flow 内联 `void promise.catch(...)`：失败可见性
 * 策略（日志 key、字段、stack）是这一副作用的所有权细节，flow 只表达
 * "登录后即发起记录，不等待"；把策略收在此处，flow 保持零 try/catch。
 */
@Injectable()
export class HistorySideEffectService {
  private readonly logger = new Logger(HistorySideEffectService.name);

  constructor(private readonly activityService: CustomerActivityService) {}

  /**
   * 发起浏览历史记录（fire-and-forget）：**不返回 Promise**，调用方无需也
   * 不应等待；内部 `.catch` 保证失败可见且进程无 unhandled rejection。
   */
  record(customerId: string, filterId: string, requestId?: string | null): void {
    void this.activityService
      .recordView(customerId, filterId)
      .catch((err: unknown) => {
        this.logger.warn(
          `record_view_failed: 记录浏览历史失败 filterId=${filterId} customerId=${customerId} requestId=${requestId ?? '-'}`,
          err instanceof Error ? err.stack : String(err),
        );
      });
  }
}
