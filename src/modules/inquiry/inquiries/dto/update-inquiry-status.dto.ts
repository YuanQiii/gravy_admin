import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { INQUIRY_STATUS_VALUES } from '@/shared/constants/inquiry.constant';

export class UpdateInquiryStatusDto {
  @ApiProperty({
    description: '询价单状态（draft/submitted/quoted/expired）',
    enum: INQUIRY_STATUS_VALUES,
    example: 'submitted',
  })
  @IsString()
  @IsIn(INQUIRY_STATUS_VALUES)
  status: string;

  @ApiPropertyOptional({
    description: '过期时间（ISO 8601 日期字符串，仅 submitted→quoted 流转时有效）',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
