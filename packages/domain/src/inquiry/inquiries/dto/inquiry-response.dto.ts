import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class InquiryResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '询价单唯一标识（UUID）',
    example: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @Expose()
  inquiryId: string;

  @ApiProperty({ description: '询价单编号', example: 'INQ202608-0001' })
  @Expose()
  inquiryNo: string;

  @ApiProperty({ description: '询价单标题' })
  @Expose()
  title: string;

  @ApiPropertyOptional({ description: '询价单描述' })
  @Expose()
  description?: string;

  @ApiProperty({ description: '状态', example: 'draft' })
  @Expose()
  status: string;

  @ApiPropertyOptional({ description: '客户名称' })
  @Expose()
  customerName?: string;

  @ApiPropertyOptional({ description: '客户邮箱' })
  @Expose()
  customerEmail?: string;

  @ApiPropertyOptional({ description: '客户电话' })
  @Expose()
  customerPhone?: string;

  @ApiPropertyOptional({ description: '总金额' })
  @Expose()
  totalAmount?: number | null;

  @ApiPropertyOptional({ description: '客户ID' })
  @Expose()
  customerId?: string;

  @ApiPropertyOptional({ description: '创建人ID' })
  @Expose()
  createdById?: string;

  @ApiPropertyOptional({ description: '收货地址ID' })
  @Expose()
  shippingAddressId?: string;

  @ApiPropertyOptional({
    description: '提交时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  submittedAt?: Date;

  @ApiPropertyOptional({
    description: '报价时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  quotedAt?: Date;

  @ApiPropertyOptional({
    description: '过期时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  expiresAt?: Date;

  @ApiPropertyOptional({
    description: '取消时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  cancelledAt?: Date;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: '更新时间', type: 'string', format: 'date-time' })
  @Expose()
  updatedAt: Date;
}
