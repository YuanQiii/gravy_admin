import { Prisma } from '@prisma/client';
import { PrismaService } from '@gvray/core';

/**
 * 滤清器对客户"可消费 / 可操作"的单一真值条件：存在 + `status='enabled'` +
 * 未软删除。浏览可见性（B2C 域）与收藏校验共用同一判定源，防止两份谓词漂移。
 */
export const ACTIVE_FILTER_WHERE: Prisma.FilterWhereInput = {
  status: 'enabled',
  deletedAt: null,
};

/** 兼容 PrismaService 与 `$transaction` 客户端的最小接口，便于在事务内调用。 */
export interface ActiveFilterQueryable {
  filter: {
    count: (args?: { where?: Prisma.FilterWhereInput }) => Promise<number>;
  };
}

/**
 * 断言给定 `filterId` 对应滤清器对客户可用（存在 + enabled + 未软删）。
 *
 * 仅回答"是否可消费"，**错误映射由调用方决定**：
 * - 浏览详情：不可见映射为 404（不暴露存在性）；
 * - 收藏校验：不可用映射为 400 `FILTER_NOT_AVAILABLE`。
 *
 * 接受 `PrismaService` 或 `$transaction` 的 tx client，以便在选中锁定的并发下先查后写。
 */
export async function assertFilterBrowseable(
  prisma: ActiveFilterQueryable,
  filterId: string,
): Promise<boolean> {
  const count = await prisma.filter.count({
    where: { filterId, ...ACTIVE_FILTER_WHERE },
  });
  return count > 0;
}