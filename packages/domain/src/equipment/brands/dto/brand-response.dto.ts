import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

export class BrandResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '品牌唯一标识（UUID）',
    example: 'b1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  brandId: string;

  @ApiProperty({ description: '品牌名称' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: 'slug', type: String })
  @Expose()
  @Transform(({ value }): string => value ?? '')
  slug?: string;

  @ApiProperty({ description: '排序', type: 'integer' })
  @Expose()
  sortOrder: number;

  @ApiProperty({ description: '状态' })
  @Expose()
  status: string;

  @ApiProperty({ description: '是否热门品牌', type: 'boolean' })
  @Expose()
  isHot: boolean;

  @ApiPropertyOptional({
    description: '热门排序（可空，未设则按生效设备数/入库时间兜底）',
    type: 'integer',
  })
  @Expose()
  @Transform(({ value }): number | null => value ?? null)
  hotOrder?: number;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: '更新时间', type: 'string', format: 'date-time' })
  @Expose()
  updatedAt: Date;
}
