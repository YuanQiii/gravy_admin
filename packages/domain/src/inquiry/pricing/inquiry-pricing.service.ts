import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@gvray/core';
import { Money, toMoney } from './money';

/**
 * 询价金额聚合 —— 「金额必须可推导」这条不变量的**唯一所有者**。
 *
 * 两条规则收在这里：`subtotal = quantity × unitPrice`、`totalAmount = Σ subtotal`。
 * 此前它们散落在 DTO 契约里（由人填写），没有任何代码保证自洽，
 * 客户因此可能看到"4 × 12.50"的行小计写着 30.00，或合计与各行小计之和不等。
 *
 * 精度约束：金额一律用 `Prisma.Decimal`。`quantity` 是整数、`unitPrice` 两位小数，
 * 单行乘法精确；但**把行读进内存用 JS `number` 相加会漂**（0.1 + 0.2 类问题在
 * 金额上不可接受），因此求和交给 SQL 聚合。这条约束是本模块存在的一半理由 ——
 * 任何"先读再 reduce"的重构都会把它悄悄破坏，故写在最显眼处。
 */
@Injectable()
export class InquiryPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 单行小计：`quantity × unitPrice`。
   *
   * `unitPrice` 为空 → `null`（**不是 `0`**）：`0` 会被读成"免费"，
   * 而 `null` 表达"尚未报价"，与规格既有口径一致。
   *
   * 签名只接受 `Money`（branded Decimal，见 `./money`）：调用方必须先经
   * `toMoney` 完成输入解析，`number` 无法绕过 —— 金额运算的类型边界由此封闭。
   */
  deriveLineSubtotal(quantity: number, unitPrice: Money | null): Money | null {
    if (unitPrice === null) {
      return null;
    }
    return toMoney(
      new Prisma.Decimal(unitPrice).times(new Prisma.Decimal(quantity)),
    );
  }

  /**
   * 重算后的合计值（不经 HTTP 的读取辅助，供测试与调用方断言）。
   * 返回 branded `Money`；无值时为 `null`。
   */
  async readTotalAmount(
    tx: Prisma.TransactionClient | PrismaService,
    inquiryId: string,
  ): Promise<Money | null> {
    const row = await tx.inquiry.findUnique({
      where: { inquiryId },
      select: { totalAmount: true },
    });
    return toMoney(row?.totalAmount ?? null);
  }

  /**
   * 重算整单合计：`totalAmount = Σ(未软删明细行的 subtotal)`。
   *
   * 全部为空或无行 → `null`（不是 0）。调用方应已在同一事务内，使"明细改动"
   * 与"合计落定"对读取方永远自洽。
   */
  async recomputeForInquiry(
    tx: Prisma.TransactionClient,
    inquiryId: string,
  ): Promise<void> {
    const aggregated = await tx.inquiryLine.aggregate({
      where: { inquiryId, deletedAt: null },
      _sum: { subtotal: true },
    });

    await tx.inquiry.update({
      where: { inquiryId },
      data: { totalAmount: aggregated._sum.subtotal },
    });
  }
}
