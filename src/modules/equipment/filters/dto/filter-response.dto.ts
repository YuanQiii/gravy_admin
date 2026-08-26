import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class FilterResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '滤清器唯一标识（UUID）',
    example: 'b1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  filterId: string;

  @ApiProperty({ description: '滤清器型号' })
  @Expose()
  model: string;

  @ApiProperty({ description: '滤清器类型编码（引用 FilterType.code）' })
  @Expose()
  typeName: string;

  @ApiPropertyOptional({ description: 'gencode', type: String })
  @Expose()
  gencode?: string;

  @ApiPropertyOptional({ description: '容积' })
  @Expose()
  volume?: number;

  @ApiPropertyOptional({ description: '重量' })
  @Expose()
  weight?: number;

  @ApiPropertyOptional({ description: '尺寸 D1' })
  @Expose()
  dimensionD1?: number;

  @ApiPropertyOptional({ description: '尺寸 D2' })
  @Expose()
  dimensionD2?: number;

  @ApiPropertyOptional({ description: '尺寸 D3' })
  @Expose()
  dimensionD3?: number;

  @ApiPropertyOptional({ description: '尺寸 D7', type: String })
  @Expose()
  dimensionD7?: string;

  @ApiPropertyOptional({ description: '尺寸 H1' })
  @Expose()
  dimensionH1?: number;

  @ApiPropertyOptional({ description: '尺寸 H2' })
  @Expose()
  dimensionH2?: number;

  @ApiPropertyOptional({ description: '尺寸 H3' })
  @Expose()
  dimensionH3?: number;

  @ApiPropertyOptional({ description: '尺寸 D8', type: String })
  @Expose()
  dimensionD8?: string;

  @ApiPropertyOptional({ description: 'annb', type: String })
  @Expose()
  annb?: string;

  @ApiPropertyOptional({ description: 'bynb', type: String })
  @Expose()
  bynb?: string;

  @ApiPropertyOptional({ description: '图片 UUID', type: String })
  @Expose()
  photoUuid?: string;

  @ApiPropertyOptional({ description: '图纸 UUID', type: String })
  @Expose()
  drawingUuid?: string;

  @ApiPropertyOptional({ description: '兼容性信息（JSON）', type: Object })
  @Expose()
  compatibility?: any;

  @ApiProperty({ description: '排序', type: 'integer' })
  @Expose()
  sortOrder: number;

  @ApiProperty({ description: '状态' })
  @Expose()
  status: string;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: '更新时间', type: 'string', format: 'date-time' })
  @Expose()
  updatedAt: Date;
}
