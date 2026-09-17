import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@gvray/core';
import { SortWhitelist } from '@gvray/core';


@SortWhitelist(['visitedAt', 'createdAt'])
export class QueryHistoryDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '客户ID（customerId UUID）' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: '滤清器ID（filterId UUID）' })
  @IsOptional()
  @IsString()
  filterId?: string;
}
