import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Exclude, Expose } from 'class-transformer';

/**
 * 滤清器当前快照（收藏列表投影，仅暴露对外展示字段）。
 * 服务端已先行剥离 `status`/`deletedAt`（仅用于派生 `filterAvailable`），不对外暴露。
 */
class FavoriteFilterSnapshotDto {
  @ApiProperty({ description: '滤清器型号' })
  @Expose()
  model: string;

  @ApiProperty({ description: '滤清器编号' })
  @Expose()
  gencode: string;

  @ApiProperty({ description: '滤清器类型名' })
  @Expose()
  typeName: string;

  @ApiPropertyOptional({ description: '滤清器图片 UUID（资产链接）' })
  @Expose()
  photoUuid?: string | null;
}

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

  @ApiPropertyOptional({
    description: '滤清器是否当前可用（存在 + enabled + 未软删），供前端置灰失效收藏',
  })
  @Expose()
  filterAvailable?: boolean;

  @ApiPropertyOptional({
    description: '滤清器当前快照（型号/编号/类型名）；滤清器失效时仍返回其最后快照',
    type: FavoriteFilterSnapshotDto,
  })
  @Expose()
  @Type(() => FavoriteFilterSnapshotDto)
  filter?: FavoriteFilterSnapshotDto;
}