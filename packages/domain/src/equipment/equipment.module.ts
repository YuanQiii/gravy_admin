import { Module } from '@nestjs/common';
import { BrandsModule } from './brands/brands.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { FilterTypesModule } from './filter-types/filter-types.module';
import { FiltersModule } from './filters/filters.module';
import { EquipmentServiceModule } from './equipment/equipment.module';

/**
 * 设备业务域聚合模块：统一导出设备相关的所有 providers-only 子模块。
 * 子模块各自独立注册 service provider；本模块与子模块均不承载 controller
 * （controller 属 admin 侧关注点，留在 src/modules/equipment/**）。
 */
@Module({
  imports: [
    BrandsModule,
    CatalogsModule,
    FilterTypesModule,
    FiltersModule,
    EquipmentServiceModule,
  ],
  exports: [
    BrandsModule,
    CatalogsModule,
    FilterTypesModule,
    FiltersModule,
    EquipmentServiceModule,
  ],
})
export class EquipmentModule {}
