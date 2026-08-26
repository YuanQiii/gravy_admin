import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class AttachFiltersDto {
  @ApiProperty({
    description: '待挂载的滤清器ID列表（filterId UUID）',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  filterIds: string[];
}
