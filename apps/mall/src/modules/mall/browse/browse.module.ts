import { Module } from '@nestjs/common';
import {
  BrandsModule,
  CatalogsModule,
  FilterTypesModule,
  FiltersModule,
  EquipmentServiceModule,
} from '@gvray/domain';
import { MallFiltersController } from './mall-filters.controller';
import { MallEquipmentController } from './mall-equipment.controller';
import { MallCatalogsController } from './mall-catalogs.controller';
import { MallBrandsController } from './mall-brands.controller';
import { MallFilterTypesController } from './mall-filter-types.controller';

/**
 * 商城公开浏览子模块：只读复用 equipment 域五个 Service，统一 `MALL_OPTS`
 * 触发 enabled-only + 加权排序。仅暴露公开路由，不承载任何后台逻辑。
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
    MallFiltersController,
    MallEquipmentController,
    MallCatalogsController,
    MallBrandsController,
    MallFilterTypesController,
  ],
})
export class BrowseModule {}