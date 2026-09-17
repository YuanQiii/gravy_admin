import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SortWhitelist } from '../validators/is-allowed-sort-by.validator';

/**
 * 分页查询DTO
 */
export class PaginationDto {
  @ApiPropertyOptional({
    description: '页码',
    type: 'integer',
    minimum: 1,
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '页码必须是整数' })
  @Min(1, { message: '页码不能小于1' })
  page = 1;

  @ApiPropertyOptional({
    description: '每页数量',
    type: 'integer',
    minimum: 1,
    maximum: 100,
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '每页数量必须是整数' })
  @Min(1, { message: '每页数量不能小于1' })
  @Max(100, { message: '每页数量不能超过100' })
  pageSize = 10;

  /**
   * 获取跳过的记录数
   * @returns 跳过的记录数
   */
  getSkip(): number {
    return (this.page - 1) * this.pageSize;
  }

  /**
   * 获取查询数量
   * @returns 查询数量
   */
  getTake(): number {
    return this.pageSize;
  }
}

/**
 * 分页排序DTO —— 排序契约的**唯一真相源**。
 *
 * `@SortWhitelist` 在类上声明可排序字段白名单（声明时闭包捕获进校验器），
 * 未覆盖白名单的 `sortBy` 在入参层即被 400，不再进入 Prisma `orderBy`
 * （原先任意字符串可触发 Prisma 校验异常 → 500 + 内部 message 回显）。
 * `getOrderBy()` 的回退默认取白名单**首项**，白名单与默认同源。
 */
@SortWhitelist(['createdAt', 'updatedAt'])
export class PaginationSortDto extends PaginationDto {
  @ApiPropertyOptional({
    description: '排序字段（必须在当前端点的可排序白名单内）',
    example: 'createdAt',
  })
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({
    description: '排序方向',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: '排序方向必须是 asc 或 desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';

  /**
   * 获取排序配置。回退字段取白名单主字段（首项）—— 白名单与默认同源，
   * 不存在"Service 传的 defaultSortBy 不在白名单内"的漂移可能。
   */
  getOrderBy(): Record<string, 'asc' | 'desc'> {
    const sortBy = this.sortBy || this.allowedSortBy?.[0] || 'createdAt';
    return { [sortBy]: this.sortOrder || 'desc' };
  }
}

/**
 * 类型声明（非字段）：`allowedSortBy` 由 `@SortWhitelist` 在 prototype 上赋值。
 * **刻意不写成类字段** —— `useDefineForClassFields` 下无初始化器的字段声明会
 * 以 `undefined` 遮蔽原型上的值。与同名 class 声明合并提供类型。
 */
export interface PaginationSortDto {
  readonly allowedSortBy?: string[];
}
