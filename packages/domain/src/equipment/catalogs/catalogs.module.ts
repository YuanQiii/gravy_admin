import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
