import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateEquipmentDto {
  @ApiPropertyOptional({
    description: '品牌ID（UUID）；提供时系统将读取品牌名称写入快照',
    example: 'b1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({
    description: '品牌名称快照（未提供 brandId 时必填）',
    example: 'Bosch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  brandName?: string;

  @ApiProperty({ description: '设备型号', example: 'X200' })
  @IsString()
  @IsNotEmpty({ message: '设备型号不能为空' })
  @MaxLength(128)
  model: string;

  @ApiPropertyOptional({
    description: '生产日期开始（ISO 日期字符串）',
    example: '2020-01-01',
  })
  @IsOptional()
  @IsString()
  productionDateStart?: string;

  @ApiPropertyOptional({
    description: '生产日期结束（ISO 日期字符串）',
    example: '2023-12-31',
  })
  @IsOptional()
  @IsString()
  productionDateEnd?: string;

  @ApiPropertyOptional({ description: '发动机品牌', example: 'Cummins' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  engineBrand?: string;

  @ApiPropertyOptional({ description: '发动机型号', example: 'QSB6.7' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  engineType?: string;

  @ApiPropertyOptional({
    description: '功率（数值，保留两位小数）',
    example: 150.5,
  })
  @IsOptional()
  @IsNumber()
  power?: number;

  @ApiPropertyOptional({
    description: '引擎能源类型（diesel/petrol/electric/hybrid/natural_gas）',
    example: 'diesel',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  engineEnergy?: string;

  @ApiPropertyOptional({
    description: '设备目录ID（UUID）；提供时系统将读取目录名称写入快照',
    example: 'a2c3d4e5-f6b7-8c9d-0e1f-2a3b4c5d6e7f',
  })
  @IsOptional()
  @IsString()
  catalogId?: string;

  @ApiPropertyOptional({
    description: '设备目录名称快照（未提供 catalogId 时必填）',
    example: '工程机械',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  catalogName?: string;

  @ApiPropertyOptional({ description: '排序', default: 0, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;
}
