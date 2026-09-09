import { UnauthorizedException } from '@nestjs/common';
import { CustomerJwtStrategy } from './customer-jwt.strategy';

function createStrategy() {
  return new CustomerJwtStrategy({
    get: (key: string) => (key === 'jwt.secret' ? 'test-secret' : undefined),
  } as any);
}

describe('CustomerJwtStrategy', () => {
  it('realm === customer 的 token 校验通过，产出 { customerId }', async () => {
    const strategy = createStrategy();
    const user = await strategy.validate({
      sub: 'customer-uuid-1',
      realm: 'customer',
      jti: 'jti-1',
    });
    expect(user).toEqual({ customerId: 'customer-uuid-1' });
  });

  it('realm 非 customer 的 token 校验失败（401）', async () => {
    const strategy = createStrategy();
    await expect(
      strategy.validate({ sub: 'customer-uuid-1', realm: 'user' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('缺少 realm 声明的 token 校验失败（401）', async () => {
    const strategy = createStrategy();
    await expect(strategy.validate({ sub: 'customer-uuid-1' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('缺少 sub 的 token 校验失败（401）', async () => {
    const strategy = createStrategy();
    await expect(
      strategy.validate({ realm: 'customer' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});