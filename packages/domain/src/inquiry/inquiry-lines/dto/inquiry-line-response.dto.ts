import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class InquiryLineResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({
    description: '询价单明细唯一标识（UUID）',
    example: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @Expose()
  inquiryLineId: string;

  @ApiProperty({ description: '所属询价单ID' })
  @Expose()
  inquiryId: string;

  @ApiPropertyOptional({ description: '滤清器ID' })
  @Expose()
  filterId?: string;

  @ApiProperty({ description: '产品名称' })
  @Expose()
  productName: string;

  @ApiPropertyOptional({ description: '型号（快照）' })
  @Expose()
  model?: string;

  @ApiPropertyOptional({ description: '类型名称（快照）' })
  @Expose()
  typeName?: string;

  @ApiProperty({ description: '数量', type: 'integer' })
  @Expose()
  quantity: number;

  @ApiPropertyOptional({ description: '单价' })
  @Expose()
  unitPrice?: any;

  @ApiPropertyOptional({ description: '小计' })
  @Expose()
  subtotal?: any;

  @ApiPropertyOptional({ description: '备注' })
  @Expose()
  remarks?: string;

  @ApiProperty({ description: '排序', type: 'integer' })
  @Expose()
  sortOrder: number;

  @ApiPropertyOptional({ description: '创建人ID' })
  @Expose()
  createdById?: string;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: '更新时间', type: 'string', format: 'date-time' })
  @Expose()
  updatedAt: Date;
}
