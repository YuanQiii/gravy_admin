import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ description: '客户ID（customerId UUID）' })
  @IsString()
  @IsNotEmpty({ message: '客户ID不能为空' })
  customerId: string;

  @ApiProperty({ description: '收货人姓名', example: '张三' })
  @IsString()
  @IsNotEmpty({ message: '收货人不能为空' })
  @MaxLength(64)
  receiver: string;

  @ApiProperty({ description: '联系电话', example: '13800138000' })
  @IsString()
  @IsNotEmpty({ message: '联系电话不能为空' })
  @MaxLength(32)
  phone: string;

  @ApiProperty({ description: '省份', example: '广东省' })
  @IsString()
  @IsNotEmpty({ message: '省份不能为空' })
  @MaxLength(64)
  province: string;

  @ApiProperty({ description: '城市', example: '深圳市' })
  @IsString()
  @IsNotEmpty({ message: '城市不能为空' })
  @MaxLength(64)
  city: string;

  @ApiPropertyOptional({ description: '区/县' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  district?: string;

  @ApiProperty({ description: '详细地址', example: '科技园 xxx 路 yyy 号' })
  @IsString()
  @IsNotEmpty({ message: '详细地址不能为空' })
  @MaxLength(255)
  detailAddress: string;

  @ApiPropertyOptional({ description: '邮政编码', example: '518000' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  zipCode?: string;

  @ApiPropertyOptional({
    description: '是否默认地址',
    default: false,
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
