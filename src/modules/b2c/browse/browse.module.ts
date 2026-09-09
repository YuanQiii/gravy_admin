import { Module } from '@nestjs/common';
import { FiltersModule } from '@/modules/equipment/filters/filters.module';
import { EquipmentServiceModule } from '@/modules/equipment/equipment/equipment.module';
import { CatalogsModule } from '@/modules/equipment/catalogs/catalogs.module';
import { BrandsModule } from '@/modules/equipment/brands/brands.module';
import { FilterTypesModule } from '@/modules/equipment/filter-types/filter-types.module';
import { B2CFiltersController } from './b2c-filters.controller';
import { B2CEquipmentController } from './b2c-equipment.controller';
import { B2CCatalogsController } from './b2c-catalogs.controller';
import { B2CBrandsController } from './b2c-brands.controller';
import { B2CFilterTypesController } from './b2c-filter-types.controller';

/**
 * B2C 公开浏览子模块：只读复用 equipment 域五个 Service，统一 `B2C_OPTS`
 * 触发 enabled-only + 加权排序。仅暴露 `b2c/*` 前缀路由，不承载任何后台逻辑。
 */
@Module({
  imports: [
    FiltersModule,
    EquipmentServiceModule,
    CatalogsModule,
    BrandsModule,
    FilterTypesModule,
  ],
  controllers: [
    B2CFiltersController,
    B2CEquipmentController,
    B2CCatalogsController,
    B2CBrandsController,
    B2CFilterTypesController,
  ],
})
export class BrowseModule {}