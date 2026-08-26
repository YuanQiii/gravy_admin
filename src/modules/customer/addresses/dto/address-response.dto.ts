import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class AddressResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '地址唯一标识（UUID）',
    example: 'a1c7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  addressId: string;

  @ApiProperty({ description: '客户ID（customerId UUID）' })
  @Expose()
  customerId: string;

  @ApiProperty({ description: '收货人姓名' })
  @Expose()
  receiver: string;

  @ApiProperty({ description: '联系电话' })
  @Expose()
  phone: string;

  @ApiProperty({ description: '省份' })
  @Expose()
  province: string;

  @ApiProperty({ description: '城市' })
  @Expose()
  city: string;

  @ApiPropertyOptional({ description: '区/县' })
  @Expose()
  district?: string;

  @ApiProperty({ description: '详细地址' })
  @Expose()
  detailAddress: string;

  @ApiPropertyOptional({ description: '邮政编码' })
  @Expose()
  zipCode?: string;

  @ApiProperty({ description: '是否默认地址', type: 'boolean' })
  @Expose()
  isDefault: boolean;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: '更新时间', type: 'string', format: 'date-time' })
  @Expose()
  updatedAt: Date;
}
