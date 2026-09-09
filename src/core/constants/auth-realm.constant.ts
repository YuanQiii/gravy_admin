/**
 * 认证域（realm）声明常量。
 *
 * 后台 `User` 与 B2C `Customer` 各成独立 JWT 认证域，token payload 携带
 * `realm` 声明作为二者互斥的最后一道闸：后台 `JwtStrategy` 拒绝
 * `realm === 'customer'` 的 token，客户 `CustomerJwtStrategy` 要求
 * `realm === 'customer'`。两套策略/守卫共享此常量，避免笔误导致误放行。
 */
export const AUTH_REALMS = ['user', 'customer'] as const;

export type AuthRealm = (typeof AUTH_REALMS)[number];

export const AUTH_REALM_USER: AuthRealm = 'user';
export const AUTH_REALM_CUSTOMER: AuthRealm = 'customer';

/** 判断 payload.realm 是否为客户域 */
export const isCustomerRealm = (realm: unknown): realm is 'customer' =>
  realm === AUTH_REALM_CUSTOMER;