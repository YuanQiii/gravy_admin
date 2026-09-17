import { Module } from '@nestjs/common';
import { CustomerActivityService } from './customer-activity.service';
import { HistorySideEffectService } from './history-side-effect.service';
import { FavoritesController } from './favorites.controller';
import { HistoryController } from './history.controller';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  controllers: [FavoritesController, HistoryController],
  providers: [CustomerActivityService, HistorySideEffectService],
  exports: [CustomerActivityService, HistorySideEffectService],
})
export class CustomerActivityModule {}
