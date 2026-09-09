import { Module } from '@nestjs/common';
import { InquiryModule as DomainInquiryModule } from '@gvray/domain';
import { InquiriesController } from './inquiries/inquiries.controller';
import { InquiryLinesController } from './inquiry-lines/inquiry-lines.controller';

/**
 * 询价业务域后台聚合模块：注册 admin 侧各 Controller（服务由 @gvray/domain 提供）。
 * 仅承载 controller，不注册任何 provider；domain 侧服务经导入的
 * `DomainInquiryModule` 注入。本模块仅被 app.module 消费，不对外导出。
 */
@Module({
  imports: [DomainInquiryModule],
  controllers: [InquiriesController, InquiryLinesController],
})
export class InquiryModule {}