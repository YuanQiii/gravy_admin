import { RedisService } from '../../src/redis/redis.service';

interface StoredValue {
  value: string;
  expiresAt: number | null; // 毫秒时间戳，null 表示永不过期
}

/**
 * 基于内存 Map 的 RedisService mock，实现了 RedisService 的完整公开方法。
 * 语义与真实 Redis 对齐（TTL 过期、NX、incr 等），适合 e2e 场景下
 * 不依赖真实 Redis 跑通认证/缓存/会话相关流程。
 *
 * 用法：
 *   const redis = createInMemoryRedisService();
 *   await redis.set('key', 'value', { ttlSeconds: 60 });
 *   redis.__clear(); // 重置内存数据
 */
export function createInMemoryRedisService(): RedisService & {
  __store: Map<string, StoredValue>;
  __clear(): void;
} {
  const store = new Map<string, StoredValue>();

  const isExpired = (entry: StoredValue): boolean =>
    entry.expiresAt !== null && entry.expiresAt <= Date.now();

  const getLive = (key: string): StoredValue | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (isExpired(entry)) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  const service = {
    __store: store,
    __clear: () => store.clear(),

    onModuleInit: () => Promise.resolve(),
    onModuleDestroy: () => Promise.resolve(),
    isAvailable: () => true,
    ping: () => Promise.resolve(true),

    get: async (key: string) => getLive(key)?.value ?? null,

    set: async (
      key: string,
      value: string,
      options?: { ttlSeconds?: number; nx?: boolean },
    ): Promise<string | null> => {
      const existing = getLive(key);
      if (options?.nx && existing) return null;
      store.set(key, {
        value,
        expiresAt: options?.ttlSeconds
          ? Date.now() + options.ttlSeconds * 1000
          : null,
      });
      return 'OK';
    },

    del: async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return count;
    },

    ttl: async (key: string) => {
      const entry = getLive(key);
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },

    expire: async (key: string, seconds: number) => {
      const entry = getLive(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },

    exists: async (key: string) => (getLive(key) ? 1 : 0),

    incr: async (key: string) => {
      const entry = getLive(key);
      const next = Number(entry?.value ?? 0) + 1;
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },

    incrBy: async (key: string, increment: number) => {
      const entry = getLive(key);
      const next = Number(entry?.value ?? 0) + increment;
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },

    decr: async (key: string) => {
      const entry = getLive(key);
      const next = Number(entry?.value ?? 0) - 1;
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },

    decrBy: async (key: string, decrement: number) => {
      const entry = getLive(key);
      const next = Number(entry?.value ?? 0) - decrement;
      store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    },

    hGet: async (key: string, field: string) => {
      const entry = getLive(key);
      if (!entry) return null;
      try {
        const hash = JSON.parse(entry.value) as Record<string, string>;
        return hash[field] ?? null;
      } catch {
        return null;
      }
    },

    hGetAll: async (key: string) => {
      const entry = getLive(key);
      if (!entry) return {};
      try {
        return JSON.parse(entry.value) as Record<string, string>;
      } catch {
        return {};
      }
    },

    hSet: async (key: string, field: string, value: string) => {
      const entry = getLive(key);
      const hash: Record<string, string> = entry
        ? JSON.parse(entry.value || '{}')
        : {};
      hash[field] = value;
      store.set(key, { value: JSON.stringify(hash), expiresAt: entry?.expiresAt ?? null });
      return 1;
    },

    hDel: async (key: string, ...fields: string[]) => {
      const entry = getLive(key);
      if (!entry) return 0;
      const hash = JSON.parse(entry.value || '{}') as Record<string, string>;
      let count = 0;
      for (const field of fields) {
        if (field in hash) {
          delete hash[field];
          count++;
        }
      }
      store.set(key, { value: JSON.stringify(hash), expiresAt: entry.expiresAt });
      return count;
    },

    sAdd: async (key: string, ...members: string[]) => {
      const entry = getLive(key);
      const set = new Set<string>(
        entry ? (JSON.parse(entry.value || '[]') as string[]) : [],
      );
      let count = 0;
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member);
          count++;
        }
      }
      store.set(key, {
        value: JSON.stringify([...set]),
        expiresAt: entry?.expiresAt ?? null,
      });
      return count;
    },

    sRem: async (key: string, ...members: string[]) => {
      const entry = getLive(key);
      if (!entry) return 0;
      const set = new Set<string>(JSON.parse(entry.value || '[]') as string[]);
      let count = 0;
      for (const member of members) {
        if (set.delete(member)) count++;
      }
      store.set(key, {
        value: JSON.stringify([...set]),
        expiresAt: entry.expiresAt,
      });
      return count;
    },

    sMembers: async (key: string) => {
      const entry = getLive(key);
      if (!entry) return [];
      return JSON.parse(entry.value || '[]') as string[];
    },

    zAdd: async (key: string, score: number, member: string) => {
      const entry = getLive(key);
      const zset = entry
        ? (JSON.parse(entry.value || '[]') as { score: number; value: string }[])
        : [];
      zset.push({ score, value: member });
      store.set(key, {
        value: JSON.stringify(zset),
        expiresAt: entry?.expiresAt ?? null,
      });
      return 1;
    },

    zRange: async (key: string, start: number, stop: number) => {
      const entry = getLive(key);
      if (!entry) return [];
      const zset = (
        JSON.parse(entry.value || '[]') as { score: number; value: string }[]
      ).sort((a, b) => a.score - b.score);
      const len = zset.length;
      const from = start < 0 ? len + start : start;
      const to = stop < 0 ? len + stop : stop;
      return zset.slice(Math.max(from, 0), to + 1).map((item) => item.value);
    },

    mGet: async (keys: string[]) =>
      keys.map((key) => getLive(key)?.value ?? null),

    eval: async () => null,

    scanIterator: async function* (
      match: string,
      _count = 100,
    ): AsyncGenerator<string[]> {
      // 简化实现：将 glob 通配符转换为正则
      const regex = new RegExp(
        '^' + match.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      const keys = [...store.keys()].filter((key) => regex.test(key));
      if (keys.length > 0) yield keys;
    },

    dbSize: async () => store.size,
    info: async () => '',
    type: async (key: string) => (getLive(key) ? 'string' : 'none'),
  };

  return service as unknown as ReturnType<typeof createInMemoryRedisService>;
}
