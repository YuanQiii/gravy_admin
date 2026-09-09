/** Redis key 前缀由 RedisService 统一拼接，常量中不再硬编码 */
export const REDIS_KEY_PREFIX = '';

/** auth 会话集合前缀：sessionsSet 与线上用户 SCAN 模式同源，避免键模式漂移 */
export const AUTH_SESSIONS_KEY_PREFIX = 'auth:sessions:';

/** 客户会话集合前缀：与后台 `auth:sessions:` 隔离，避免两域 key 相互覆盖 */
export const CUSTOMER_SESSIONS_KEY_PREFIX = 'cust:sessions:';

/**
 * 按认证域命名空间派生的会话 key 前缀。
 * `user` 沿用后台既有前缀（行为与历史逐字节等价），`customer` 使用独立前缀。
 * `SessionStore` 据此在纯 Redis 层做两域会话隔离，不污染后台现有 key。
 */
export const REDIS_SESSION_NAMESPACE: Record<
  'user' | 'customer',
  { keyPrefix: string; sessionsPrefix: string }
> = {
  user: { keyPrefix: 'auth', sessionsPrefix: AUTH_SESSIONS_KEY_PREFIX },
  customer: { keyPrefix: 'cust', sessionsPrefix: CUSTOMER_SESSIONS_KEY_PREFIX },
};

export const RedisKeys = {
  auth: {
    refreshToken: (userId: string, tokenHash: string) =>
      `auth:refresh:${userId}:${tokenHash}`,
    session: (userId: string, tokenHash: string) =>
      `auth:session:${userId}:${tokenHash}`,
    sessionsSet: (userId: string) => `${AUTH_SESSIONS_KEY_PREFIX}${userId}`,
    loginFail: (account: string) => `auth:login:fail:${account}`,
    atJtiMap: (jti: string) => `auth:at-jti:${jti}`, // AT jti → userId:tokenHash
    rtIndex: (tokenHash: string) => `auth:rt-index:${tokenHash}`, // tokenHash → userId
  },
  // 预留：后续 configs/dicts 等场景复用
  system: {
    config: 'sys:config:runtime',
    feature: (key: string) => `sys:feature:${key}`,
    dict: (typeCode: string) => `sys:dict:${typeCode}`,
  },
} as const;
