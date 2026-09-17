import { QueryAddressSelfDto } from './query-address.dto';
import { QueryFavoriteSelfDto } from '../../../customer-activity/dto/query-favorite.dto';
import { QueryHistorySelfDto } from '../../../customer-activity/dto/query-history.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * Self 查询 DTO 契约防回归（align-mall-self-query-dtos 5.2）。
 *
 * 三个自助 DTO 的共享不变量：**不声明**身份/未实现字段（customerId/
 * receiver/phone）。删除本断言清单里的任一自段约束时这里会失败 ——
 * 契约漂移在编译期后的第一道闸。
 */
describe('Self 查询 DTO 契约（不声明身份/未实现字段）', () => {
  const cases: Array<[string, new () => object, string[]]> = [
    ['QueryAddressSelfDto', QueryAddressSelfDto, ['customerId', 'receiver', 'phone']],
    ['QueryFavoriteSelfDto', QueryFavoriteSelfDto, ['customerId']],
    ['QueryHistorySelfDto', QueryHistorySelfDto, ['customerId']],
  ];

  it.each(cases)('%s 不声明身份/未实现字段（原型与实例均无）', (_name, Ctor, banned) => {
    const instance = new Ctor() as Record<string, unknown>;
    const proto = Object.getPrototypeOf(Ctor) as Record<string, unknown>;
    for (const field of banned) {
      expect(instance).not.toHaveProperty(field);
      // 静态侧（装饰器元数据经 registerDecorator 挂在类上）也不应出现这些字段
      expect(Object.keys(proto)).not.toContain(field);
    }
  });

  it.each(cases)('%s 收到被禁字段 → forbidNonWhitelisted 语义下校验失败', async (_name, Ctor, banned) => {
    const payload: Record<string, string> = {};
    for (const field of banned) payload[field] = 'x';
    const errors = await validate(plainToInstance(Ctor, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    // 白名单外的字段必须被标记（forbidNonWhitelisted 的表现是 unknown 属性错误）
    expect(errors.length).toBeGreaterThan(0);
    const flagged = new Set(
      errors.flatMap((e) => e.target ? [e.property] : []),
    );
    for (const field of banned) {
      expect(flagged.has(field)).toBe(true);
    }
  });

  it('两个 filterable DTO 保留 filterId（3.1 的契约前提）', () => {
    expect(new QueryFavoriteSelfDto()).toHaveProperty('filterId', undefined);
    expect(new QueryHistorySelfDto()).toHaveProperty('filterId', undefined);
  });
});
