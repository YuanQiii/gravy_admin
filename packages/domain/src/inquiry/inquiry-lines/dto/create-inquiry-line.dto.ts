import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateInquiryLineDto {
  @ApiProperty({ description: '所属询价单ID（inquiryId UUID）' })
  @IsString()
  @IsNotEmpty({ message: '询价单ID不能为空' })
  inquiryId: string;

  @ApiPropertyOptional({
    description: '滤清器ID（关联 Filter，提供时自动快照产品信息）',
  })
  @IsOptional()
  @IsString()
  filterId?: string;

  @ApiPropertyOptional({
    description:
      '产品名称（filterId 未提供时必填，提供 filterId 时被滤清器型号覆盖）',
    example: 'OF-100',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @ApiPropertyOptional({ description: '数量', default: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ description: '单价', example: 25.5 })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  // subtotal 由服务端按 quantity × unitPrice 派生（derive-inquiry-price-aggregates），
  // 不再接受客户端传入 —— 这里的字段被移除后，forbidNonWhitelisted 会拒绝携带它的请求。

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: '排序', default: 0, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
