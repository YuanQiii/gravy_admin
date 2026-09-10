import { Injectable, Logger } from '@nestjs/common';
import { FiltersService, FilterResponseDto } from '@gvray/domain';
import { CustomerActivityService } from '@/modules/customer-activity/customer-activity.service';
import { MALL_OPTS } from '../mall.constants';

/**
 * 滤清器详情浏览深模块：把"加载可见滤清器 + 已登录才写历史"收敛成单一接口，
 * 使「成功才写、失效不写、匿名不写」不变量本地化，控制器保持薄透传。
 *
 * - 可见性由 `FiltersService.findOne(id, MALL_OPTS)` 保证（enabled-only，失效抛 404）；
 * - `customerId` 由 `OptionalCustomerGuard` 注入，缺失即为匿名，不写历史；
 * - 历史写失败仅记 warn，不打挂公开浏览详情返回。
 */
@Injectable()
export class FilterDetailFlow {
  private readonly logger = new Logger(FilterDetailFlow.name);

  constructor(
    private readonly filtersService: FiltersService,
    private readonly activityService: CustomerActivityService,
  ) {}

  async viewFilterDetail(
    customerId: string | undefined,
    filterId: string,
  ): Promise<FilterResponseDto> {
    const data = await this.filtersService.findOne(filterId, MALL_OPTS);
    if (customerId) {
      try {
        await this.activityService.recordView(customerId, filterId);
      } catch (err) {
        this.logger.warn(
          `记录滤清器浏览历史失败 filterId=${filterId} customerId=${customerId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return data;
  }
}