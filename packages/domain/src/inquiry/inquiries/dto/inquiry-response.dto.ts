import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

/**
 * 询价单响应形状（列表与写路径）。
 *
 * ⚠️ `totalAmount` 是 Prisma `Decimal`，**必须**带 `@Type(() => Number)`：
 * 不加时 class-transformer 会以 `value.constructor`（Decimal）重建实例，
 * `new Decimal(undefined)` 抛 `Invalid argument` —— 属性有值时整个响应 500。
 * 与 `FilterResponseDto` / `EquipmentResponseDto` 的既有约定一致。
 */
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

  @ApiPropertyOptional({
    description: '总金额（由后台报价填写；未报价为 null）。数值类型',
    type: 'number',
    nullable: true,
  })
  @Expose()
  @Type(() => Number)
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
