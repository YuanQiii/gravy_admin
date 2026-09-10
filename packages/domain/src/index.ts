/**
 * `@gvray/domain` 唯一公开导入面。
 *
 * 设备（equipment）与询价（inquiry）业务域的服务 / DTO / 纯函数 / 模块
 * 仅通过本文件对外暴露；模块内部实现（controller 属 admin 侧关注点，留在 src）
 * 不对外可见。详见 AGENTS.md 与迁移 ADR。
 */

// ── equipment / 纯排序函数 ────────────────────────────────────────
export {
  runWeightedSort,
  WeightedField,
  WeightedSortSpec,
  QueryRawExecutor,
} from './equipment/weighted-sort';
export {
  rankHotBrands,
  HotRankBrand,
  HotRankedBrand,
} from './equipment/brands/hot-ranking';

// ── equipment / 品牌 ───────────────────────────────────────────────
export { BrandsService } from './equipment/brands/brands.service';
export { BrandsModule } from './equipment/brands/brands.module';
export { CreateBrandDto } from './equipment/brands/dto/create-brand.dto';
export { UpdateBrandDto } from './equipment/brands/dto/update-brand.dto';
export { QueryBrandDto } from './equipment/brands/dto/query-brand.dto';
export { BrandResponseDto } from './equipment/brands/dto/brand-response.dto';
export { BatchDeleteBrandsDto } from './equipment/brands/dto/batch-delete-brands.dto';
export { HotBrandQueryDto } from './equipment/brands/dto/hot-brand-query.dto';
export { HotBrandResponseDto } from './equipment/brands/dto/hot-brand-response.dto';
export { HotStatusBrandsDto } from './equipment/brands/dto/hot-status-brands.dto';

// ── equipment / 目录 ───────────────────────────────────────────────
export { CatalogsService } from './equipment/catalogs/catalogs.service';
export { CatalogsModule } from './equipment/catalogs/catalogs.module';
export { CreateCatalogDto } from './equipment/catalogs/dto/create-catalog.dto';
export { UpdateCatalogDto } from './equipment/catalogs/dto/update-catalog.dto';
export { QueryCatalogDto } from './equipment/catalogs/dto/query-catalog.dto';
export { CatalogResponseDto } from './equipment/catalogs/dto/catalog-response.dto';
export { BatchDeleteCatalogsDto } from './equipment/catalogs/dto/batch-delete-catalogs.dto';

// ── equipment / 滤清器类型 ─────────────────────────────────────────
export { FilterTypesService } from './equipment/filter-types/filter-types.service';
export { FilterTypesModule } from './equipment/filter-types/filter-types.module';
export { CreateFilterTypeDto } from './equipment/filter-types/dto/create-filter-type.dto';
export { UpdateFilterTypeDto } from './equipment/filter-types/dto/update-filter-type.dto';
export { QueryFilterTypeDto } from './equipment/filter-types/dto/query-filter-type.dto';
export { FilterTypeResponseDto } from './equipment/filter-types/dto/filter-type-response.dto';
export { BatchDeleteFilterTypesDto } from './equipment/filter-types/dto/batch-delete-filter-types.dto';

// ── equipment / 滤清器 ─────────────────────────────────────────────
export { FiltersService } from './equipment/filters/filters.service';
export {
  ACTIVE_FILTER_WHERE,
  assertFilterBrowseable,
} from './equipment/filters/active-filter';
export { FiltersModule } from './equipment/filters/filters.module';
export { CreateFilterDto } from './equipment/filters/dto/create-filter.dto';
export { UpdateFilterDto } from './equipment/filters/dto/update-filter.dto';
export { QueryFilterDto } from './equipment/filters/dto/query-filter.dto';
export { FilterResponseDto } from './equipment/filters/dto/filter-response.dto';
export { BatchDeleteFiltersDto } from './equipment/filters/dto/batch-delete-filters.dto';

// ── equipment / 设备档案 ───────────────────────────────────────────
export { EquipmentService } from './equipment/equipment/equipment.service';
export { EquipmentServiceModule } from './equipment/equipment/equipment.module';
export { CreateEquipmentDto } from './equipment/equipment/dto/create-equipment.dto';
export { UpdateEquipmentDto } from './equipment/equipment/dto/update-equipment.dto';
export { QueryEquipmentDto } from './equipment/equipment/dto/query-equipment.dto';
export { EquipmentResponseDto } from './equipment/equipment/dto/equipment-response.dto';
export { BatchDeleteEquipmentDto } from './equipment/equipment/dto/batch-delete-equipment.dto';
export { AttachFiltersDto } from './equipment/equipment/dto/attach-filters.dto';

// ── equipment / 聚合模块（providers-only，注册各子域模块）──────────
export { EquipmentModule } from './equipment/equipment.module';

// ── inquiry / 询价单 ───────────────────────────────────────────────
export { InquiriesService } from './inquiry/inquiries/inquiries.service';
export { InquiriesModule } from './inquiry/inquiries/inquiries.module';
export { CreateInquiryDto } from './inquiry/inquiries/dto/create-inquiry.dto';
export { UpdateInquiryDto } from './inquiry/inquiries/dto/update-inquiry.dto';
export { UpdateInquiryStatusDto } from './inquiry/inquiries/dto/update-inquiry-status.dto';
export { QueryInquiryDto } from './inquiry/inquiries/dto/query-inquiry.dto';
export { InquiryResponseDto } from './inquiry/inquiries/dto/inquiry-response.dto';
export { BatchDeleteInquiriesDto } from './inquiry/inquiries/dto/batch-delete-inquiries.dto';
export { CreateCustomerInquiryDto } from './inquiry/inquiries/dto/customer-b2c/create-customer-inquiry.dto';
export { CreateInquiryLineItemDto } from './inquiry/inquiries/dto/customer-b2c/create-inquiry-line-item.dto';

// ── inquiry / 询价单明细 ───────────────────────────────────────────
export { InquiryLinesService } from './inquiry/inquiry-lines/inquiry-lines.service';
export { InquiryLinesModule } from './inquiry/inquiry-lines/inquiry-lines.module';
export { CreateInquiryLineDto } from './inquiry/inquiry-lines/dto/create-inquiry-line.dto';
export { UpdateInquiryLineDto } from './inquiry/inquiry-lines/dto/update-inquiry-line.dto';
export { QueryInquiryLineDto } from './inquiry/inquiry-lines/dto/query-inquiry-line.dto';
export { InquiryLineResponseDto } from './inquiry/inquiry-lines/dto/inquiry-line-response.dto';
export { BatchDeleteInquiryLinesDto } from './inquiry/inquiry-lines/dto/batch-delete-inquiry-lines.dto';

// ── inquiry / 聚合模块（providers-only，注册各子域模块）──────────────
export { InquiryModule } from './inquiry/inquiry.module';