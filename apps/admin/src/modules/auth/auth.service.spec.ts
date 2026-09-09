import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../system/users/users.service';
import { LoginLogsService } from '../system/login-logs/login-logs.service';
import { TokenService } from './token.service';
import { RateLimiterService, PermissionCacheService, PrismaService } from '@gvray/core';

describe('AuthService', () => {
  let service: AuthService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: { user: { findFirst: jest.fn() } },
        },
        {
          provide: LoginLogsService,
          useValue: {},
        },
        {
          provide: TokenService,
          useValue: {},
        },
        {
          provide: RateLimiterService,
          useValue: {},
        },
        {
          provide: PermissionCacheService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser（PostgreSQL 大小写敏感契约）', () => {
    it('账号大小写变体不做规范化，按原样精确查询并返回 null', async () => {
      const prisma = module.get<PrismaService>(PrismaService);
      // 模拟 PG 精确匹配语义：SUPER_ADMIN 与 super_admin 不相等 → 查无此用户
      (prisma.user.findFirst as jest.Mock) = jest.fn().mockResolvedValue(null);

      const result = await service.validateUser('SUPER_ADMIN', '123456');

      expect(result).toBeNull();
      // 契约：不得对 account 做大小写规范化（toLowerCase 等），否则破坏 PG 精确匹配语义
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: expect.arrayContaining([{ username: 'SUPER_ADMIN' }]),
          },
        }),
      );
      const callArg = (prisma.user.findFirst as jest.Mock).mock.calls[0][0];
      // 契约：查询条件中不得出现小写规范化后的值
      expect(
        callArg.where.OR.some((cond: Record<string, string>) =>
          Object.values(cond).includes('super_admin'),
        ),
      ).toBe(false);
    });
  });
});
