import { Module } from '@nestjs/common';
import { EquipmentModule as DomainEquipmentModule } from '@gvray/domain';
import { BrandsController } from './brands/brands.controller';
import { CatalogsController } from './catalogs/catalogs.controller';
import { FilterTypesController } from './filter-types/filter-types.controller';
import { FiltersController } from './filters/filters.controller';
import { EquipmentController } from './equipment/equipment.controller';

/**
 * 设备业务域后台聚合模块：注册 admin 侧各 Controller（服务由 @gvray/domain 提供）。
 * 仅承载 controller，不注册任何 provider；domain 侧服务经导入的
 * `DomainEquipmentModule` 注入。本模块仅被 app.module 消费，不对外导出。
 */
@Module({
  imports: [DomainEquipmentModule],
  controllers: [
    BrandsController,
    CatalogsController,
    FilterTypesController,
    FiltersController,
    EquipmentController,
  ],
})
export class EquipmentModule {}