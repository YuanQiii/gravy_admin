import { SessionStore, SessionMeta } from './session-store.service';
import { RedisUnavailableError } from '@/redis/redis.service';
import { AUTH_REALM_USER, AUTH_REALM_CUSTOMER } from '@/core/constants/auth-realm.constant';

/**
 * 内存 Redis 假实现，覆盖 SessionStore 用到的全部原语，并记录 key 便于断言隔离。
 */
function createFakeRedis() {
  const hash = new Map<string, Record<string, string>>();
  const strings = new Map<string, string>();
  const sets = new Map<string, string[]>();
  const hashKeys: string[] = [];

  const redis = {
    hSet: jest.fn(async (key: string, field: string, value: string) => {
      hash.set(key, { ...(hash.get(key) || {}), [field]: value });
      hashKeys.push(key);
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
    sAdd: jest.fn(async (key: string, ...members: string[]) => {
      const s = new Set(sets.get(key) || []);
      members.forEach((m) => s.add(m));
      sets.set(key, Array.from(s));
      return members.length;
    }),
    sRem: jest.fn(async (key: string, ...members: string[]) => {
      if (sets.has(key)) {
        const s = new Set(sets.get(key));
        members.forEach((m) => s.delete(m));
        sets.set(key, Array.from(s));
      }
      return members.length;
    }),
    sMembers: jest.fn(async (key: string) => sets.get(key) || []),
    exists: jest.fn(async (key: string) =>
      hash.has(key) || strings.has(key) || sets.has(key) ? 1 : 0,
    ),
    ttl: jest.fn(async () => -1),
    scanIterator: function* (match: string) {
      const re = new RegExp(
        '^' + match.split('*').map(escapeRe).join('.*') + '$',
      );
      const keys = Array.from(
        new Set([...hash.keys(), ...strings.keys(), ...sets.keys()]),
      );
      yield keys.filter((k) => re.test(k));
    },
  };

  function escapeRe(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return { redis, hash, strings, sets, hashKeys };
}

describe('SessionStore', () => {
  let store: SessionStore;
  let fake: ReturnType<typeof createFakeRedis>;
  const subjectId = 'shared-subject-uuid';

  beforeEach(() => {
    fake = createFakeRedis();
    store = new SessionStore(fake.redis as any);
  });

  const meta: SessionMeta = {
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
  };

  it('user 与 customer 命名空间 key 隔离、互不覆盖', async () => {
    await store.store({
      ns: AUTH_REALM_USER,
      subjectId,
      token: 'user-refresh-token',
      meta,
      expiresInSeconds: 3600,
      accessTokenJti: 'at-jti-user',
    });
    await store.store({
      ns: AUTH_REALM_CUSTOMER,
      subjectId,
      token: 'customer-refresh-token',
      meta,
      expiresInSeconds: 3600,
      accessTokenJti: 'at-jti-customer',
    });

    // 同一 subject 分别写入 user 与 customer：对应 hash key 前缀互不相同
    const userHashKeys = fake.hashKeys.filter((k) => k.startsWith('auth:refresh:'));
    const customerHashKeys = fake.hashKeys.filter((k) =>
      k.startsWith('cust:refresh:'),
    );
    expect(userHashKeys.length).toBeGreaterThan(0);
    expect(customerHashKeys.length).toBeGreaterThan(0);
    // 两个命名空间的 key 完全不相交
    const overlap = userHashKeys.some((k) => customerHashKeys.includes(k));
    expect(overlap).toBe(false);

    // sessionsSet 前缀同样隔离
    const userSetKeys = Array.from(fake.sets.keys()).filter((k) =>
      k.startsWith('auth:sessions:'),
    );
    const customerSetKeys = Array.from(fake.sets.keys()).filter((k) =>
      k.startsWith('cust:sessions:'),
    );
    expect(userSetKeys).toContain(`auth:sessions:${subjectId}`);
    expect(customerSetKeys).toContain(`cust:sessions:${subjectId}`);
  });

  it('verify 在各自命名空间下可解析出对应 subjectId', async () => {
    await store.store({
      ns: AUTH_REALM_USER,
      subjectId,
      token: 'user-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });
    await store.store({
      ns: AUTH_REALM_CUSTOMER,
      subjectId,
      token: 'customer-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });

    const userVerified = await store.verify(AUTH_REALM_USER, 'user-refresh-token');
    const customerVerified = await store.verify(
      AUTH_REALM_CUSTOMER,
      'customer-refresh-token',
    );
    expect(userVerified?.subjectId).toBe(subjectId);
    expect(customerVerified?.subjectId).toBe(subjectId);
    // 两域 token 互不可串：user 域查不到 customer 的 RT，反之亦然
    expect(await store.verify(AUTH_REALM_USER, 'customer-refresh-token')).toBeNull();
    expect(
      await store.verify(AUTH_REALM_CUSTOMER, 'user-refresh-token'),
    ).toBeNull();
  });

  it('撤销一个命名空间的会话不影响另一命名空间', async () => {
    await store.store({
      ns: AUTH_REALM_USER,
      subjectId,
      token: 'user-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });
    await store.store({
      ns: AUTH_REALM_CUSTOMER,
      subjectId,
      token: 'customer-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });

    await store.revoke(AUTH_REALM_USER, subjectId, 'user-refresh-token');

    expect(await store.verify(AUTH_REALM_USER, 'user-refresh-token')).toBeNull();
    // customer 域会话不受影响
    expect(
      await store.verify(AUTH_REALM_CUSTOMER, 'customer-refresh-token'),
    ).not.toBeNull();
  });

  it('revokeAll 仅清理当前命名空间的会话', async () => {
    await store.store({
      ns: AUTH_REALM_USER,
      subjectId,
      token: 'user-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });
    await store.store({
      ns: AUTH_REALM_CUSTOMER,
      subjectId,
      token: 'customer-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });

    await store.revokeAll(AUTH_REALM_USER, subjectId);

    expect(
      await store.getAllSubjectIds(AUTH_REALM_USER),
    ).toEqual([]);
    expect(await store.getAllSubjectIds(AUTH_REALM_CUSTOMER)).toEqual([
      subjectId,
    ]);
  });

  it('getAllSubjectIds 分别收集各自命名空间的在线 identity', async () => {
    await store.store({
      ns: AUTH_REALM_CUSTOMER,
      subjectId,
      token: 'customer-refresh-token',
      meta,
      expiresInSeconds: 3600,
    });
    expect(await store.getAllSubjectIds(AUTH_REALM_CUSTOMER)).toEqual([
      subjectId,
    ]);
    expect(await store.getAllSubjectIds(AUTH_REALM_USER)).toEqual([]);
  });

  it('store 遇 RedisUnavailableError 时 warn 并跳过，不抛出', async () => {
    const failingRedis = {
      hSet: jest.fn(async () => {
        throw new RedisUnavailableError('down');
      }),
    };
    const failingStore = new SessionStore(failingRedis as any);

    await expect(
      failingStore.store({
        ns: AUTH_REALM_CUSTOMER,
        subjectId,
        token: 'tok',
        meta,
        expiresInSeconds: 3600,
      }),
    ).resolves.toBeUndefined();
  });

  it('verify 遇 RedisUnavailableError 时降级返回 null', async () => {
    const failingRedis = {
      get: jest.fn(async () => {
        throw new RedisUnavailableError('down');
      }),
    };
    const failingStore = new SessionStore(failingRedis as any);

    expect(await failingStore.verify(AUTH_REALM_CUSTOMER, 'tok')).toBeNull();
  });
});