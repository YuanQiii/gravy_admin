import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@gvray/core';


export class QueryAddressDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '客户ID（customerId UUID）' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: '收货人' })
  @IsOptional()
  @IsString()
  receiver?: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  phone?: string;
}
