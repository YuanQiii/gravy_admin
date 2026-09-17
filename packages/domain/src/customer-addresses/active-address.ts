import { Prisma } from '@prisma/client';

/**
 * 收货地址的可见性谓词（unify-soft-delete-mechanics 2.4，对标 `ACTIVE_FILTER_WHERE`）。
 *
 * CustomerAddress 为有意硬删（ADR 0016）：不存在软删态，谓词只有归属维度。
 * 调用方在 `customerId` 维度上自行并集（self 首参 / admin 全量）。
 */
export const ADDRESS_ACTIVE_WHERE: Prisma.CustomerAddressWhereInput = {};

/** 删除策略显式标记的重新导出（2.6，防止散落 import 路径）。 */
export { ADDRESS_DELETE_STRATEGY } from './customer-address-deletion.service';
