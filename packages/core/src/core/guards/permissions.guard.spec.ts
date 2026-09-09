import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PermissionCacheService } from '../../redis/permission-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

/* ── Test doubles ──────────────────────────────────────────────── */

const createReflector = (required: string[] | undefined): Reflector =>
  ({
    getAllAndOverride: jest.fn(() => required),
  }) as unknown as Reflector;

const createContext = (
  userId?: string,
  roles?: Array<{ roleKey: string }>,
): ExecutionContext => {
  const request = {
    user: userId ? { userId, ...(roles ? { roles } : {}) } : undefined,
  };
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => request),
    })),
  } as unknown as ExecutionContext;
};

interface MockServices {
  permissionCache: { get: jest.Mock; set: jest.Mock };
  prisma: { user: { findUnique: jest.Mock } };
}

const createServices = (): MockServices => ({
  permissionCache: { get: jest.fn(), set: jest.fn() },
  prisma: { user: { findUnique: jest.fn() } },
});

const instantiate = (
  required: string[] | undefined,
  services: MockServices,
): PermissionsGuard =>
  new PermissionsGuard(
    createReflector(required),
    services.permissionCache as unknown as PermissionCacheService,
    services.prisma as unknown as PrismaService,
  );

// 与 Prisma findUnique(include rolePermissions.permission) 的返回形状一致
const makeUser = (permissionCodes: { code: string; type?: string | null }[]) => ({
  userRoles: [
    {
      role: {
        roleKey: 'admin',
        rolePermissions: permissionCodes.map(({ code, type }) => ({
          permission: { code, type: type ?? null },
        })),
      },
    },
  ],
});

describe('PermissionsGuard', () => {
  describe('no required permissions declared', () => {
    it('allows without touching cache/db', async () => {
      const services = createServices();
      const guard = instantiate(undefined, services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(true);
      expect(services.permissionCache.get).not.toHaveBeenCalled();
      expect(services.prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('no authenticated user', () => {
    it('denies when request.user?.userId is absent', async () => {
      const services = createServices();
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext())).resolves.toBe(false);
      expect(services.permissionCache.get).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('allows when the user holds every required permission', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue([
        'system:config:list',
        'system:config:update',
      ]);
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(true);
      expect(services.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('denies when the user lacks one of the required permissions', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue(['system:config:list']);
      const guard = instantiate(
        ['system:config:list', 'system:config:update'],
        services,
      );

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(false);
      expect(services.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('denies when cached permissions are empty', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue([]);
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(false);
      expect(services.prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('cache miss -> DB fallback and refill', () => {
    it('loads from DB via extractPermissionCodes, refills cache, allows matching user', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue(null);
      services.prisma.user.findUnique.mockResolvedValue(
        makeUser([{ code: 'system:config:list', type: 'API' }]),
      );
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(true);
      // 守卫走 extractPermissionCodes 默认（不过滤 API 类型），与 design 决定的非前端投影语义一致
      expect(services.permissionCache.set).toHaveBeenCalledWith(
        'u1',
        ['system:config:list'],
      );
    });

    it('still refills cache with the extracted codes but denies a non-matching user', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue(null);
      services.prisma.user.findUnique.mockResolvedValue(
        makeUser([{ code: 'other:x' }]),
      );
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(false);
      expect(services.permissionCache.set).toHaveBeenCalledWith('u1', [
        'other:x',
      ]);
    });

    it('denies when the user is not found in DB (no cache refill)', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue(null);
      services.prisma.user.findUnique.mockResolvedValue(null);
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(false);
      expect(services.permissionCache.set).not.toHaveBeenCalled();
    });

    it('denies when the DB lookup throws (swallowed by guard)', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue(null);
      services.prisma.user.findUnique.mockRejectedValue(new Error('db boom'));
      const guard = instantiate(['system:config:list'], services);

      await expect(guard.canActivate(createContext('u1'))).resolves.toBe(false);
      expect(services.permissionCache.set).not.toHaveBeenCalled();
    });
  });

  describe('super-admin runtime bypass', () => {
    it('allows a super_admin user even when the permission code is missing, without touching cache/db', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue(null);
      const guard = instantiate(
        ['system:config:update'],
        services,
      );

      await expect(
        guard.canActivate(
          createContext('u1', [{ roleKey: 'super_admin' }]),
        ),
      ).resolves.toBe(true);
      // 旁路发生在任何缓存/DB 访问之前
      expect(services.permissionCache.get).not.toHaveBeenCalled();
      expect(services.permissionCache.set).not.toHaveBeenCalled();
      expect(services.prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('does not bypass for a non-super_admin user lacking the required permission', async () => {
      const services = createServices();
      services.permissionCache.get.mockResolvedValue([]);
      const guard = instantiate(['system:config:update'], services);

      await expect(
        guard.canActivate(createContext('u1', [{ roleKey: 'admin' }])),
      ).resolves.toBe(false);
    });
  });
});