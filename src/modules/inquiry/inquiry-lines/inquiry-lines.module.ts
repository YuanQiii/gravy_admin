import { Module } from '@nestjs/common';
import { InquiryLinesService } from './inquiry-lines.service';
import { InquiryLinesController } from './inquiry-lines.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InquiryLinesController],
  providers: [InquiryLinesService],
  exports: [InquiryLinesService],
})
export class InquiryLinesModule {}
