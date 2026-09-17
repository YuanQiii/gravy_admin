import { SortWhitelist } from '@gvray/core';
import { SelfPagedQueryDto } from '@gvray/core';

/**
 * 当前客户地址簿自助查询入参（P2-2）。
 *
 * **不声明** `customerId`/`receiver`/`phone`：身份经 `@CurrentCustomer()`
 * 注入；`receiver`/`phone` 是 PII 模糊查询且原实现从未消费（声明而不实现
 * 的静默失效契约，正是本变更要消除的形态）。未声明的查询字段由全局
 * `forbidNonWhitelisted` 以 400 拒绝。
 */
@SortWhitelist(['createdAt', 'updatedAt'])
export class QueryAddressSelfDto extends SelfPagedQueryDto {}
