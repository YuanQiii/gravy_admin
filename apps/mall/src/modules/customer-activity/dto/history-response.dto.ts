import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class HistoryResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '历史记录唯一标识（UUID）',
    example: 'h1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  historyId: string;

  @ApiProperty({ description: '客户ID（customerId UUID）' })
  @Expose()
  customerId: string;

  @ApiProperty({ description: '滤清器ID（filterId UUID）' })
  @Expose()
  filterId: string;

  @ApiProperty({ description: '访问时间', type: 'string', format: 'date-time' })
  @Expose()
  visitedAt: Date;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiPropertyOptional({
    description: '滤清器是否当前可用（存在 + enabled + 未软删），供前端置灰失效历史',
  })
  @Expose()
  filterAvailable?: boolean;

  @ApiPropertyOptional({
    description: '滤清器快照（型号/编号/类型名/图片）',
    type: Object,
  })
  @Expose()
  filter?: {
    model: string;
    gencode: string;
    typeName: string;
    photoUuid?: string | null;
  };
}
