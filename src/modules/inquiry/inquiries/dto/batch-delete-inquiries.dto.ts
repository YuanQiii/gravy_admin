import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BatchDeleteInquiriesDto {
  @ApiProperty({
    description: '待删除询价单ID列表（inquiryId UUID）',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
