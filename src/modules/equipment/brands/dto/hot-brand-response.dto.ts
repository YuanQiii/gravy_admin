import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

/** 公开热门品牌列表项——仅含品牌标识、名称、slug 与生效设备数，不含运营字段。 */
export class HotBrandResponseDto {
  @ApiProperty({
    description: '品牌唯一标识（UUID）',
    example: 'b1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  brandId: string;

  @ApiProperty({ description: '品牌名称' })
  @Expose()
  name: string;

  @ApiProperty({ description: 'slug', type: String })
  @Expose()
  slug?: string;

  @ApiProperty({
    description: '生效设备数（未软删且 status=enabled）',
    type: 'integer',
  })
  @Expose()
  deviceCount: number;
}