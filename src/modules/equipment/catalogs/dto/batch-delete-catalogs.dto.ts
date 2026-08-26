import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BatchDeleteCatalogsDto {
  @ApiProperty({ description: '待删除目录ID列表（catalogId UUID）', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
