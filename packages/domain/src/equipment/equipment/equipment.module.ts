import { Module } from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { PrismaModule } from '@gvray/core';


@Module({
  imports: [PrismaModule],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class EquipmentServiceModule {}
