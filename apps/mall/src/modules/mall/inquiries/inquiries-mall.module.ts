import { Module } from '@nestjs/common';
import { InquiriesModule } from '@gvray/domain';
import { MallInquiriesController } from './mall-inquiries.controller';

/**
 * 商城客户自助询价子模块：复用 InquiriesModule 导出的 InquiriesService
 * （createForCustomer/findMyInquiries/findOneForCustomer），不复制查询实现。
 */
@Module({
  imports: [InquiriesModule],
  controllers: [MallInquiriesController],
})
export class InquiriesMallModule {}