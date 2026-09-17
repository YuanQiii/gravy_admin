import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
} from 'class-validator';

/**
 * 排序字段白名单校验器（whitelist-pagination-sort-params D9）。
 *
 * `@SortWhitelist([...])` 在**声明时**把白名单闭包捕获进 `constraints`，
 * 校验器自包含、不读 DTO 实例字段 —— seam 收紧，无 transform 时机依赖。
 *
 * 放行规则：`sortBy` 未提供（undefined/null/空串）放行（省略排序是合法请求，
 * 由 `getOrderBy` 回退白名单主字段）；提供了则必须 ∈ 白名单，否则 400。
 * 白名单外直接 400，替代原先"任意字符串进 Prisma orderBy → 校验异常 →
 * 500 + 内部 message 回显"的泄密面。
 */
@ValidatorConstraint({ name: 'isAllowedSortBy', async: false })
export class IsAllowedSortByConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    // args.constraints 即 @SortWhitelist([...]) 闭包捕获的白名单本身
    const whitelist = args.constraints as string[] | undefined;
    if (!whitelist || whitelist.length === 0) {
      // 未声明白名单 = 未配置契约，放行会重现泄密面；保守拒绝。
      return false;
    }
    return whitelist.includes(String(value));
  }

  defaultMessage(args: ValidationArguments): string {
    const whitelist = (args.constraints as string[] | undefined) ?? [];
    return `INVALID_SORT_BY:排序字段必须是 ${whitelist.join('/')} 之一`;
  }
}

/**
 * 类装饰器：为 DTO 声明可排序字段白名单。
 *
 * 做两件事：
 * 1. `registerDecorator` 把白名单以 `constraints` 闭包捕获，挂到该类的
 *    `sortBy` 属性上（校验器自包含，不读实例）；
 * 2. 在 **prototype** 上赋值 `allowedSortBy`，使 `getOrderBy()` 的回退默认
 *    （取首项）与白名单同源 —— DTO 是排序契约的唯一真相源，子类用自己的
 *    `@SortWhitelist` 覆盖时经原型链自然遮蔽基类。
 *
 * 用法（每个域 DTO 一行）：
 * ```ts
 * @SortWhitelist(['createdAt', 'updatedAt', 'sortOrder'])
 * export class QueryBrandDto extends PaginationSortDto {}
 * ```
 */
export function SortWhitelist(fields: string[]): ClassDecorator {
  return function (target: Function) {
    (target.prototype as Record<string, unknown>).allowedSortBy = [...fields];
    registerDecorator({
      target: target as unknown as new () => unknown,
      propertyName: 'sortBy',
      constraints: [...fields],
      validator: IsAllowedSortByConstraint,
    });
  };
}
