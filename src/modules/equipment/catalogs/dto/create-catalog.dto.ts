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

export class CreateCatalogDto {
  @ApiProperty({ description: '目录名称', example: '润滑系统' })
  @IsString()
  @IsNotEmpty({ message: '目录名称不能为空' })
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({ description: '目录编码', example: 'LUB' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @ApiPropertyOptional({ description: '描述', example: '润滑系统相关设备' })
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
