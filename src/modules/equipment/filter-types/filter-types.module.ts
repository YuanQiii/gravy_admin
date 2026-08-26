import { Module } from '@nestjs/common';
import { FilterTypesService } from './filter-types.service';
import { FilterTypesController } from './filter-types.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FilterTypesController],
  providers: [FilterTypesService],
  exports: [FilterTypesService],
})
export class FilterTypesModule {}
