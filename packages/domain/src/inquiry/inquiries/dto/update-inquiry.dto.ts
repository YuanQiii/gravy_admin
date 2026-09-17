import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { CreateInquiryDto } from './create-inquiry.dto';

/**
 * 管理端更新询价单入参（PATCH）。
 *
 * **两个创建期字段被移出更新契约**（`derive-inquiry-price-aggregates`，含并入的
 * P0-2 验证发现 W1）：
 * - `totalAmount`：由服务端按明细行 `subtotal` 之和派生，入参指定即与明细矛盾；
 * - `shippingAddressId`：快照是创建时点的商业事实（P0-2 决策 2），PATCH 换址会
 *   造成「引用指向 B、快照仍是 A」的自相矛盾。
 *
 * **换址 / 改价 = 新建一张询价单**，不是就地改写既有单据的履约依据。
 * 由于 ValidationPipe 启用 `forbidNonWhitelisted`，携带这两个字段的请求得到 400
 * （而不是被静默忽略 —— 那是本项目已在 P2-2 批评过的"文档允许、实际无效"）。
 */
// totalAmount 已在 CreateInquiryDto 中整体移除（派生字段不入契约），无需在此 Omit。
export class UpdateInquiryDto extends PartialType(
  OmitType(CreateInquiryDto, ['shippingAddressId'] as const),
) {}
