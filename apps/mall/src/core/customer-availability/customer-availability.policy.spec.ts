import { CustomerJwtStrategy } from '../strategies/customer-jwt.strategy';
import { ConfigService } from '@nestjs/config';
import {
  AccessTtlNoCheckPolicy,
  NoopAvailabilityGate,
  CUSTOMER_AVAILABILITY_CHECKED_WITHIN_TTL,
} from './customer-availability.policy';

/**
 * 客户可用性政策与认证接缝单测（unify-customer-availability-gate T2b/T5）。
 *
 * 政策断言覆盖**全部**受保护写路径：政策对象是唯一来源，断言它等价于
 * 断言所有路径——这正是把政策收成 module 的目的。
 */
describe('CustomerAvailabilityPolicy（TTL 内可用性政策单一来源）', () => {
  it('checksWithinTtl() === false：TTL 内不做客户可用性校验（覆盖全部受保护写路径）', () => {
    const policy = new AccessTtlNoCheckPolicy();
    expect(policy.checksWithinTtl()).toBe(false);
    expect(policy.checksWithinTtl()).toBe(
      CUSTOMER_AVAILABILITY_CHECKED_WITHIN_TTL,
    );
    expect(policy.source()).toContain('adr-0011');
  });

  it('NoopAvailabilityGate 放行任意 customerId（no-op 是政策，不是 TODO）', async () => {
    const gate = new NoopAvailabilityGate();
    await expect(
      gate.assertWithinTtl('cust-deleted-or-disabled'),
    ).resolves.toBeUndefined();
  });
});

describe('CustomerJwtStrategy.validate（T5：无状态，零 DB/Redis）', () => {
  function buildStrategy() {
    const configService = {
      get: (key: string) =>
        key === 'jwt.secret' ? 'test-secret-key-for-unit' : undefined,
    } as unknown as ConfigService;
    return new CustomerJwtStrategy(configService);
  }

  it('validate(payload) 仅依赖 JWT payload，返回 { customerId }', async () => {
    const strategy = buildStrategy();
    const result = await strategy.validate({
      sub: 'cust-A',
      realm: 'customer',
      jti: 'jti-1',
    });
    expect(result).toEqual({ customerId: 'cust-A' });
  });

  it('非 customer realm 的 token 被拒（认证域互斥）', async () => {
    const strategy = buildStrategy();
    await expect(
      strategy.validate({ sub: 'admin-user-id', realm: 'user' } as never),
    ).rejects.toThrow();
  });

  it('策略实例不持有 Prisma/Redis 依赖（无状态的结构性证明）', () => {
    const strategy = buildStrategy() as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(strategy)) {
      // passport-jwt 的策略实例只应有配置与验证回调，不应出现 prisma/redis 客户端
      expect(String(key)).not.toMatch(/prisma|redis|session/i);
      if (value && typeof value === 'object') {
        expect(value).not.toHaveProperty('$connect');
      }
    }
  });
});
