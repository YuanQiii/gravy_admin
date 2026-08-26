import { Global, Module } from '@nestjs/common';
import { SoftDeleteService } from './soft-delete.service';

/**
 * 软删除与唯一性校验集中服务模块（@Global，与 PrismaModule 同模式）
 *
 * 9 个业务 service 注入 SoftDeleteService，无需在每个 feature module 重复 imports。
 */
@Global()
@Module({
  providers: [SoftDeleteService],
  exports: [SoftDeleteService],
})
export class SoftDeleteModule {}
