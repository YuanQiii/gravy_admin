import { Module } from '@nestjs/common';
import { CustomersModule } from './customers/customers.module';
import { AddressesModule } from './addresses/addresses.module';
import { CustomerActivityModule } from './customer-activity/customer-activity.module';

/**
 * 客户业务域聚合模块：统一导出客户相关的所有子模块。
 * 子模块各自独立注册 controller/provider；本模块不承载任何 controller。
 */
@Module({
  imports: [CustomersModule, AddressesModule, CustomerActivityModule],
  exports: [CustomersModule, AddressesModule, CustomerActivityModule],
})
export class CustomerModule {}
