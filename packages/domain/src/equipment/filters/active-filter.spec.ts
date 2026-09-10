import {
  assertFilterBrowseable,
  ACTIVE_FILTER_WHERE,
} from './active-filter';

describe('assertFilterBrowseable', () => {
  const filterId = 'f-1';

  it('滤清器存在且 enabled 且未软删 → true', async () => {
    const prisma: any = {
      filter: { count: jest.fn().mockResolvedValue(1) },
    };
    await expect(assertFilterBrowseable(prisma, filterId)).resolves.toBe(true);
    expect(prisma.filter.count).toHaveBeenCalledWith({
      where: { filterId, ...ACTIVE_FILTER_WHERE },
    });
  });

  it('滤清器不存在或非浏览可见 → false', async () => {
    const prisma: any = {
      filter: { count: jest.fn().mockResolvedValue(0) },
    };
    await expect(assertFilterBrowseable(prisma, filterId)).resolves.toBe(false);
  });

  it('查询恒强制 status=enabled、deletedAt=null（不受 filterId 影响）', async () => {
    const prisma: any = {
      filter: { count: jest.fn().mockResolvedValue(1) },
    };
    await assertFilterBrowseable(prisma, filterId);
    const [{ where }] = prisma.filter.count.mock.calls[0];
    expect(where.status).toBe('enabled');
    expect(where.deletedAt).toBeNull();
  });
});