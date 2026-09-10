import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * B2C 询价单明细行 DTO。
 *
 * 去掉了后台 `CreateInquiryLineDto` 的 `inquiryId`（归属当次询价，由 Service
 * 在建询价主体的事务内写入），也不接受 `model`/`typeName`（快照由 Service
 * 从 Filter 记录填充，不接受客户端传入）。
 */
export class CreateInquiryLineItemDto {
  @ApiPropertyOptional({
    description: '滤清器ID（关联 Filter，提供时自动快照产品信息）',
  })
  @IsOptional()
  @IsString()
  filterId?: string;

  @ApiPropertyOptional({
    description: '产品名称（filterId 未提供时必填，提供时被滤清器型号覆盖）',
    example: 'OF-100',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @ApiPropertyOptional({ description: '数量', default: 1, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99999)
  quantity?: number;

  @ApiPropertyOptional({ description: '优先级排序', default: 0, type: 'integer' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remarks?: string;
}