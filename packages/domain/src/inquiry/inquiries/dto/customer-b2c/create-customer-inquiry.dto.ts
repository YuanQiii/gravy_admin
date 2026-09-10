import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsNotEmpty,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInquiryLineItemDto } from './create-inquiry-line-item.dto';

/**
 * B2C 客户自助创建询价单 DTO。
 *
 * **无 `customerId`/`customerName`/`customerEmail`/`customerPhone`/`totalAmount`**：
 * 客户身份取自 `@CurrentCustomer()`（CustomerJwtGuard 注入），客户名/邮箱/电话
 * 快照由 Service 从 Customer 记录自动填充。全局 ValidationPipe 已开
 * `whitelist + forbidNonWhitelisted`，这些字段在请求体中出现即返回 400，
 * 跨客户注入在验证层不可达。
 */
export class CreateCustomerInquiryDto {
  @ApiProperty({
    description: '询价单标题',
    example: '采购 320D 液压滤清器',
  })
  @IsString()
  @IsNotEmpty({ message: '询价单标题不能为空' })
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: '询价单描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: '收货地址ID（须为当前客户本人地址，由 Service 校验归属）',
  })
  @IsOptional()
  @IsString()
  shippingAddressId?: string;

  @ApiProperty({
    description: '明细行列表',
    type: [CreateInquiryLineItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateInquiryLineItemDto)
  lines: CreateInquiryLineItemDto[];
}