import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { InquiryLineResponseDto } from '../../inquiry-lines/dto/inquiry-line-response.dto';
import { InquiryResponseDto } from './inquiry-response.dto';

/**
 * 询价单详情响应 —— 详情专属，承载该询价单的未软删除明细行集合。
 *
 * 列表端点与写端点继续使用 `InquiryResponseDto`（不含 `inquiryLines`），
 * 响应结构保持稳定。本 DTO 由 `InquiriesService.projectInquiryDetail` 唯一
 * 构造（见 CONTEXT.md 词条 `Inquiry response projection`）。
 *
 * 明细行元素直接复用 `InquiryLineResponseDto`：父子继承保证基础字段集一致，
 * 且金额字段的数值化由该 DTO 自身的 `@Type(() => Number)` 承担
 * —— 与 Admin 明细行端点共用同一序列化规则，不存在两副口径。
 */
export class InquiryDetailResponseDto extends InquiryResponseDto {
  @ApiPropertyOptional({
    description:
      '询价单明细行（仅未软删除；按 sortOrder 升序、同值按 createdAt 升序）。仅详情端点返回，列表与写端点不携带',
    type: [InquiryLineResponseDto],
  })
  @Expose()
  @Type(() => InquiryLineResponseDto)
  inquiryLines?: InquiryLineResponseDto[];
}
