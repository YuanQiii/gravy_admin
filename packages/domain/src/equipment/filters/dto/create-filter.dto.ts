import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFilterDto {
  @ApiProperty({ description: '滤清器型号', example: 'FILTER-001' })
  @IsString()
  @IsNotEmpty({ message: '滤清器型号不能为空' })
  @MaxLength(128)
  model: string;

  @ApiProperty({
    description: '滤清器类型编码（引用 FilterType.code）',
    example: 'air-filter',
  })
  @IsString()
  @IsNotEmpty({ message: '滤清器类型不能为空' })
  @MaxLength(64)
  typeName: string;

  @ApiPropertyOptional({ description: 'gencode', example: 'G001' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  gencode?: string;

  @ApiPropertyOptional({ description: '容积', example: 1.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  volume?: number;

  @ApiPropertyOptional({ description: '重量', example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  weight?: number;

  @ApiPropertyOptional({ description: '尺寸 D1', example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dimensionD1?: number;

  @ApiPropertyOptional({ description: '尺寸 D2', example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dimensionD2?: number;

  @ApiPropertyOptional({ description: '尺寸 D3', example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dimensionD3?: number;

  @ApiPropertyOptional({ description: '尺寸 D7', example: 'D7-value' })
  @IsOptional()
  @IsString()
  dimensionD7?: string;

  @ApiPropertyOptional({ description: '尺寸 H1', example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dimensionH1?: number;

  @ApiPropertyOptional({ description: '尺寸 H2', example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dimensionH2?: number;

  @ApiPropertyOptional({ description: '尺寸 H3', example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dimensionH3?: number;

  @ApiPropertyOptional({ description: '尺寸 D8', example: 'D8-value' })
  @IsOptional()
  @IsString()
  dimensionD8?: string;

  @ApiPropertyOptional({ description: 'annb', example: 'ANNB-001' })
  @IsOptional()
  @IsString()
  annb?: string;

  @ApiPropertyOptional({ description: 'bynb', example: 'BYNB-001' })
  @IsOptional()
  @IsString()
  bynb?: string;

  @ApiPropertyOptional({ description: '图片 UUID', example: 'photo-uuid' })
  @IsOptional()
  @IsString()
  photoUuid?: string;

  @ApiPropertyOptional({ description: '图纸 UUID', example: 'drawing-uuid' })
  @IsOptional()
  @IsString()
  drawingUuid?: string;

  @ApiPropertyOptional({ description: '兼容性信息（JSON）', type: Object })
  @IsOptional()
  compatibility?: any;

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
