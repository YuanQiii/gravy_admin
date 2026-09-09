import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

export class CatalogResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '目录唯一标识（UUID）',
    example: 'a3f0c1e2-7b4d-4f8a-9c1e-5d6a7b8c9d0e',
  })
  @Expose()
  catalogId: string;

  @ApiProperty({ description: '目录名称' })
  @Expose()
  name: string;

  @ApiPropertyOptional({ description: '目录编码', type: String })
  @Expose()
  code?: string;

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
