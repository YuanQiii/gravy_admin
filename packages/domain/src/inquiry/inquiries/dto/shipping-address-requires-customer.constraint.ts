import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
// 仅编译期引用（运行时改由 `args.object` 取形），避免 dto ⇄ 约束文件互相 import 成环
import type { CreateInquiryDto } from './create-inquiry.dto';

/**
 * 跨字段形状前置：**给了收货地址就必须给客户**。
 *
 * 为什么是"形状前置"而不是归属判定：归属（地址属于谁）只有在知道 owner 时才可判定，
 * 真正的判定在服务端事务内的 `assertShippingAddressOwned`（`shipping-address-ownership.ts`）。
 * 这里只拒绝那些**无法判定**的输入——`shippingAddressId` 非空而 `customerId` 为空，
 * 若放行会让 seam 以 `ownerCustomerId = null` 落库，把他人地址挂到无客户单据上。
 *
 * 只挂在管理端 `CreateInquiryDto`：客户自助路径的 `customerId` 恒来自登录态
 * （`CreateCustomerInquiryDto` 不声明该字段），不存在这个形状问题。
 *
 * 注意：`class-validator` 的 `@Validate(...)` 返回的是 **PropertyDecorator**，套在类上
 * 会得到 TS1238（"decorator expects 2 arguments"）。类级约束的正确写法是用
 * `registerDecorator({ target: <类>, propertyName: undefined, validator })` 包一层
 * **类装饰器**——所以这里导出的是 `ShippingAddressRequiresCustomer()` 而不是裸的约束类。
 */
@ValidatorConstraint({ name: 'shippingAddressRequiresCustomer' })
export class ShippingAddressRequiresCustomerConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateInquiryDto;
    return !(dto.shippingAddressId && !dto.customerId);
  }

  defaultMessage(): string {
    return 'SHIPPING_ADDRESS_REQUIRES_CUSTOMER';
  }
}

/** 类装饰器：把上面的约束注册到**类本身**（而不是某个属性）上。 */
export function ShippingAddressRequiresCustomer(
  validationOptions?: ValidationOptions,
): ClassDecorator {
  return (target) => {
    registerDecorator({
      target: target as unknown as new () => unknown,
      // class-validator 把 `propertyName` 标为 `string`，但类级约束的语义正是
      // "不属于任何属性" —— 运行时会因该值为空而把约束挂到类层级，故此处显式断言。
      propertyName: undefined as unknown as string,
      options: validationOptions,
      constraints: [],
      name: 'shippingAddressRequiresCustomer',
      validator: ShippingAddressRequiresCustomerConstraint,
    });
  };
}
