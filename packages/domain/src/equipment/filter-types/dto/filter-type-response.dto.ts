import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

export class FilterTypeResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '滤清器类型唯一标识（UUID）',
    example: 'c8e2d4a1-9b3c-4d2e-8f1a-6e7c9d8a0b2f',
  })
  @Expose()
  filterTypeId: string;

  @ApiProperty({ description: '滤清器类型名称' })
  @Expose()
  name: string;

  @ApiProperty({ description: '滤清器类型编码' })
  @Expose()
  code: string;

  @ApiPropertyOptional({ description: '描述', type: String })
  @Expose()
  @Transform(({ value }): string => value ?? '')
  description?: string;

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
