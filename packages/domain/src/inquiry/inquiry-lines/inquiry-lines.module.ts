import { Module } from '@nestjs/common';
import { InquiryLinesService } from './inquiry-lines.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [InquiryLinesService],
  exports: [InquiryLinesService],
})
export class InquiryLinesModule {}
