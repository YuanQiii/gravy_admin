import * as crypto from 'crypto';

/**
 * 微信客户身份派生纯函数（mall customer-auth 模块内，不入 @gvray/domain）。
 *
 * 保持纯：不查库、无副作用，便于直测；DB 判重与迭代由 service 编排。
 */

const USERNAME_PREFIX = 'wx_';

function tail(openid: string, length: number): string {
  return openid.slice(-length);
}

function hash8(openid: string): string {
  return crypto.createHash('sha1').update(openid).digest('hex').slice(0, 8);
}

/**
 * 按序产出 `username` 候选序列，service 逐个试 `findUnique`。
 * - `wx_<openid 后 12 位>`：默认、可读、稳定；
 * - `wx_<openid 后 24 位>`：默认位被占时追加更多；
 * - `wx_<openid 短 hash8>`：兜底，宇宙级碰撞概率。
 */
export function wechatUsernameCandidates(openid: string): string[] {
  return [
    `${USERNAME_PREFIX}${tail(openid, 12)}`,
    `${USERNAME_PREFIX}${tail(openid, 24)}`,
    `${USERNAME_PREFIX}${hash8(openid)}`,
  ];
}

/**
 * 不可用账密登录的占位密码：`!wx-login:` + 随机字节 hex。
 * bcrypt 校验此类明文天然失败 → 该客户无法经 `POST /auth/login` 用密码登录；
 * 保持 `Customer.password` 列非空、零 schema 迁移。
 */
export function wechatPlaceholderPassword(): string {
  return `!wx-login:${crypto.randomBytes(32).toString('hex')}`;
}