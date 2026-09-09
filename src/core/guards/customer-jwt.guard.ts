import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * B2C 客户路由守卫：包装客户 JWT 策略（`customer-jwt`）。
 *
 * passport 将校验后的身份放在 `request.user`，此处再复制到 `request.customer`，
 * 供 `@CurrentCustomer()` 读取。
 */
@Injectable()
export class CustomerJwtGuard extends AuthGuard('customer-jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    request.customer = request.user;
    return result;
  }
}