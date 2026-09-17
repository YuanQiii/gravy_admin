import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationSortDto } from './pagination.dto';
import {
  IsAllowedSortByConstraint,
  SortWhitelist,
} from '../validators/is-allowed-sort-by.validator';

class SampleDto extends PaginationSortDto {}

@SortWhitelist(['sortOrder', 'visitedAt'])
class OverriddenDto extends PaginationSortDto {}

describe('排序白名单（SortWhitelist / IsAllowedSortBy）', () => {
  it('基类默认白名单：sortBy 省略 → 放行；非法值 → 400（INVALID_SORT_BY）', async () => {
    const omitted = await validate(plainToInstance(SampleDto, {}));
    expect(omitted).toHaveLength(0);

    const bad = await validate(
      plainToInstance(SampleDto, { sortBy: '__proto__' }),
    );
    const messages = bad.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => String(m).startsWith('INVALID_SORT_BY'))).toBe(
      true,
    );
  });

  it('基类默认白名单含 createdAt/updatedAt；合法值通过', async () => {
    const ok = await validate(
      plainToInstance(SampleDto, { sortBy: 'createdAt', sortOrder: 'asc' }),
    );
    expect(ok).toHaveLength(0);
  });

  it('sortOrder 枚举：asc/desc 通过，其他值 400', async () => {
    const bad = await validate(
      plainToInstance(SampleDto, { sortOrder: 'DROP' as never }),
    );
    const messages = bad.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('排序方向必须是 asc 或 desc');
  });

  it('子类 @SortWhitelist 覆盖：白名单换为声明值（校验器自包含，不读实例）', async () => {
    const ok = await validate(
      plainToInstance(OverriddenDto, { sortBy: 'visitedAt' }),
    );
    expect(ok).toHaveLength(0);

    const bad = await validate(
      plainToInstance(OverriddenDto, { sortBy: 'createdAt' }), // 不在覆盖后的白名单
    );
    expect(bad.length).toBeGreaterThan(0);
  });

  it('getOrderBy 回退白名单主字段（首项）—— 白名单与默认同源', () => {
    expect(new SampleDto().getOrderBy()).toEqual({ createdAt: 'desc' });
    expect(new OverriddenDto().getOrderBy()).toEqual({ sortOrder: 'desc' });
  });

  it('约束单独使用：constraints 即白名单（D9 闭包捕获的证据）', async () => {
    const constraint = new IsAllowedSortByConstraint();
    // args.constraints 即白名单本身（D9 闭包捕获的证据）
    const args = { constraints: ['a', 'b'], object: {}, property: 'sortBy' } as never;
    expect(constraint.validate('a', args)).toBe(true);
    expect(constraint.validate('c', args)).toBe(false);
    expect(constraint.validate(undefined, args)).toBe(true);
    expect(constraint.validate('', args)).toBe(true);
    // 未声明白名单：保守拒绝（放行会重现泄密面）
    expect(constraint.validate('a', { constraints: [] } as never)).toBe(false);
  });
});
