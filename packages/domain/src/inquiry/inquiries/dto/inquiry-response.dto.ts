import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import type { ShippingSnapshotShape } from './shipping-snapshot.shape';

/**
 * 询价单响应形状（列表与写路径）。
 *
 * ⚠️ `totalAmount` 是 Prisma `Decimal`，**必须**带 `@Type(() => Number)`：
 * 不加时 class-transformer 会以 `value.constructor`（Decimal）重建实例，
 * `new Decimal(undefined)` 抛 `Invalid argument` —— 属性有值时整个响应 500。
 * 与 `FilterResponseDto` / `EquipmentResponseDto` 的既有约定一致。
 *
 * `implements ShippingSnapshotShape`：7 个收货地址快照字段的锁步由**编译器**保证 ——
 * 给 shape 加字段而此处不跟，或类型放宽，都会编译失败。
 */
export class InquiryResponseDto implements ShippingSnapshotShape {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '询价单唯一标识（UUID）',
    example: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @Expose()
  inquiryId: string;

  @ApiProperty({ description: '询价单编号', example: 'INQ202608-000001' })
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

  @ApiPropertyOptional({
    description:
      '收货地址ID（溯源引用；地址被删除后可为 null —— 收货信息以快照字段为准）',
  })
  @Expose()
  shippingAddressId?: string;

  // ===== 收货地址快照（创建时点冻结，不随地址修改/删除漂移）=====

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货人（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingReceiver: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货电话（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingPhone: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货省（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingProvince: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货市（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingCity: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货区/县（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingDistrict: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货详细地址（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingDetailAddress: string | null;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '收货邮编（创建时点快照，未选地址时为 null）',
  })
  @Expose()
  shippingZipCode: string | null;

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

  @ApiProperty({
    description: '创建时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: '更新时间',
    type: 'string',
    format: 'date-time',
  })
  @Expose()
  updatedAt: Date;

  /**
   * 派生展示态：报价是否已过期（`status === 'quoted' && expiresAt < now`）。
   *
   * 判定唯一出自 core 的 `isInquiryExpired`；该字段是**只读派生**，不落库、
   * 客户端传入无效（未在入参 DTO 声明）。`quoted` 但未填 `expiresAt` 视为
   * 永久报价 → false。
   */
  @ApiProperty({ description: '报价是否已过期（派生字段，只读）' })
  @Expose()
  isExpired: boolean;
}
