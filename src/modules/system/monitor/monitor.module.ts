import { Module } from '@nestjs/common';
import { PrismaModule } from '@gvray/core';

import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { CacheMonitorService } from './cache-monitor.service';

@Module({
  imports: [PrismaModule],
  controllers: [MonitorController],
  providers: [MonitorService, CacheMonitorService],
  exports: [MonitorService, CacheMonitorService],
})
export class MonitorModule {}
