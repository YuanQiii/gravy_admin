import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BaseService, VisibilityOpts } from './base.service';

// 用最小可实例化的子类来测试 protected 方法
class TestService extends BaseService {
  constructor(prisma: PrismaService, config: ConfigService) {
    super(prisma, config);
  }

  callApplyVisibility(where: Record<string, unknown>, opts?: VisibilityOpts) {
    return this.applyVisibility(where, opts);
  }

  callAssertVisible(record: { status: string } | null, opts?: VisibilityOpts) {
    return this.assertVisible(record, opts);
  }
}

describe('BaseService visibility helpers', () => {
  const service = new TestService({} as PrismaService, {} as ConfigService);

  describe('applyVisibility', () => {
    it('anonymous 强制覆盖已有 status（防 query 绕过）', () => {
      const where = { status: 'disabled', name: 'foo' };
      service.callApplyVisibility(where, { visibility: 'anonymous' });
      expect(where.status).toBe('enabled');
      expect(where.name).toBe('foo'); // 其他字段保留
    });

    it("b2c 与 anonymous 行为对齐：强制 status='enabled'", () => {
      const where = { status: 'disabled', name: 'foo' };
      service.callApplyVisibility(where, { visibility: 'b2c' });
      expect(where.status).toBe('enabled');
      expect(where.name).toBe('foo');
    });

    it('admin 不干预 where（保留调用方原值）', () => {
      const where = { status: 'disabled', name: 'foo' };
      service.callApplyVisibility(where, { visibility: 'admin' });
      expect(where.status).toBe('disabled'); // 不变
    });

    it('未传 opts 等同 admin（不干预）', () => {
      const where: Record<string, unknown> = { name: 'foo' };
      service.callApplyVisibility(where);
      expect(where.status).toBeUndefined();
    });
  });

  describe('assertVisible', () => {
    it('anonymous 对 disabled 记录抛 404（不暴露存在性）', () => {
      expect(() =>
        service.callAssertVisible(
          { status: 'disabled' },
          { visibility: 'anonymous' },
        ),
      ).toThrow(NotFoundException);
    });

    it('b2c 与 anonymous 行为对齐：disabled 记录抛 404', () => {
      expect(() =>
        service.callAssertVisible(
          { status: 'disabled' },
          { visibility: 'b2c' },
        ),
      ).toThrow(NotFoundException);
    });

    it('b2c 与 anonymous 行为对齐：enabled 记录放行', () => {
      expect(() =>
        service.callAssertVisible({ status: 'enabled' }, { visibility: 'b2c' }),
      ).not.toThrow();
    });

    it('anonymous 对 enabled 记录放行', () => {
      expect(() =>
        service.callAssertVisible(
          { status: 'enabled' },
          { visibility: 'anonymous' },
        ),
      ).not.toThrow();
    });

    it('admin 不干预（即使 disabled 也放行）', () => {
      expect(() =>
        service.callAssertVisible(
          { status: 'disabled' },
          { visibility: 'admin' },
        ),
      ).not.toThrow();
    });

    it('anonymous 对 null 记录抛 404', () => {
      expect(() =>
        service.callAssertVisible(null, { visibility: 'anonymous' }),
      ).toThrow(NotFoundException);
    });

    it('b2c 与 anonymous 行为对齐：null 记录抛 404', () => {
      expect(() =>
        service.callAssertVisible(null, { visibility: 'b2c' }),
      ).toThrow(NotFoundException);
    });
  });
});
