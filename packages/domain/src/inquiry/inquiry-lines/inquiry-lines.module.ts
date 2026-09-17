import { Module } from '@nestjs/common';
import { InquiryLinesService } from './inquiry-lines.service';
import { PrismaModule } from '@gvray/core';
import { InquiryPricingModule } from '../pricing/inquiry-pricing.module';


@Module({
  imports: [PrismaModule, InquiryPricingModule],
  providers: [InquiryLinesService],
  exports: [InquiryLinesService],
})
export class InquiryLinesModule {}
