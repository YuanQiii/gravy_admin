import { Module } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
