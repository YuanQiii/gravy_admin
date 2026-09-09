import { Module } from '@nestjs/common';
import { InquiriesService } from './inquiries.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
