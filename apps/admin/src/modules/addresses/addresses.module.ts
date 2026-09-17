import { Module } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { AddressesController } from './addresses.controller';
import { PrismaModule } from '@gvray/core';
import { CustomerAddressDeletionModule } from '@gvray/domain';

@Module({
  imports: [PrismaModule, CustomerAddressDeletionModule],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
