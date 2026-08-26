import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@/shared/dtos/pagination.dto';

export class QueryCustomerDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '关键词（用户名/昵称/邮箱/手机号 模糊）' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
