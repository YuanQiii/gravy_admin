import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerTokenService } from './customer-token.service';
import { WechatCode2SessionClient } from './wechat-code2session.client';
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
  let wechatClient: WechatCode2SessionClient;

  let customerRecord: unknown;
  let passwordValid: boolean;
  let openid: string | null;
  let createdCustomer: unknown;
  let createRejection: Error | null;

  beforeEach(async () => {
    customerRecord = null;
    passwordValid = true;
    openid = null;
    createdCustomer = null;
    createRejection = null;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAuthService,
        {
          provide: PrismaService,
          useValue: {
            customer: {
              findFirst: jest.fn(async () => customerRecord),
              findUnique: jest.fn(async () => customerRecord),
              create: jest.fn(async (args: { data: unknown }) => {
                if (createRejection) throw createRejection;
                createdCustomer = args.data;
                return { ...(args.data as object), customerId: 'new-customer-uuid' };
              }),
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
        {
          provide: WechatCode2SessionClient,
          useValue: {
            code2Session: jest.fn(async () => ({ openid: openid || 'wx-openid' })),
          },
        },
      ],
    }).compile();

    service = module.get<CustomerAuthService>(CustomerAuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    customerTokenService = module.get<CustomerTokenService>(CustomerTokenService);
    wechatClient = module.get<WechatCode2SessionClient>(WechatCode2SessionClient);
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

  describe('wechatLogin', () => {
    const wechatCustomer = {
      customerId: 'customer-uuid-1',
      username: 'wx_testopenid0001',
      password: '!wx-login:xxx',
      nickName: '微信用户',
      status: 'enabled',
      deletedAt: null,
      openid: 'wx-openid',
    };

    it('openid 命中既有客户 → 直接登录，复用同一 customerId', async () => {
      customerRecord = wechatCustomer;
      openid = 'wx-openid';
      const result = await service.wechatLogin('js-code');

      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { openid: 'wx-openid' },
      });
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ realm: 'customer', sub: 'customer-uuid-1' }),
        expect.anything(),
      );
      expect(result.access_token).toBe('signed-access-token');
    });

    it('openid 未命中 → 自动建号后登录', async () => {
      openid = 'my-openid-abcdef';
      const result = await service.wechatLogin('js-code');

      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            openid: 'my-openid-abcdef',
            status: 'enabled',
          }),
        }),
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'new-customer-uuid' }),
        expect.anything(),
      );
      expect(customerTokenService.storeRefreshToken).toHaveBeenCalled();
      expect(result.access_token).toBe('signed-access-token');
    });

    it('自动建号使用 bcrypt 占位密码（非明文占位），username 稳定派生', async () => {
      openid = 'my-openid-abcdef';
      await service.wechatLogin('js-code');
      const data = createdCustomer as Record<string, unknown>;
      // 存的是 bcrypt 哈希，不是 '!wx-login:' 明文
      expect(String(data.password)).toMatch(/^\$2[aby]\$/);
      expect(String(data.password)).not.toContain('!wx-login');
      expect(data.username).toBe(`wx_${openid.slice(-12)}`);
    });

    it('微信换取失败 → 401，不建号不发放', async () => {
      (wechatClient.code2Session as jest.Mock).mockRejectedValue(
        new UnauthorizedException('微信登录凭证无效'),
      );
      await expect(service.wechatLogin('bad-code')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('并发首次建号：唯一索引冲突（P2002）时重查并返回既有客户', async () => {
      openid = 'my-openid-abcdef';
      // 模拟 create 抛 P2002，同时 findUnique 命中并发方已建好的客户
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      createRejection = p2002;
      customerRecord = wechatCustomer;
      const result = await service.wechatLogin('js-code');

      // 重查命中并发创建的既有客户，直接登录（复用 customerId 而非 new）
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'customer-uuid-1' }),
        expect.anything(),
      );
      expect(result.access_token).toBe('signed-access-token');
    });

    it('已禁用客户拒绝微信登录（401）', async () => {
      customerRecord = { ...wechatCustomer, status: 'disabled' };
      openid = 'wx-openid';
      await expect(service.wechatLogin('js-code')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(customerTokenService.storeRefreshToken).not.toHaveBeenCalled();
    });

    it('软删客户拒绝微信登录（401）', async () => {
      customerRecord = { ...wechatCustomer, deletedAt: new Date() };
      openid = 'wx-openid';
      await expect(service.wechatLogin('js-code')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('wechat 建号客户无法账密登录', () => {
    it('持有人造 bcrypt 占位哈希的客户，用密码 login 返回 401', async () => {
      // 微信自动建号落库的是随机秘钥的 bcrypt 哈希；真实 bcrypt.compare 对该
      // 未知明文返回 false → 账密登录统一 401
      const placeholderHash = await bcrypt.hash('!wx-login:random-secret', 4);
      customerRecord = {
        customerId: 'customer-uuid-wx',
        username: 'wx_someopenid12',
        password: placeholderHash,
        status: 'enabled',
        deletedAt: null,
      };
      passwordValid = false; // compare 结果 = false（未知明文）
      await expect(
        service.login({ identifier: 'wx_someopenid12', password: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(customerTokenService.storeRefreshToken).not.toHaveBeenCalled();
    });
  });
});