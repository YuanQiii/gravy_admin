import { Prisma } from '@prisma/client';
import { InquiryPricingService } from './inquiry-pricing.service';
import { toMoney } from './money';

/**
 * 定价聚合的单测。
 *
 * 真正的"合计 = Σ 小计"的一致性由 e2e（HTTP 线上形状）与 `writeLine` 接缝的
 * mock 断言覆盖；这里穷尽的是**纯函数** `deriveLineSubtotal` 的语义边界与
 * `recomputeForInquiry` 的空值规则。
 */
describe('InquiryPricingService', () => {
  const service = new InquiryPricingService(null as any);

  describe('deriveLineSubtotal（行小计派生）', () => {
    it('常规：4 × 12.50 → 50.00（Decimal 精确，不落浮点误差）', () => {
      const result = service.deriveLineSubtotal(4, toMoney(12.5));

      expect(result).not.toBeNull();
      expect((result as Prisma.Decimal).toString()).toBe('50');
    });

    it('0.1 类小数：3 × 0.10 → 0.3（Decimal 乘法精确）', () => {
      const result = service.deriveLineSubtotal(3, toMoney(0.1));

      // 若这条曾用 JS number 计算，0.1 * 3 会得到 0.30000000000000004
      expect((result as Prisma.Decimal).toString()).toBe('0.3');
    });

    it('unitPrice 为 null → subtotal 为 null（不是 0）', () => {
      const result = service.deriveLineSubtotal(4, null);

      expect(result).toBeNull();
    });

    it('quantity 缺省按 1 处理由调用方保证；本函数不做默认值', () => {
      // 防回归签名：unitPrice 必须是 Money（branded Decimal），number 传不进来
      // —— 若本断言失败并有人改回 number 入参，Money 类型就失去了存在意义。
      const result = service.deriveLineSubtotal(2, toMoney(new Prisma.Decimal('99.99')));
      expect((result as Prisma.Decimal).toString()).toBe('199.98');
    });
  });

  describe('recomputeForInquiry（整单合计）', () => {
    const inquiryId = 'inq-001';
    let tx: any;

    beforeEach(() => {
      tx = {
        inquiryLine: { aggregate: jest.fn() },
        inquiry: { update: jest.fn(async () => ({})) },
      };
    });

    it('有已报价明细 → 合计为各行 subtotal 之和（DB 侧聚合）', async () => {
      tx.inquiryLine.aggregate.mockResolvedValue({
        _sum: { subtotal: new Prisma.Decimal('85.00') },
      });

      await service.recomputeForInquiry(tx, inquiryId);

      expect(tx.inquiryLine.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inquiryId, deletedAt: null },
        }),
      );
      expect(tx.inquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inquiryId },
          data: { totalAmount: new Prisma.Decimal('85.00') },
        }),
      );
    });

    it('无未软删明细（或全未报价）→ 合计为 null，不是 0', async () => {
      tx.inquiryLine.aggregate.mockResolvedValue({ _sum: { subtotal: null } });

      await service.recomputeForInquiry(tx, inquiryId);

      expect(tx.inquiry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totalAmount: null },
        }),
      );
    });

    it('聚合在 DB 侧完成：重算不把明细行读进内存', async () => {
      tx.inquiryLine.aggregate.mockResolvedValue({ _sum: { subtotal: null } });

      await service.recomputeForInquiry(tx, inquiryId);

      // 防回归：一旦有人改成 findMany + JS reduce，这里会出现 findMany 调用
      expect(tx.inquiryLine.findMany).toBeUndefined();
    });
  });

  describe('toMoney（唯一转换入口）', () => {
    it('null 透传为 null；Decimal / number 均可转换', () => {
      expect(toMoney(null)).toBeNull();
      expect(toMoney(new Prisma.Decimal('1.50'))!.toString()).toBe('1.5');
      expect(toMoney(2)!.toString()).toBe('2');
    });
  });
});
