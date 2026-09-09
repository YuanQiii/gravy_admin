import { Module } from '@nestjs/common';
import { BrowseModule } from './browse/browse.module';
import { InquiriesMallModule } from './inquiries/inquiries-mall.module';
import { AddressesMallModule } from './addresses/addresses-mall.module';

/**
 * 商城消费域聚合模块：统一承载所有面向终端（匿名访客 + 客户）的端点。
 * 子模块各自注册 controller/provider，本模块仅聚合导入。
 */
@Module({
  imports: [BrowseModule, InquiriesMallModule, AddressesMallModule],
  exports: [BrowseModule, InquiriesMallModule, AddressesMallModule],
})
export class MallModule {}