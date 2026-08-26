import { Module } from '@nestjs/common';
import { InquiriesModule } from './inquiries/inquiries.module';
import { InquiryLinesModule } from './inquiry-lines/inquiry-lines.module';

@Module({
  imports: [InquiriesModule, InquiryLinesModule],
  exports: [InquiriesModule, InquiryLinesModule],
})
export class InquiryModule {}
