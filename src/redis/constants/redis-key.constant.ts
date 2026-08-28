/** Redis key 前缀由 RedisService 统一拼接，常量中不再硬编码 */
export const REDIS_KEY_PREFIX = '';

/** auth 会话集合前缀：sessionsSet 与线上用户 SCAN 模式同源，避免键模式漂移 */
export const AUTH_SESSIONS_KEY_PREFIX = 'auth:sessions:';

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
