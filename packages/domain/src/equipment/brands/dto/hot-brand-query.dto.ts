import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 热门品牌列表 query 参数。 */
export class HotBrandQueryDto {
  @ApiPropertyOptional({
    description: '返回条数上限（默认 8，最大 50）',
    type: 'integer',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}