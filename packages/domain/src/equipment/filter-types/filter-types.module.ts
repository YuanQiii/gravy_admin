import { Module } from '@nestjs/common';
import { FilterTypesService } from './filter-types.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [FilterTypesService],
  exports: [FilterTypesService],
})
export class FilterTypesModule {}
