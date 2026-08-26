import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class FavoriteResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '收藏唯一标识（UUID）',
    example: 'f1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  favoriteId: string;

  @ApiProperty({ description: '客户ID（customerId UUID）' })
  @Expose()
  customerId: string;

  @ApiProperty({ description: '滤清器ID（filterId UUID）' })
  @Expose()
  filterId: string;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;
}
