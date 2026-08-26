import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BatchDeleteFiltersDto {
  @ApiProperty({ description: '待删除滤清器ID列表（filterId UUID）', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
