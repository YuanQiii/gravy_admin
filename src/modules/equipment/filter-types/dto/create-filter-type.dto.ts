import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateFilterTypeDto {
  @ApiProperty({ description: '滤清器类型名称', example: '机油滤清器' })
  @IsString()
  @IsNotEmpty({ message: '滤清器类型名称不能为空' })
  @MaxLength(128)
  name: string;

  @ApiProperty({ description: '滤清器类型编码', example: 'OIL_FILTER' })
  @IsString()
  @IsNotEmpty({ message: '滤清器类型编码不能为空' })
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional({ description: '描述', example: '机油滤清器类设备' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '排序', default: 0, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;
}
