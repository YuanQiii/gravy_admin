import { Injectable, Module } from '@nestjs/common';
import { PrismaModule, PrismaService } from '@gvray/core';

/**
 * CustomerAddress 删除语义 module（unify-soft-delete-mechanics 2.5，
 * 架构审查候选 2 采纳）—— 地址硬删的**唯一入口**。
 *
 * CustomerAddress 是有意硬删（DeleteStrategy.Hard，ADR 0016）：不设
 * \`deletedAt\`，本 module 是防死列回潮的结构性闸门 —— \`customerAddress.delete\`
 * /\`deleteMany\` 只允许出现在这里。
 *
 * 两个 adapter 对应两个**不合并**的信任维度（与 self/admin service 拆分一致）：
 * - \`removeForOwner\`：B2C self 路径，owner 来自登录态，事务内先断言归属再删；
 * - \`removeManyForOperator\`：admin 路径，凭权限码可见，无归属断言。
 */
@Injectable()
export class CustomerAddressDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  /** B2C self adapter：归属断言 + 硬删单条（他人地址按"不可见"静默跳过）。 */
  async removeForOwner(customerId: string, addressId: string): Promise<void> {
    const address = await this.prisma.customerAddress.findUnique({
      where: { addressId },
      select: { customerId: true },
    });
    if (!address || address.customerId !== customerId) {
      return; // 归属断言失败按"不可见"处理（404 语义由调用方 service 表达）
    }
    await this.prisma.customerAddress.delete({ where: { addressId } });
  }

  /** admin adapter：批量硬删，凭权限码可见，无归属断言。 */
  async removeManyForOperator(ids: string[]): Promise<number> {
    const result = await this.prisma.customerAddress.deleteMany({
      where: { addressId: { in: ids } },
    });
    return result.count;
  }

  /** admin adapter：单条硬删，凭权限码可见。 */
  async removeForOperator(addressId: string): Promise<void> {
    await this.prisma.customerAddress.delete({ where: { addressId } });
  }
}

/** 删除策略显式标记（2.6）：CustomerAddress 有意 opt-out 软删。 */
export const ADDRESS_DELETE_STRATEGY = 'Hard' as const;

@Module({
  imports: [PrismaModule],
  providers: [CustomerAddressDeletionService],
  exports: [CustomerAddressDeletionService],
})
export class CustomerAddressDeletionModule {}
