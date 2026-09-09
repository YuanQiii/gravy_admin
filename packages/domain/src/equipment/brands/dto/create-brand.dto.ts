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

export class CreateBrandDto {
  @ApiProperty({ description: '品牌名称', example: 'Bosch' })
  @IsString()
  @IsNotEmpty({ message: '品牌名称不能为空' })
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({
    description: 'slug（URL 友好标识）',
    example: 'bosch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  slug?: string;

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
