import { SortWhitelist } from '@gvray/core';
import { SelfFilterableQueryDto } from '@gvray/core';

/**
 * 当前客户收藏自助查询入参（P2-2）：不声明 `customerId`，身份经
 * `@CurrentCustomer()` 注入；仅保留真实被消费的 `filterId` 筛选。
 */
@SortWhitelist(['createdAt'])
export class QueryFavoriteSelfDto extends SelfFilterableQueryDto {}
