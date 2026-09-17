import { Module } from '@nestjs/common';
import { PrismaModule } from '@gvray/core';
import { InquiryPricingService } from './inquiry-pricing.service';

/**
 * 定价聚合 module：providers-only 的单一所有者（design 决策 1）。
 *
 * `InquiriesModule` 与 `InquiryLinesModule` 各自 import 本 module 即可注入
 * `InquiryPricingService` —— 聚合的触发点（明细行四种写 + 报价流转）与
 * 所有者（本服务）因此一一对应，任一方向内联都会形成环或复制。
 */
@Module({
  imports: [PrismaModule],
  providers: [InquiryPricingService],
  exports: [InquiryPricingService],
})
export class InquiryPricingModule {}
