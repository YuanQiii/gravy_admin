import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@gvray/core';


export class QueryFilterTypeDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '滤清器类型名称（模糊）' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '滤清器类型编码' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
