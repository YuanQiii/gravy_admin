import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class BatchDeleteCustomersDto {
  @ApiProperty({ description: '待删除客户ID列表（customerId UUID）', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
