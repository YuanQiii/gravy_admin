import { Module } from '@nestjs/common';
import { CustomerActivityService } from './customer-activity.service';
import { FavoritesController } from './favorites.controller';
import { HistoryController } from './history.controller';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  controllers: [FavoritesController, HistoryController],
  providers: [CustomerActivityService],
  exports: [CustomerActivityService],
})
export class CustomerActivityModule {}
