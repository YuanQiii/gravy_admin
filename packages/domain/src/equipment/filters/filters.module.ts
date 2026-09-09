import { Module } from '@nestjs/common';
import { FiltersService } from './filters.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [FiltersService],
  exports: [FiltersService],
})
export class FiltersModule {}
