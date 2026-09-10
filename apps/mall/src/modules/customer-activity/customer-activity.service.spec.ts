import { Prisma } from '@prisma/client';
import {
  CustomerActivityService,
} from './customer-activity.service';
import { QueryFavoriteDto } from './dto/query-favorite.dto';

describe('CustomerActivityService', () => {
  const customerId = 'c-1';
  const filterId = 'f-1';

  function p2002(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['customerId', 'filterId'] },
    });
  }

  describe('createFavorite', () => {
    function makeService(
      countResult: number,
      refetchResult: unknown = null,
      createImpl?: jest.Mock,
    ) {
      const tx = {
        filter: { count: jest.fn().mockResolvedValue(countResult) },
        customerFavorite: {
          create:
            createImpl ??
            jest
              .fn()
              .mockResolvedValue({ customerId, filterId, createdAt: new Date() }),
        },
      };
      const prisma: any = {
        customerFavorite: {
          findUnique: jest.fn().mockImplementation(() => {
            if (refetchResult === null || refetchResult === undefined) {
              return Promise.resolve(null);
            }
            return Promise.resolve(refetchResult);
          }),
        },
        $transaction: jest.fn(async (cb: any) => cb(tx)),
      };
      const service = new CustomerActivityService(prisma, {} as any);
      return { service, tx };
    }

    it('滤清器可用（存在+enabled+未软删）→ 事务内成功创建', async () => {
      const { service, tx } = makeService(1);
      const result = await service.createFavorite(customerId, filterId);
      expect(result).toMatchObject({ customerId, filterId });
      expect(tx.customerFavorite.create).toHaveBeenCalledWith({
        data: { customerId, filterId },
      });
    });

    it('收藏不存在的滤清器 → 400 FILTER_NOT_AVAILABLE，不创建', async () => {
      const { service, tx } = makeService(0);
      await expect(service.createFavorite(customerId, filterId)).rejects.toThrow(
        'FILTER_NOT_AVAILABLE',
      );
      expect(tx.customerFavorite.create).not.toHaveBeenCalled();
    });

    it('收藏已停用（status!=enabled）滤清器 → 400 FILTER_NOT_AVAILABLE，不创建', async () => {
      const { service, tx } = makeService(0);
      await expect(service.createFavorite(customerId, filterId)).rejects.toThrow(
        'FILTER_NOT_AVAILABLE',
      );
      expect(tx.customerFavorite.create).not.toHaveBeenCalled();
    });

    it('收藏已软删滤清器 → 400 FILTER_NOT_AVAILABLE，不创建', async () => {
      const { service, tx } = makeService(0);
      await expect(service.createFavorite(customerId, filterId)).rejects.toThrow(
        'FILTER_NOT_AVAILABLE',
      );
      expect(tx.customerFavorite.create).not.toHaveBeenCalled();
    });

    it('重复/并发收藏撞 P2002 → 回查既存并返回，不重复插入、不报 500', async () => {
      const existed = {
        favoriteId: 'fav-1',
        customerId,
        filterId,
        createdAt: new Date(),
      };
      const createImpl = jest.fn().mockRejectedValue(p2002());
      const { service, tx } = makeService(1, existed, createImpl);
      const result = await service.createFavorite(customerId, filterId);
      expect(result).toMatchObject({ favoriteId: 'fav-1', customerId, filterId });
      expect(tx.customerFavorite.create).toHaveBeenCalledTimes(1);
      expect(tx.customerFavorite.create).toHaveBeenCalledWith({
        data: { customerId, filterId },
      });
    });
  });

  describe('findFavorites', () => {
    const row = (
      filter: { status: string; deletedAt: Date | null } | null,
    ) => ({
      favoriteId: `fav-${Math.random()}`,
      customerId,
      filterId,
      createdAt: new Date(),
      filter: filter
        ? { model: 'M1', gencode: 'G1', typeName: '空滤', ...filter }
        : null,
    });

    function makeListService(items: unknown[], total = items.length) {
      const prisma: any = {
        customerFavorite: {
          findMany: jest.fn().mockResolvedValue(items),
          count: jest.fn().mockResolvedValue(total),
        },
      };
      const service = new CustomerActivityService(prisma, {} as any);
      const query = new QueryFavoriteDto();
      query.page = 1;
      query.pageSize = 10;
      query.customerId = customerId;
      return { service, query };
    }

    it('投影滤清器快照并派生 filterAvailable=true（enabled 未软删）', async () => {
      const { service, query } = makeListService([
        row({ status: 'enabled', deletedAt: null }),
      ]);
      const result = await service.findFavorites(query);
      const item: any = result.items[0];
      expect(item.filterAvailable).toBe(true);
      expect(item.filter).toEqual({
        model: 'M1',
        gencode: 'G1',
        typeName: '空滤',
        photoUuid: null,
      });
      // 序列化后（wire 格式）：filter 只含对外字段，不含 status/deletedAt/id
      const serialized = JSON.parse(JSON.stringify(item));
      expect(serialized.filter).toEqual({
        model: 'M1',
        gencode: 'G1',
        typeName: '空滤',
        photoUuid: null,
      });
      expect(serialized).not.toHaveProperty('id');
    });

    it('滤清器 disabled → filterAvailable=false，记录仍返回快照', async () => {
      const { service, query } = makeListService([
        row({ status: 'disabled', deletedAt: null }),
      ]);
      const result = await service.findFavorites(query);
      const item: any = result.items[0];
      expect(item.filterAvailable).toBe(false);
      expect(item.filter).toEqual({
        model: 'M1',
        gencode: 'G1',
        typeName: '空滤',
        photoUuid: null,
      });
    });

    it('滤清器已软删 → filterAvailable=false，记录仍返回快照', async () => {
      const { service, query } = makeListService([
        row({ status: 'enabled', deletedAt: new Date() }),
      ]);
      const result = await service.findFavorites(query);
      expect(result.items[0].filterAvailable).toBe(false);
    });

    it('滤清器缺失（filter=null）→ filterAvailable=false，filter 为 undefined', async () => {
      const { service, query } = makeListService([row(null)]);
      const result = await service.findFavorites(query);
      expect(result.items[0].filterAvailable).toBe(false);
      expect(result.items[0].filter).toBeUndefined();
    });
  });

  describe('removeFavoriteById', () => {
    it('本人收藏存在 → 硬删成功', async () => {
      const existing = { favoriteId: 'fav-1', customerId, filterId };
      const prisma: any = {
        customerFavorite: {
          findFirst: jest.fn().mockResolvedValue(existing),
          delete: jest.fn().mockResolvedValue(existing),
        },
      };
      const service = new CustomerActivityService(prisma, {} as any);
      await service.removeFavoriteById('fav-1', customerId);
      expect(prisma.customerFavorite.delete).toHaveBeenCalledWith({
        where: { favoriteId: 'fav-1' },
      });
    });

    it('跨客户或不存在 → 404', async () => {
      const prisma: any = {
        customerFavorite: {
          findFirst: jest.fn().mockResolvedValue(null),
          delete: jest.fn(),
        },
      };
      const service = new CustomerActivityService(prisma, {} as any);
      await expect(
        service.removeFavoriteById('fav-1', 'other-customer'),
      ).rejects.toThrow('收藏不存在');
      expect(prisma.customerFavorite.delete).not.toHaveBeenCalled();
    });
  });
});