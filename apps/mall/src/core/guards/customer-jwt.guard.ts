import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  AVAILABILITY_GATE,
  AvailabilityGate,
} from '../customer-availability/customer-availability.policy';

/**
 * B2C 客户路由守卫：包装客户 JWT 策略（`customer-jwt`）。
 *
 * passport 将校验后的身份放在 `request.user`，此处再复制到 `request.customer`，
 * 供 `@CurrentCustomer()` 读取。
 *
 * `AvailabilityGate` 是守卫边界上预置的适配 seam：TTL 内客户可用性断言点。
 * 当前注入 no-op implementation（政策：TTL 内不校验，见 ADR 0011 统一注记
 * 与 `CustomerAvailabilityPolicy`）；未来切换守卫层缓存校验路线时替换该
 * provider 即可，本守卫与各写路径无需改动。
 */
@Injectable()
export class CustomerJwtGuard extends AuthGuard('customer-jwt') {
  constructor(
    @Inject(AVAILABILITY_GATE)
    private readonly availabilityGate: AvailabilityGate,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    request.customer = request.user;
    await this.availabilityGate.assertWithinTtl(request.customer?.customerId);
    return result;
  }
}
