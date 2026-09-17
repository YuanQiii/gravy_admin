import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@gvray/core';
import { SortWhitelist } from '@gvray/core';


@SortWhitelist(['sortOrder', 'model', 'createdAt', 'updatedAt'])
export class QueryFilterDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '关键词（model/gencode 模糊）' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '滤清器类型编码（typeName）' })
  @IsOptional()
  @IsString()
  typeName?: string;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
