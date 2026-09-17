import { Module } from '@nestjs/common';
import { InquiriesService } from './inquiries.service';
import { PrismaModule } from '@gvray/core';
import { InquiryPricingModule } from '../pricing/inquiry-pricing.module';


@Module({
  imports: [PrismaModule, InquiryPricingModule],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
