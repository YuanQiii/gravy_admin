import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@gvray/core';
import { SortWhitelist } from '@gvray/core';


@SortWhitelist(['sortOrder', 'createdAt', 'updatedAt'])
export class QueryBrandDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '品牌名称（模糊）' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'slug' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
