import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { CustomerAuthController } from './customer-auth.controller';
import {
  CUSTOMER_AUTH_CONTROLLER_PATH,
  PUBLIC_CUSTOMER_AUTH_ROUTES,
} from './public-routes';

/**
 * 客户认证能力边界契约测试（clarify-customer-registration-scope 3.2/3.3）。
 *
 * 「Mall 不提供自助注册、不提供改密端点」是否定性的产品事实——否定性事实
 * 最容易被无声突破（有人"顺手"加个 @Post('register')），所以把它做成
 * 可执行断言：`/auth` 下已注册路由必须**恰好等于**清单。
 *
 * 若本测试失败：路由集合与清单不一致。若确需开放自助注册/改密，请新立变更
 * `add-customer-self-registration` 并同步更新清单、规格与 ADR，而不是删断言。
 */
interface RegisteredRoute {
  method: string;
  path: string;
}

function collectRegisteredRoutes(): RegisteredRoute[] {
  const proto = CustomerAuthController.prototype as unknown as Record<
    string,
    unknown
  >;
  const routes: RegisteredRoute[] = [];

  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const handlerFn = descriptor?.value;
    // 排除 accessor / 非函数成员（无路由元数据）
    if (typeof handlerFn !== 'function') continue;
    const routePath = Reflect.getMetadata(
      PATH_METADATA,
      handlerFn,
    ) as string | undefined;
    if (routePath === undefined) continue;
    const methodKey = Reflect.getMetadata(
      METHOD_METADATA,
      handlerFn,
    ) as number;
    // RequestMethod 枚举：GET=0, POST=1, PUT=2, DELETE=3, PATCH=4
    const method = ({ 0: 'GET', 1: 'POST', 2: 'PUT', 3: 'DELETE', 4: 'PATCH' } as Record<
      number,
      string
    >)[methodKey];
    const full = `/${CUSTOMER_AUTH_CONTROLLER_PATH}/${routePath}`.replace(/\/+$/, '');
    routes.push({ method, path: full });
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

describe('客户认证能力边界（账号来源仅后台创建与微信静默建号两类）', () => {
  const expected = PUBLIC_CUSTOMER_AUTH_ROUTES.map((r) => ({
    method: r.method,
    path: r.path,
  })).sort((a, b) => a.path.localeCompare(b.path));

  it('/auth 下已注册路由恰好等于公开清单（login/wechat-login/refresh/logout）', () => {
    const actual = collectRegisteredRoutes();
    expect(actual).toEqual(expected);
  });

  it('不存在自助注册端点（POST /auth/register 不在路由集合内）', () => {
    const actual = collectRegisteredRoutes();
    expect(actual).not.toContainEqual(
      expect.objectContaining({ path: '/auth/register' }),
    );
    // 失败信息引导：若确需开放，请新立变更 add-customer-self-registration
    // 并同步更新 public-routes.ts 清单与 customer 规格，而不是删除本断言。
  });

  it('不存在改密类端点（password 相关路由均不在集合内）', () => {
    const actual = collectRegisteredRoutes();
    const passwordRoutes = actual.filter((r) =>
      /password|change-password|reset-password/i.test(r.path),
    );
    expect(passwordRoutes).toEqual([]);
  });
});
