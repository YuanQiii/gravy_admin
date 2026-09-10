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
import { FilterDetailFlow } from './filter-detail.flow';
import { CustomerActivityModule } from '@/modules/customer-activity/customer-activity.module';

/**
 * 商城公开浏览编排子模块：只读复用 equipment 域五个 Service，统一 `MALL_OPTS`
 * 触发 enabled-only + 加权排序；并编排客户活动副作用（已登录客户浏览详情写历史，
 * 经 `FilterDetailFlow` 深模块收敛）。匿名浏览返回体与后台一致、零回归。
 */
@Module({
  imports: [
    FiltersModule,
    EquipmentServiceModule,
    CatalogsModule,
    BrandsModule,
    FilterTypesModule,
    CustomerActivityModule,
  ],
  controllers: [
    MallFiltersController,
    MallEquipmentController,
    MallCatalogsController,
    MallBrandsController,
    MallFilterTypesController,
  ],
  providers: [FilterDetailFlow],
})
export class BrowseModule {}