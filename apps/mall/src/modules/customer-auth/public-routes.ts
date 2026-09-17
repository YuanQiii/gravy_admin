/**
 * 客户认证公开路由清单（clarify-customer-registration-scope 3.1）——
 * 「Mall 客户认证能力边界」的单一来源。
 *
 * 账号来源仅两类：后台管理员创建（admin customers 模块）与微信静默登录
 * 自动建号（wechat-login）。**Mall 不提供自助注册，也不提供改密端点**——
 * 该否定性契约由 `customer-auth.routes.spec.ts` 的表驱动测试强制：
 * `/auth` 下已注册路由必须**恰好等于**本清单。
 *
 * 若产品确需开放自助注册：新立变更 `add-customer-self-registration`
 * （前置条件见 derive 变更的 design：密码策略、验证方式、注册限流、
 * 409 语义），同时更新本清单与规格。
 */
export const CUSTOMER_AUTH_CONTROLLER_PATH = 'auth';

export const PUBLIC_CUSTOMER_AUTH_ROUTES: ReadonlyArray<{
  method: 'POST';
  path: string;
}> = [
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/wechat-login' },
  { method: 'POST', path: '/auth/refresh' },
  { method: 'POST', path: '/auth/logout' },
] as const;
