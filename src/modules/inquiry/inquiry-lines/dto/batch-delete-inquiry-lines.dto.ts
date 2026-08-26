import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BatchDeleteInquiryLinesDto {
  @ApiProperty({
    description: '待删除询价单明细ID列表（inquiryLineId UUID）',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
