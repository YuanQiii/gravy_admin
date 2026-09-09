import { Module } from '@nestjs/common';
import { BrowseModule } from './browse/browse.module';
import { InquiriesB2cModule } from './inquiries/inquiries-b2c.module';
import { AddressesB2cModule } from './addresses/addresses-b2c.module';

/**
 * B2C 消费域聚合模块：统一承载所有面向 B2C（匿名访客 + 客户）的端点。
 * 子模块各自注册 controller/provider，本模块仅聚合导入。
 * 阶段二"独立商城服务"迁移时，本模块即迁移根。
 */
@Module({
  imports: [BrowseModule, InquiriesB2cModule, AddressesB2cModule],
  exports: [BrowseModule, InquiriesB2cModule, AddressesB2cModule],
})
export class B2cModule {}