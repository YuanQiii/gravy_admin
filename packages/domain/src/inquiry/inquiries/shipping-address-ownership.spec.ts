import { BadRequestException } from '@nestjs/common';
import {
  assertShippingAddressOwned,
  resolveOwnerCustomerId,
} from './shipping-address-ownership';

/**
 * 归属不变量的单测。
 *
 * 这是客户自助路径与管理端路径**共用**的那一份实现 —— 因此这四条用例同时覆盖两条路径，
 * 而不是各自一套（同一规则表达两次正是本项目反复出现的缺陷形态）。
 */
describe('assertShippingAddressOwned（地址归属不变量）', () => {
  const owned = { customerId: 'cust-A', deletedAt: null };
  const softDeleted = { customerId: 'cust-A', deletedAt: new Date() };

  it('地址不存在 → 400 INVALID_SHIPPING_ADDRESS', () => {
    expect(() => assertShippingAddressOwned(null, 'cust-A')).toThrow(
      BadRequestException,
    );
    expect(() => assertShippingAddressOwned(null)).toThrow(
      'INVALID_SHIPPING_ADDRESS',
    );
  });

  it('地址已软删 → 400（即使归属正确）', () => {
    expect(() => assertShippingAddressOwned(softDeleted, 'cust-A')).toThrow(
      'INVALID_SHIPPING_ADDRESS',
    );
  });

  it('给了 owner 但地址属于他人 → 400', () => {
    expect(() =>
      assertShippingAddressOwned(owned, 'cust-OTHER'),
    ).toThrow('INVALID_SHIPPING_ADDRESS');
  });

  it('owner 为空（管理端未指定客户）→ 只校验可用性，不校验归属', () => {
    expect(() => assertShippingAddressOwned(owned, null)).not.toThrow();
    expect(() => assertShippingAddressOwned(owned)).not.toThrow();
    expect(() => assertShippingAddressOwned(owned, 'cust-A')).not.toThrow();
  });
});

describe('resolveOwnerCustomerId（归属来源解析）', () => {
  it('管理端：取 dto.customerId，缺省为 null（表示不校验归属）', () => {
    expect(
      resolveOwnerCustomerId({ realm: 'admin', customerId: 'cust-A' }),
    ).toBe('cust-A');
    expect(resolveOwnerCustomerId({ realm: 'admin', customerId: undefined })).toBeNull();
    expect(resolveOwnerCustomerId({ realm: 'admin', customerId: null })).toBeNull();
  });

  it('客户自助：取登录态 customerId（必非空）', () => {
    expect(
      resolveOwnerCustomerId({ realm: 'customer', customerId: 'cust-A' }),
    ).toBe('cust-A');
  });
});
