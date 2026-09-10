import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * B2C「当前客户（可选）」守卫：复用 `customer-jwt` 策略，但对匿名/无效 token
 * 一律放行而非 401（用于"公开但可识别登录客户"的端点，如滤清器详情浏览）。
 *
 * - 携带且可校验通过、`realm==='customer'` → 注入 `request.customer = request.user`；
 * - 无 Bearer / token 无效 / 非 customer realm → 按匿名处理，不注入、不 401。
 *
 * realm 互斥判据仍由 `CustomerJwtStrategy.validate` 单一拥有，本守卫不开第三条鉴权路径。
 * 与 `CustomerJwtGuard` 是同策略的第二个 adapter（必须放行匿名）。
 */
@Injectable()
export class OptionalCustomerGuard extends AuthGuard('customer-jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    try {
      await super.canActivate(context);
    } catch {
      // 匿名 / 坏 token / 非 customer realm：放行，但不注入身份
      request.customer = undefined;
      return true;
    }
    request.customer = request.user;
    return true;
  }
}