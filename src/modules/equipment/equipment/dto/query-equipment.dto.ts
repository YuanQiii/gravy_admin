import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationSortDto } from '@/shared/dtos/pagination.dto';

export class QueryEquipmentDto extends PaginationSortDto {
  @ApiPropertyOptional({ description: '关键字（型号/品牌名称模糊匹配）' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '品牌ID（UUID）' })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({ description: '设备目录ID（UUID）' })
  @IsOptional()
  @IsString()
  catalogId?: string;

  @ApiPropertyOptional({
    description: '引擎能源类型（diesel/petrol/electric/hybrid/natural_gas）',
    example: 'diesel',
  })
  @IsOptional()
  @IsString()
  engineEnergy?: string;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
