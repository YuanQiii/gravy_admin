import { Test, TestingModule } from '@nestjs/testing';
import { PermissionCacheService } from './permission-cache.service';
import { RedisService } from './redis.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;
  let redisService: {
    isAvailable: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let prisma: {
    userRole: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    redisService = {
      isAvailable: jest.fn().mockReturnValue(true),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    prisma = {
      userRole: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCacheService,
        { provide: RedisService, useValue: redisService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PermissionCacheService>(PermissionCacheService);
  });

  describe('invalidateUser', () => {
    it('调用底层 del 删除该用户的权限缓存 key', async () => {
      await service.invalidateUser('user-1');
      expect(redisService.del).toHaveBeenCalledWith('perm:user:user-1');
    });

    it('Redis 不可用时静默降级，不抛异常', async () => {
      redisService.isAvailable.mockReturnValue(false);
      await expect(service.invalidateUser('user-1')).resolves.not.toThrow();
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  describe('invalidateRole', () => {
    it('查询角色下的全部用户并逐个失效其权限缓存', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
      ]);

      await service.invalidateRole('role-1');

      expect(prisma.userRole.findMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
        select: { userId: true },
      });
      expect(redisService.del).toHaveBeenCalledWith('perm:user:user-a');
      expect(redisService.del).toHaveBeenCalledWith('perm:user:user-b');
    });

    it('角色下无用户时不产生任何删除调用', async () => {
      prisma.userRole.findMany.mockResolvedValue([]);

      await service.invalidateRole('role-empty');

      expect(redisService.del).not.toHaveBeenCalled();
    });

    it('Redis 不可用时静默降级，不查询数据库、不抛异常', async () => {
      redisService.isAvailable.mockReturnValue(false);

      await expect(service.invalidateRole('role-1')).resolves.not.toThrow();
      expect(prisma.userRole.findMany).not.toHaveBeenCalled();
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });
});