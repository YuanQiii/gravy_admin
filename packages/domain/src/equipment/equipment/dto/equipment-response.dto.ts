import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

/**
 * Prisma Decimal -> number（null/undefined 原样保留）。
 * 不加 @Type 时 class-transformer 会以 value.constructor（Decimal）重建实例，
 * `new Decimal(undefined)` 抛 Invalid argument；@Type(() => Number) 走原语转换路径。
 */

export class EquipmentResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '设备唯一标识（UUID）',
    example: 'e1f2a3b4-c5d6-7890-abcd-ef1234567890',
  })
  @Expose()
  equipmentId: string;

  @ApiPropertyOptional({ description: '品牌ID（UUID）' })
  @Expose()
  brandId?: string;

  @ApiProperty({ description: '品牌名称快照' })
  @Expose()
  brandName: string;

  @ApiProperty({ description: '设备型号' })
  @Expose()
  model: string;

  @ApiPropertyOptional({
    description: '生产日期开始',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  productionDateStart?: Date;

  @ApiPropertyOptional({
    description: '生产日期结束',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  productionDateEnd?: Date;

  @ApiPropertyOptional({ description: '发动机品牌' })
  @Expose()
  engineBrand?: string;

  @ApiPropertyOptional({ description: '发动机型号' })
  @Expose()
  engineType?: string;

  @ApiPropertyOptional({ description: '功率' })
  @Expose()
  @Type(() => Number)
  power?: number;

  @ApiPropertyOptional({ description: '引擎能源类型' })
  @Expose()
  engineEnergy?: string;

  @ApiPropertyOptional({ description: '设备目录ID（UUID）' })
  @Expose()
  catalogId?: string;

  @ApiProperty({ description: '设备目录名称快照' })
  @Expose()
  catalogName: string;

  @ApiProperty({ description: '排序', type: 'integer' })
  @Expose()
  sortOrder: number;

  @ApiProperty({ description: '状态' })
  @Expose()
  status: string;

  @ApiProperty({
    description: '创建时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: '更新时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  updatedAt: Date;

  @ApiPropertyOptional({
    description: '关联的滤清器列表（findOne 时返回）',
    type: 'array',
  })
  @Expose()
  equipmentFilters?: any[];
}
