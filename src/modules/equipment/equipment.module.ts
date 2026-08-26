import { Module } from '@nestjs/common';
import { BrandsModule } from './brands/brands.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { FilterTypesModule } from './filter-types/filter-types.module';
import { FiltersModule } from './filters/filters.module';
import { EquipmentServiceModule } from './equipment/equipment.module';

/**
 * 设备业务域聚合模块：统一导出设备相关的所有子模块。
 * 子模块各自独立注册 controller/provider；本模块不承载任何 controller。
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
