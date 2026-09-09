import { CustomerTokenService } from './customer-token.service';
import {
  SessionStore,
  AUTH_REALM_CUSTOMER,
  AUTH_REALM_USER,
} from '@gvray/core';


function createFakeRedis() {
  const hash = new Map<string, Record<string, string>>();
  const strings = new Map<string, string>();
  const sets = new Map<string, string[]>();

  return {
    redis: {
      hSet: jest.fn(async (key: string, field: string, value: string) => {
        hash.set(key, { ...(hash.get(key) || {}), [field]: value });
        return 1;
      }),
      hGet: jest.fn(async (key: string, field: string) => {
        const h = hash.get(key);
        return h ? h[field] ?? null : null;
      }),
      hGetAll: jest.fn(async (key: string) => hash.get(key) ?? {}),
      get: jest.fn(async (key: string) => strings.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        strings.set(key, value);
        return 'OK';
      }),
      del: jest.fn(async (...keys: string[]) => {
        keys.forEach((k) => {
          hash.delete(k);
          strings.delete(k);
          sets.delete(k);
        });
        return keys.length;
      }),
      expire: jest.fn(async () => 1),
      sAdd: jest.fn(async (key: string, ...m: string[]) => {
        const s = new Set(sets.get(key) || []);
        m.forEach((x) => s.add(x));
        sets.set(key, Array.from(s));
        return m.length;
      }),
      sRem: jest.fn(async (key: string, ...m: string[]) => {
        if (sets.has(key)) {
          const s = new Set(sets.get(key));
          m.forEach((x) => s.delete(x));
          sets.set(key, Array.from(s));
        }
        return m.length;
      }),
      sMembers: jest.fn(async (key: string) => sets.get(key) || []),
      exists: jest.fn(async (key: string) =>
        hash.has(key) || strings.has(key) || sets.has(key) ? 1 : 0,
      ),
      ttl: jest.fn(async () => -1),
      scanIterator: function* (match: string) {
        const keys = Array.from(
          new Set([...hash.keys(), ...strings.keys(), ...sets.keys()]),
        );
        yield keys.filter((k) => k.startsWith(match));
      },
    },
    hash,
    strings,
    sets,
  };
}

describe('CustomerTokenService', () => {
  const customerId = 'customer-uuid-001';

  it('customer 命名空间可正常 store/verify，返回对应 customerId', async () => {
    const fake = createFakeRedis();
    const sessionStore = new SessionStore(fake.redis as any);
    const service = new CustomerTokenService(sessionStore);

    await service.storeRefreshToken(
      customerId,
      'customer-refresh-token',
      { ipAddress: '127.0.0.1', userAgent: 'ua' },
      3600,
      'at-jti-1',
    );

    const verified = await service.verifyRefreshToken('customer-refresh-token');
    expect(verified?.customerId).toBe(customerId);

    // customer 会话 key 不受后台 auth 命名空间影响
    const custKeys = Array.from(fake.hash.keys()).filter((k) =>
      k.startsWith('cust:refresh:'),
    );
    const authKeys = Array.from(fake.hash.keys()).filter((k) =>
      k.startsWith('auth:refresh:'),
    );
    expect(custKeys.length).toBe(1);
    expect(authKeys.length).toBe(0);
  });

  it('与 user（后台）命名空间互不覆盖', async () => {
    const fake = createFakeRedis();
    const sessionStore = new SessionStore(fake.redis as any);

    // 直接通过共享 SessionStore 写入 user（后台）命名空间，模拟后台会话
    //（不 import admin 的 TokenService，域间解耦）
    await sessionStore.store({
      ns: AUTH_REALM_USER,
      subjectId: customerId,
      token: 'backend-refresh-token',
      meta: { ipAddress: '127.0.0.1', userAgent: 'ua' },
      expiresInSeconds: 3600,
      accessTokenJti: 'backend-at-jti',
    });

    // CustomerTokenService 写入 customer 命名空间（同一 subjectId）
    const customer = new CustomerTokenService(sessionStore);
    await customer.storeRefreshToken(
      customerId,
      'customer-refresh-token',
      { ipAddress: '127.0.0.1', userAgent: 'ua' },
      3600,
      'customer-at-jti',
    );

    // 互不串域：customer 服务只能看到 customer 命名空间
    expect(await customer.verifyRefreshToken('backend-refresh-token')).toBeNull();
    expect(await customer.verifyRefreshToken('customer-refresh-token')).not.toBeNull();

    // user 命名空间只能经共享 SessionStore 直接读到，且读不到 customer 的内容
    const userBackend = await sessionStore.verify(
      AUTH_REALM_USER,
      'backend-refresh-token',
    );
    const userCustomer =
      await sessionStore.verify(AUTH_REALM_USER, 'customer-refresh-token');
    expect(userBackend?.subjectId).toBe(customerId);
    expect(userCustomer).toBeNull();
  });

  it('customer 会话无 DB 归档（不依赖 Prisma，撤销为纯 Redis 操作）', async () => {
    const fake = createFakeRedis();
    const sessionStore = new SessionStore(fake.redis as any);
    const service = new CustomerTokenService(sessionStore);

    await service.storeRefreshToken(
      customerId,
      'refresh-1',
      { ipAddress: '127.0.0.1' },
      3600,
    );
    await service.revokeRefreshToken(customerId, 'refresh-1');

    expect(await service.verifyRefreshToken('refresh-1')).toBeNull();
    // revoke 仅清理 Redis，不触碰 refreshToken 表：本服务不注入 Prisma
    expect((service as any).sessionStore).toBe(sessionStore);
  });
});