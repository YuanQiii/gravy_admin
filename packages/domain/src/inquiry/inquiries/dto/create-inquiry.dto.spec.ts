import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerInquiryDto } from './customer-b2c/create-customer-inquiry.dto';
import { CreateInquiryDto } from './create-inquiry.dto';

/**
 * 类级跨字段约束的单测（`ShippingAddressRequiresCustomerConstraint`）。
 *
 * 断言打在 class-validator 的 `validate()` 上 —— 这正是 Nest `ValidationPipe` 内部走的
 * 那一步，因此这里通过即代表 HTTP 层会 400（e2e 另有一条端到端确认）。
 */
const validateDto = async (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateInquiryDto, payload));

describe('CreateInquiryDto 跨字段约束：有地址就必须有客户', () => {
  it('仅传 shippingAddressId（无 customerId）→ 校验失败，错误码 SHIPPING_ADDRESS_REQUIRES_CUSTOMER', async () => {
    const errors = await validateDto({
      title: '代客下单',
      shippingAddressId: 'addr-1',
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toMatchObject({
      shippingAddressRequiresCustomer: 'SHIPPING_ADDRESS_REQUIRES_CUSTOMER',
    });
  });

  it('shippingAddressId 与 customerId 同时提供 → 通过', async () => {
    const errors = await validateDto({
      title: '代客下单',
      customerId: 'cust-A',
      shippingAddressId: 'addr-1',
    });

    expect(errors).toHaveLength(0);
  });

  it('两者都不提供（匿名询价）→ 通过', async () => {
    const errors = await validateDto({
      title: '匿名询价',
      customerName: '路人',
    });

    expect(errors).toHaveLength(0);
  });

  it('只传 customerId（不选地址）→ 通过', async () => {
    const errors = await validateDto({ title: '代客下单', customerId: 'cust-A' });

    expect(errors).toHaveLength(0);
  });

  it('约束不挂在客户自助 DTO 上（其 customerId 恒来自登录态）', async () => {
    const errors = await validate(
      plainToInstance(CreateCustomerInquiryDto, {
        title: '客户自助询价',
        shippingAddressId: 'addr-1',
      }),
    );

    // 客户 DTO 不声明 customerId，也不应有该跨字段约束
    expect(
      errors.some((e) => e.constraints?.shippingAddressRequiresCustomer),
    ).toBe(false);
  });
});
