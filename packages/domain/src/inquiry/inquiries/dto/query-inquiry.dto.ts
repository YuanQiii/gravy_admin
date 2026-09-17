import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@gvray/core';
import { SortWhitelist } from '@gvray/core';


@SortWhitelist(['createdAt', 'updatedAt'])
export class QueryInquiryDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '关键词（询价单号或客户名称模糊搜索）' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '状态', example: 'draft' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '客户ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: '创建人ID' })
  @IsOptional()
  @IsString()
  createdById?: string;

  @ApiPropertyOptional({
    description: '创建时间起始（YYYY-MM-DD）',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsString()
  createdAtStart?: string;

  @ApiPropertyOptional({
    description: '创建时间结束（YYYY-MM-DD）',
    example: '2026-08-31',
  })
  @IsOptional()
  @IsString()
  createdAtEnd?: string;
}
