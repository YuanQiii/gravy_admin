import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from './pagination.dto';

/**
 * 「当前客户自助分页查询」基类（align-mall-self-query-dtos 5.1）。
 *
 * 语义契约：**不声明** `customerId` —— 身份只经 `@CurrentCustomer()` 由守卫
 * 注入（ADR 0011），不经查询参数表达。继承本基类的 DTO 出现在 Swagger 时，
 * 调用方看不到"可传 customerId"的假象（此前文档与静默覆写的组合让客户端
 * 以为能按客户筛选，实际结果与文档相反）。
 *
 * 未知查询字段仍由全局 `forbidNonWhitelisted` 以 400 拒绝。
 */
export class SelfPagedQueryDto extends PaginationSortDto {}

/**
 * 可按滤清器筛选的自助分页查询基类（favorites / history 共用形状）。
 */
export class SelfFilterableQueryDto extends SelfPagedQueryDto {
  @ApiPropertyOptional({ description: '滤清器ID（filterId UUID）' })
  @IsOptional()
  @IsString()
  filterId?: string;
}
