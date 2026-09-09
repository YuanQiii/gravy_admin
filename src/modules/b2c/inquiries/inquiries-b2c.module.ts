import { Module } from '@nestjs/common';
import { InquiriesModule } from '@gvray/domain';
import { B2CInquiriesController } from './b2c-inquiries.controller';

/**
 * B2C 客户自助询价子模块：复用 InquiriesModule 导出的 InquiriesService
 * （createForCustomer/findMyInquiries/findOneForCustomer），不复制查询实现。
 */
@Module({
  imports: [InquiriesModule],
  controllers: [B2CInquiriesController],
})
export class InquiriesB2cModule {}