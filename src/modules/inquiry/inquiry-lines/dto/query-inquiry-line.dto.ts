import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@/shared/dtos/pagination.dto';

export class QueryInquiryLineDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '所属询价单ID' })
  @IsOptional()
  @IsString()
  inquiryId?: string;

  @ApiPropertyOptional({ description: '滤清器ID' })
  @IsOptional()
  @IsString()
  filterId?: string;

  @ApiPropertyOptional({ description: '关键词（产品名称模糊搜索）' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
