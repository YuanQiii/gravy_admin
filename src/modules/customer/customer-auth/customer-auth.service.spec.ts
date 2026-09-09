import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerTokenService } from './customer-token.service';
import { PrismaService } from '@gvray/core';


const configs: Record<string, string> = {
  'jwt.accessTokenExpiresIn': '5m',
  'jwt.refreshTokenExpiresIn': '7d',
};

describe('CustomerAuthService', () => {
  let service: CustomerAuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let customerTokenService: CustomerTokenService;

  let customerRecord: unknown;
  let passwordValid: boolean;

  beforeEach(async () => {
    customerRecord = null;
    passwordValid = true;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAuthService,
        {
          provide: PrismaService,
          useValue: {
            customer: {
              findFirst: jest.fn(async () => customerRecord),
              findUnique: jest.fn(async () => customerRecord),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-access-token'),
            decode: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configs[key]) },
        },
        {
          provide: CustomerTokenService,
          useValue: {
            storeRefreshToken: jest.fn().mockResolvedValue(undefined),
            verifyRefreshToken: jest.fn(),
            revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
            revokeByAccessTokenJti: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CustomerAuthService>(CustomerAuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    customerTokenService = module.get<CustomerTokenService>(CustomerTokenService);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => passwordValid);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const activeCustomer = {
    customerId: 'customer-uuid-1',
    username: 'customer.one',
    email: 'customer.one@example.com',
    phoneNumber: '13900000001',
    password: 'hashed-123456',
    status: 'enabled',
    deletedAt: null,
  };

  describe('login', () => {
    it('按 username 解析成功，签发带 realm=customer 的 token', async () => {
      customerRecord = activeCustomer;
      const result = await service.login({
        identifier: 'customer.one',
        password: '123456',
      });

      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'customer.one', deletedAt: null },
        }),
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ realm: 'customer', sub: 'customer-uuid-1' }),
        expect.anything(),
      );
      expect(result.access_token).toBe('signed-access-token');
      expect(result.refresh_token).toBeDefined();
      expect(customerTokenService.storeRefreshToken).toHaveBeenCalled();
    });

    it('按 email 解析成功', async () => {
      customerRecord = null;
      // username 查不到 → email 命中（模拟按字段逐个解析的顺序）
      (prisma.customer.findFirst as jest.Mock).mockImplementation(
        async (args: { where: Record<string, unknown> }) =>
          args.where.username ? null : activeCustomer,
      );
      const result = await service.login({
        identifier: 'customer.one@example.com',
        password: '123456',
      });
      expect(result.access_token).toBeDefined();
      const calls = (prisma.customer.findFirst as jest.Mock).mock.calls;
      expect(calls.some((c) => c[0].where.email === 'customer.one@example.com')).toBe(
        true,
      );
    });

    it('密码错误统一 401', async () => {
      customerRecord = activeCustomer;
      passwordValid = false;
      await expect(
        service.login({ identifier: 'customer.one', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('status !== enabled 拒绝登录（401）', async () => {
      customerRecord = { ...activeCustomer, status: 'disabled' };
      await expect(
        service.login({ identifier: 'customer.one', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('软删客户（deletedAt 非空）拒绝登录（401）', async () => {
      customerRecord = null; // resolve 阶段即因 deletedAt 过滤查不到
      await expect(
        service.login({ identifier: 'customer.one', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('identifier 无法解析统一 401', async () => {
      await expect(
        service.login({ identifier: 'nobody', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('合法 RT 刷新成功并轮换', async () => {
      customerRecord = activeCustomer;
      (customerTokenService.verifyRefreshToken as jest.Mock).mockResolvedValue({
        customerId: 'customer-uuid-1',
        metadata: { ipAddress: '127.0.0.1' },
      });
      const result = await service.refresh('old-refresh-token');

      expect(result.access_token).toBe('signed-access-token');
      expect(customerTokenService.revokeRefreshToken).toHaveBeenCalledWith(
        'customer-uuid-1',
        'old-refresh-token',
      );
      expect(customerTokenService.storeRefreshToken).toHaveBeenCalled();
    });

    it('无效 RT 返回 401', async () => {
      (customerTokenService.verifyRefreshToken as jest.Mock).mockResolvedValue(
        null,
      );
      await expect(service.refresh('stale-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('已禁用客户返回 401', async () => {
      customerRecord = { ...activeCustomer, status: 'disabled' };
      (customerTokenService.verifyRefreshToken as jest.Mock).mockResolvedValue({
        customerId: 'customer-uuid-1',
        metadata: {},
      });
      await expect(service.refresh('old-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('通过 AT jti 撤销客户会话（纯 Redis）', async () => {
      await service.logout('at-jti-9');
      expect(customerTokenService.revokeByAccessTokenJti).toHaveBeenCalledWith(
        'at-jti-9',
      );
    });

    it('无 jti 时静默跳过', async () => {
      await service.logout();
      expect(customerTokenService.revokeByAccessTokenJti).not.toHaveBeenCalled();
    });
  });
});