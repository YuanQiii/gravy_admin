import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UsersService } from './users.service';
import { PrismaService } from '@/prisma/prisma.service';
import { PermissionCacheService } from '@/redis/permission-cache.service';

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
