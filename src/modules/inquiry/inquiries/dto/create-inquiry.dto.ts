import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class CreateInquiryDto {
  @ApiProperty({
    description: '询价单标题',
    example: '2026年8月滤清器采购询价',
  })
  @IsString()
  @IsNotEmpty({ message: '询价单标题不能为空' })
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: '询价单描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '客户ID（关联 Customer）' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: '客户名称（快照）' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '客户邮箱（快照）' })
  @IsOptional()
  @IsString()
  customerEmail?: string;

  @ApiPropertyOptional({ description: '客户电话（快照）' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: '总金额', example: 15000.0 })
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @ApiPropertyOptional({ description: '收货地址ID（关联 CustomerAddress）' })
  @IsOptional()
  @IsString()
  shippingAddressId?: string;

  @ApiPropertyOptional({
    description: '过期时间（ISO 8601 日期字符串）',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
