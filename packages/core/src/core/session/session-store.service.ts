import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService, RedisUnavailableError } from '../../redis/redis.service';
import { REDIS_SESSION_NAMESPACE } from '../../redis/constants/redis-key.constant';
import { AuthRealm } from '../../core/constants/auth-realm.constant';

/**
 * 纯 Redis 会话存储（深接缝）。
 *
 * 这是所有会话逻辑的唯一落点，**不知道** User/Customer、不碰 Prisma：
 * 只对通用 `subjectId` + `token` + 元信息 + **命名空间(ns)** 操作 Redis。
 *
 * key 按构造注入的命名空间（由 `REDIS_SESSION_NAMESPACE` 派生）隔离：
 * - `user` 命名空间沿用后台既有前缀（`auth:/auth:sessions:`），与历史行为逐字节等价；
 * - `customer` 命名空间使用独立前缀（`cust:/cust:sessions:`），两域互不覆盖。
 *
 * Redis 不可用时降级行为与后台 TokenService 现状一致：warn 并跳过，不抛出。
 */
@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(private readonly redisService: RedisService) {}

  // ===== 写入 =====

  /**
   * 存储一条 refresh token 会话：写入 hash（含元信息）、tokenHash 反向索引、
   * at-jti 反向索引，并加入 sessionsSet 集合，统一设置 TTL。
   */
  async store(params: {
    ns: AuthRealm;
    subjectId: string;
    token: string;
    meta: SessionMeta;
    expiresInSeconds: number;
    accessTokenJti?: string;
  }): Promise<void> {
    const { ns, subjectId, token, meta, expiresInSeconds, accessTokenJti } =
      params;
    const keys = this.keys(ns);
    const tokenHash = this.hashToken(token);
    const now = new Date().toISOString();

    try {
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'userAgent',
        meta.userAgent || '',
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'ipAddress',
        meta.ipAddress || '',
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'browser',
        meta.browser || '',
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'os',
        meta.os || '',
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'device',
        meta.device || '',
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'location',
        meta.location || '',
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'createdAt',
        now,
      );
      await this.redisService.hSet(
        keys.refreshToken(subjectId, tokenHash),
        'lastActiveAt',
        now,
      );
      if (accessTokenJti) {
        await this.redisService.hSet(
          keys.refreshToken(subjectId, tokenHash),
          'accessTokenJti',
          accessTokenJti,
        );
      }
      await this.redisService.expire(
        keys.refreshToken(subjectId, tokenHash),
        expiresInSeconds,
      );

      // tokenHash → subjectId 索引（纯 Redis 验证 RT 用）
      await this.redisService.set(keys.rtIndex(tokenHash), subjectId, {
        ttlSeconds: expiresInSeconds,
      });

      // AT jti → subjectId:tokenHash 反向索引（logout 时定位 RT）
      if (accessTokenJti) {
        await this.redisService.set(
          keys.atJtiMap(accessTokenJti),
          `${subjectId}:${tokenHash}`,
          { ttlSeconds: expiresInSeconds },
        );
      }

      // 加入会话集合，同步设置 TTL（与 RT 一致）
      await this.redisService.sAdd(
        keys.sessionsSet(subjectId),
        tokenHash,
      );
      await this.redisService.expire(
        keys.sessionsSet(subjectId),
        expiresInSeconds,
      );
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        this.logger.warn('Redis unavailable, skipping RT cache');
        return;
      }
      throw e;
    }
  }

  // ===== 验证 =====

  /**
   * 纯 Redis 验证 refresh token：先查 tokenHash → subjectId 索引，再读 hash。
   * 任一环节缺失即认为会话已失效。
   */
  async verify(
    ns: AuthRealm,
    token: string,
  ): Promise<SessionVerifyResult | null> {
    const keys = this.keys(ns);
    const tokenHash = this.hashToken(token);

    try {
      const subjectId = await this.redisService.get(keys.rtIndex(tokenHash));
      if (!subjectId) return null;

      const hash = await this.redisService.hGetAll(
        keys.refreshToken(subjectId, tokenHash),
      );
      if (Object.keys(hash).length === 0) {
        // key 不存在 → 会话已过期/被清理
        return null;
      }

      return {
        subjectId,
        meta: {
          userAgent: hash.userAgent || undefined,
          ipAddress: hash.ipAddress || undefined,
        },
      };
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        this.logger.warn('[RT Verify] Redis unavailable');
        return null;
      }
      throw e;
    }
  }

  // ===== 撤销 =====

  /**
   * 按 refresh token 撤销一条会话（同时清理 at-jti 反向索引与 sessionsSet 成员）。
   */
  async revoke(
    ns: AuthRealm,
    subjectId: string,
    token: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.revokeByHash(ns, subjectId, tokenHash);
  }

  /** 按 tokenHash 撤销一条会话 */
  async revokeByHash(
    ns: AuthRealm,
    subjectId: string,
    tokenHash: string,
  ): Promise<void> {
    const keys = this.keys(ns);
    try {
      const jti = await this.redisService.hGet(
        keys.refreshToken(subjectId, tokenHash),
        'accessTokenJti',
      );
      if (jti) {
        await this.redisService.del(keys.atJtiMap(jti));
      }

      await this.redisService.del(keys.refreshToken(subjectId, tokenHash));
      await this.redisService.del(keys.rtIndex(tokenHash));
      await this.redisService.sRem(keys.sessionsSet(subjectId), tokenHash);
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        this.logger.warn('Redis unavailable, skipping RT revocation cache');
      }
    }
  }

  /** 通过 Access Token JTI 撤销对应会话（logout 时用） */
  async revokeByJti(ns: AuthRealm, jti: string): Promise<void> {
    const keys = this.keys(ns);
    try {
      const mapping = await this.redisService.get(keys.atJtiMap(jti));
      if (!mapping) return;

      const [subjectId, tokenHash] = mapping.split(':');
      if (subjectId && tokenHash) {
        await this.revokeByHash(ns, subjectId, tokenHash);
      }
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        this.logger.warn('Redis unavailable, skipping revoke by AT jti');
      }
    }
  }

  /** 批量撤销某一身份的全部会话（可保留指定 tokenHash，如刷新时的当前会话） */
  async revokeAll(
    ns: AuthRealm,
    subjectId: string,
    exceptTokenHash?: string,
  ): Promise<void> {
    const keys = this.keys(ns);
    try {
      const sessionKey = keys.sessionsSet(subjectId);
      const tokenHashes = await this.redisService.sMembers(sessionKey);

      for (const hash of tokenHashes) {
        if (exceptTokenHash && hash === exceptTokenHash) continue;
        await this.redisService.del(keys.refreshToken(subjectId, hash));
      }

      if (exceptTokenHash) {
        // 只保留 exceptTokenHash
        await this.redisService.del(sessionKey);
        await this.redisService.sAdd(sessionKey, exceptTokenHash);
      } else {
        await this.redisService.del(sessionKey);
      }
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        this.logger.warn('Redis unavailable, skipping bulk revocation cache');
      }
    }
  }

  // ===== 会话查询 =====

  /** 心跳更新：通过 AT jti 查反向索引，更新最后活跃时间（只更新已存在会话） */
  async touchByJti(ns: AuthRealm, jti: string): Promise<void> {
    const keys = this.keys(ns);
    try {
      const mapping = await this.redisService.get(keys.atJtiMap(jti));
      if (!mapping) return;

      const [subjectId, tokenHash] = mapping.split(':');
      if (!subjectId || !tokenHash) return;

      const sessionKey = keys.refreshToken(subjectId, tokenHash);
      const sessionSetKey = keys.sessionsSet(subjectId);

      const exists = await this.redisService.exists(sessionKey);
      if (exists === 0) return;

      await this.redisService.hSet(
        sessionKey,
        'lastActiveAt',
        new Date().toISOString(),
      );
      const sessionTtl = await this.redisService.ttl(sessionKey);
      if (sessionTtl === -1) {
        await this.redisService.expire(sessionKey, 7 * 24 * 60 * 60);
      }
      const setTtl = await this.redisService.ttl(sessionSetKey);
      if (setTtl === -1) {
        await this.redisService.expire(sessionSetKey, 7 * 24 * 60 * 60);
      }
    } catch (e) {
      if (e instanceof RedisUnavailableError) return;
      throw e;
    }
  }

  /** 获取某一身份的全部会话记录（含迟到清理失效引用） */
  async getSessions(
    ns: AuthRealm,
    subjectId: string,
  ): Promise<StoredSession[]> {
    const keys = this.keys(ns);
    try {
      const sessionSetKey = keys.sessionsSet(subjectId);
      const tokenHashes = await this.redisService.sMembers(sessionSetKey);

      const sessions: StoredSession[] = [];
      for (const hash of tokenHashes) {
        const hashData = await this.redisService.hGetAll(
          keys.refreshToken(subjectId, hash),
        );
        if (Object.keys(hashData).length > 0) {
          sessions.push({
            subjectId,
            tokenHash: hash,
            ipAddress: hashData.ipAddress || undefined,
            browser: hashData.browser || undefined,
            os: hashData.os || undefined,
            device: hashData.device || undefined,
            location: hashData.location || undefined,
            createdAt: hashData.createdAt || new Date().toISOString(),
            lastActiveAt:
              hashData.lastActiveAt ||
              hashData.createdAt ||
              new Date().toISOString(),
          });
        } else {
          // 防御性清理：hash 已不存在但 sessionsSet 里还有引用，自动移除
          await this.redisService.sRem(sessionSetKey, hash);
          this.logger.debug(
            `[Session Cleanup] 移除失效引用: ${sessionSetKey} → ${hash}`,
          );
        }
      }
      return sessions;
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        return []; // 降级：返回空列表
      }
      throw e;
    }
  }

  /** SCAN 全量收集某一命名空间下的在线身份 ID（用于在线用户列表） */
  async getAllSubjectIds(ns: AuthRealm): Promise<string[]> {
    const sessionsPrefix = REDIS_SESSION_NAMESPACE[ns].sessionsPrefix;
    try {
      const ids = new Set<string>();
      for await (const keys of this.redisService.scanIterator(
        `${sessionsPrefix}*`,
      )) {
        for (const key of keys) {
          const parts = key.split(':');
          if (parts.length >= 3) {
            ids.add(parts[2]);
          }
        }
      }
      return Array.from(ids);
    } catch (e) {
      if (e instanceof RedisUnavailableError) {
        return [];
      }
      throw e;
    }
  }

  // ===== 工具方法 =====

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  }

  /** 按命名空间派生会话 key 构造器 */
  private keys(ns: AuthRealm) {
    const nsConfig = REDIS_SESSION_NAMESPACE[ns];
    return {
      refreshToken: (subjectId: string, tokenHash: string) =>
        `${nsConfig.keyPrefix}:refresh:${subjectId}:${tokenHash}`,
      atJtiMap: (jti: string) => `${nsConfig.keyPrefix}:at-jti:${jti}`,
      rtIndex: (tokenHash: string) =>
        `${nsConfig.keyPrefix}:rt-index:${tokenHash}`,
      sessionsSet: (subjectId: string) => `${nsConfig.sessionsPrefix}${subjectId}`,
    };
  }
}

/** 会话 hash 中的元信息（与用户/客户实体无关，纯会话关注点） */
export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  location?: string;
}

/** 验证成功返回：通用 subjectId + 基础元信息 */
export interface SessionVerifyResult {
  subjectId: string;
  meta: SessionMeta;
}

/** 一条会话记录（同后台在线会话视图，含 IPC 解析缓冲信息） */
export interface StoredSession {
  subjectId: string;
  tokenHash: string;
  ipAddress?: string;
  browser?: string;
  os?: string;
  device?: string;
  location?: string;
  createdAt: string;
  lastActiveAt: string;
}