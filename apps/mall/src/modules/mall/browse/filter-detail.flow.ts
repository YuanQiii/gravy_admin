import { Injectable } from '@nestjs/common';
import { FiltersService, FilterResponseDto } from '@gvray/domain';
import { HistorySideEffectService } from '@/modules/customer-activity/history-side-effect.service';
import { MALL_OPTS } from '../mall.constants';

/**
 * 滤清器详情浏览深模块：把"加载可见滤清器 + 已登录才写历史"收敛成单一接口，
 * 使「成功才写、失效不写、匿名不写」不变量本地化，控制器保持薄透传。
 *
 * - 可见性由 `FiltersService.findOne(id, MALL_OPTS)` 保证（enabled-only，失效抛 404）；
 * - `customerId` 由 `OptionalCustomerGuard` 注入，缺失即为匿名，不写历史；
 * - 历史写**不进入响应链**（fire-and-forget，take-history-write-off-request-path）：
 *   `record()` 无返回值、内部自带失败可见性（warn `record_view_failed`），
 *   本模块对它零 try/catch、零 await —— 响应在 `findOne` 后即刻返回。
 */
@Injectable()
export class FilterDetailFlow {
  constructor(
    private readonly filtersService: FiltersService,
    private readonly historySideEffect: HistorySideEffectService,
  ) {}

  async viewFilterDetail(
    customerId: string | undefined,
    filterId: string,
    requestId?: string | null,
  ): Promise<FilterResponseDto> {
    const data = await this.filtersService.findOne(filterId, MALL_OPTS);
    // fire-and-forget：写历史脱离响应链（P95 不再被 upsert+淘汰事务拖累）；
    // 失败可见性在 HistorySideEffectService 内（.catch 强制 + 结构化 warn）。
    if (customerId) {
      this.historySideEffect.record(customerId, filterId, requestId);
    }
    return data;
  }
}