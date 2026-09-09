import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ICustomer } from '../interfaces/customer.interface';

/**
 * 从 `CustomerJwtGuard` 注入的 `request.customer` 中取出当前客户身份。
 */
export const CurrentCustomer = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ICustomer | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.customer;
  },
);