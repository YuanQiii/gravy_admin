import { Module } from '@nestjs/common';
import { PrismaModule } from '@gvray/core';

import { MallAddressesController } from './mall-addresses.controller';
import { CustomerAddressesService } from './customer-addresses.service';

/**
 * 商城客户自助收货地址 self 域子模块。独立 Service（不并入后台 AddressesService，
 * 两个信任维度），后台 `customer/addresses` 管理端点保持不动。
 */
@Module({
  imports: [PrismaModule],
  controllers: [MallAddressesController],
  providers: [CustomerAddressesService],
})
export class AddressesMallModule {}