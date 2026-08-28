import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UsersService } from './users.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PermissionCacheService } from '@/redis/permission-cache.service';
import { SUPER_ROLE_KEY } from '@/shared/constants/role.constant';

describe('UsersService.remove', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PermissionCacheService, useValue: {} },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('删除被其他记录引用的用户时应抛出 ConflictException 而非 500', async () => {
    // 目标用户存在且非超级管理员（userRoles 为空 → isSuperAdmin 返回 false）
    prisma.user.findUnique.mockResolvedValue({
      userId: 'user-1',
      username: 'referenced_user',
      userRoles: [],
    });
    // 数据库原生外键约束：用户被 notices 等表引用时删除失败（P2003）
    prisma.user.delete.mockRejectedValue(
      new PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `notices_createdById_fkey`',
        { code: 'P2003', clientVersion: '6.19.2' },
      ),
    );

    await expect(
      service.remove('user-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService 角色变更（投影收敛 + 守卫收敛）', () => {
  let service: UsersService;
  // findUnique 会以三种形态被调用：assertRoleMutationAllowed(原生)、isSuperAdmin(带 userRoles select)、findUserForResponse(带完整 select)
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    role: { count: jest.Mock; findMany: jest.Mock };
    userRole: { deleteMany: jest.Mock; createMany: jest.Mock };
  };
  let permissionCache: { invalidateUser: jest.Mock };

  const TARGET_USER = {
    userId: 'user-target',
    username: 'target',
    nickname: 'target',
    email: 'target@example.com',
    phone: null,
    avatar: null,
    gender: null,
    description: '目标用户描述',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    userRoles: [],
    department: null,
    userPositions: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(3), // countSuperAdminUsers：超管数量 > 2
      },
      role: {
        count: jest.fn().mockResolvedValue(1), // validateRoleIds：roleIds 均存在
        findMany: jest.fn().mockResolvedValue([]), // containsSuperAdminRole：无超管角色
      },
      userRole: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    // findUnique 默认返回目标用户（findUserForResponse 形态），isSuperAdmin 形态返回非超管
    prisma.user.findUnique.mockImplementation(({ select }: { select?: unknown }) => {
      const sel = select as Record<string, unknown> | undefined;
      // isSuperAdmin 使用 select: { userRoles }，仅含 userRoles；findUserForResponse 含 username
      if (sel && !('username' in sel)) {
        return Promise.resolve({ userRoles: [] });
      }
      return Promise.resolve(TARGET_USER);
    });

    permissionCache = { invalidateUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PermissionCacheService, useValue: permissionCache },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('assignRoles / removeRoles（投影收敛 D1）', () => {
    it('assignRoles 返回的 DTO 应包含 description（漂移对齐）', async () => {
      const result = await service.assignRoles(
        'user-target',
        ['role-1'],
        'admin-1',
      );
      expect(result.description).toBe('目标用户描述');
      expect(permissionCache.invalidateUser).toHaveBeenCalledWith('user-target');
    });

    it('removeRoles 返回的 DTO 应包含 description（漂移对齐）', async () => {
      prisma.role.findMany.mockResolvedValue([]);
      const result = await service.removeRoles(
        'user-target',
        ['role-1'],
        'admin-1',
      );
      expect(result.description).toBe('目标用户描述');
      expect(permissionCache.invalidateUser).toHaveBeenCalledWith('user-target');
    });
  });

  describe('assertRoleMutationAllowed（守卫收敛 D2，四分支）', () => {
    it('目标用户不存在 → NotFoundException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.assignRoles('user-missing', ['role-1'], 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('不能修改自己的角色 → ForbiddenException', async () => {
      await expect(
        service.assignRoles('admin-1', ['role-1'], 'admin-1'),
      ).rejects.toThrow('不能修改自己的角色');
    });

    it('层级拦截：非超管不能操作超级管理员 → ForbiddenException', async () => {
      // isSuperAdmin(userId)=true（目标为超管），isSuperAdmin(currentUserId)=false
      prisma.user.findUnique.mockImplementation(
        ({ select }: { select?: { userRoles?: unknown } }) => {
          if (select?.userRoles !== undefined) {
            return Promise.resolve({
              userRoles: [{ role: { roleKey: SUPER_ROLE_KEY } }],
            });
          }
          return Promise.resolve(TARGET_USER);
        },
      );
      await expect(
        service.assignRoles('user-target', ['role-1'], 'admin-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('roleIds 非法（部分角色不存在）→ NotFoundException', async () => {
      prisma.role.count.mockResolvedValue(0); // 校验 roleIds 时 count 不匹配
      await expect(
        service.assignRoles('user-target', ['role-ghost'], 'admin-1'),
      ).rejects.toThrow('部分角色不存在');
    });
  });
});