import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class HotStatusBrandsDto {
  @ApiProperty({
    description: '待配置热门状态的品牌ID列表（brandId UUID，单条传一个元素）',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ description: '是否热门品牌' })
  @IsBoolean()
  isHot: boolean;

  @ApiPropertyOptional({
    description: '热门排序（可空，未设则按生效设备数/入库时间兜底）',
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  hotOrder?: number;
}