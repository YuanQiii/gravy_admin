import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma, Filter } from '@prisma/client';
import { PrismaService, BaseService, VisibilityOpts, isB2cVisibility, SoftDeleteService, PaginationData, isEquipmentEngineEnergy } from '@gvray/core';





import { runWeightedSort, WeightedField } from '../weighted-sort';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { QueryEquipmentDto } from './dto/query-equipment.dto';
import { EquipmentResponseDto } from './dto/equipment-response.dto';
import { FilterResponseDto } from '../filters/dto/filter-response.dto';

/**
 * 设备档案错误码前缀（复合唯一约束 [brandName, model] 兜底）。
 */
const EQUIPMENT_UNIQUE_PREFIX = 'EQUIPMENT_EQUIPMENT';

/**
 * B2C 浏览场景 — Equipment 匿名加权排序字段表。
 *
 * schema Equipment 的业务 nullable 字段共 8 个（不含审计/删除字段）：
 *   brandId, catalogId, engineBrand, engineType, power, engineEnergy,
 *   productionDateStart, productionDateEnd
 *
 * 三档权重（按 B2C 客户决策价值）：
 * - 核心参数（引擎四要素）w=5: engineBrand / engineType / power / engineEnergy
 * - 生命周期（产品起止）w=3:   productionDateStart / productionDateEnd
 * - 关联完整性（外键）w=1:     brandId / catalogId
 *
 * 列名经 schema @@map + 迁移约定为 camelCase，raw SQL 需带双引号。
 * isString=true 的字段同时判 `!= ''` 防空字符串脏数据。
 */
const EQUIPMENT_WEIGHTED_FIELDS: ReadonlyArray<WeightedField> = [
  // w=5: 引擎核心参数（共 4 项，满分 20）
  { field: 'engineBrand', weight: 5, isString: true },
  { field: 'engineType', weight: 5, isString: true },
  { field: 'power', weight: 5, isString: false },
  { field: 'engineEnergy', weight: 5, isString: true },
  // w=3: 产品生命周期（共 2 项，满分 6）
  { field: 'productionDateStart', weight: 3, isString: false },
  { field: 'productionDateEnd', weight: 3, isString: false },
  // w=1: 关联完整性（共 2 项，满分 2）
  { field: 'brandId', weight: 1, isString: true },
  { field: 'catalogId', weight: 1, isString: true },
];

@Injectable()
export class EquipmentService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateEquipmentDto,
    createdById?: string,
  ): Promise<EquipmentResponseDto> {
    if (dto.engineEnergy && !isEquipmentEngineEnergy(dto.engineEnergy)) {
      throw new BadRequestException(
        'EQUIPMENT_EQUIPMENT_ENGINE_ENERGY_INVALID',
      );
    }

    const brandName = await this.resolveBrandNameForCreate(
      dto.brandId,
      dto.brandName,
    );
    const catalogName = await this.resolveCatalogNameForCreate(
      dto.catalogId,
      dto.catalogName,
    );

    await this.assertCompositeUnique(brandName, dto.model);

    const {
      brandName: _ignoredBrandName,
      catalogName: _ignoredCatalogName,
      productionDateStart: rawStart,
      productionDateEnd: rawEnd,
      ...rest
    } = dto;

    try {
      const equipment = await this.prisma.equipment.create({
        data: {
          ...rest,
          brandName,
          catalogName,
          productionDateStart: rawStart ? new Date(rawStart) : null,
          productionDateEnd: rawEnd ? new Date(rawEnd) : null,
          createdById: createdById ?? null,
        },
      });
      return plainToInstance(EquipmentResponseDto, equipment, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryEquipmentDto,
    opts?: VisibilityOpts,
  ): Promise<PaginationData<EquipmentResponseDto>> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { model: { contains: query.keyword, mode: 'insensitive' } },
        { brandName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    // model / brandName 精确匹配（忽略大小写）——与 keyword 模糊搜索 AND 叠加
    if (query.model) {
      where.model = { equals: query.model, mode: 'insensitive' };
    }
    if (query.brandName) {
      where.brandName = { equals: query.brandName, mode: 'insensitive' };
    }
    if (query.brandId) where.brandId = query.brandId;
    if (query.catalogId) where.catalogId = query.catalogId;
    if (query.engineEnergy) where.engineEnergy = query.engineEnergy;
    if (query.status) where.status = query.status;
    this.applyVisibility(where, opts);

    // B2C 浏览域（anonymous / b2c）走加权排序 — 信息齐全产品优先，
    // sortBy 参数被忽略，保证产品决策排序体验一致。
    if (isB2cVisibility(opts)) {
      return this.findAllWithWeightedSort(query, where);
    }

    const result = await this.paginateWithSort(
      this.prisma.equipment,
      query,
      where,
      undefined,
      'sortOrder',
    );
    return {
      ...result,
      items: plainToInstance(EquipmentResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * B2C 浏览域 Equipment 加权排序查询。
   *
   * 排序：加权分 DESC（信息齐全优先）→ sortOrder DESC（运营权重兜底）
   *      → createdAt DESC（最后入库兜底，保证翻页稳定）。
   *
   * 约束同 filters.service: where 条件参数化防注入，加权求和片段为
   * 静态常量内联（字段名和权重都是硬编码）。
   */
  private async findAllWithWeightedSort(
    query: QueryEquipmentDto,
    where: Record<string, unknown>,
  ): Promise<PaginationData<EquipmentResponseDto>> {
    const conditions = this.buildWeightedConditions(where);

    return runWeightedSort<EquipmentResponseDto>(this.prisma, {
      table: 'equipment',
      fields: EQUIPMENT_WEIGHTED_FIELDS,
      conditions,
      pagination: query,
      dto: EquipmentResponseDto,
      count: () =>
        this.prisma.equipment.count({
          where: where as Prisma.EquipmentWhereInput,
        }),
    });
  }

  /**
   * B2C 加权排序的 raw SQL `conditions` 单一来源构建器。
   *
   * 从 `findAll` 已归一化的 Prisma `where` 单向推导参数化 SQL 条件，
   * 与 `runWeightedSort` 的 `count()`（同一 `where`）始终同源，列表与
   * total 不可能发散；新增 query 参数只需改 `findAll` 一处 + 此处映射一处。
   *
   * keyword 从 `where.OR` 读出 model/brandName 两项拼 ILIKE——与
   * `findAll` 中 `contains + mode:'insensitive'` 语义等价，SQL 逐字保持。
   */
  private buildWeightedConditions(
    where: Record<string, unknown>,
  ): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];
    if (where.status) {
      conditions.push(Prisma.sql`"status" = ${where.status as string}`);
    }
    if (where.brandId) {
      conditions.push(Prisma.sql`"brandId" = ${where.brandId as string}`);
    }
    if (where.catalogId) {
      conditions.push(Prisma.sql`"catalogId" = ${where.catalogId as string}`);
    }
    if (where.engineEnergy) {
      conditions.push(
        Prisma.sql`"engineEnergy" = ${where.engineEnergy as string}`,
      );
    }
    // model / brandName 精确匹配（忽略大小写）——与 Prisma 侧 equals+mode:insensitive 语义一致
    const model = this.readExactFilterValue(where.model);
    if (model) {
      conditions.push(Prisma.sql`"model" ILIKE ${model}`);
    }
    const brandName = this.readExactFilterValue(where.brandName);
    if (brandName) {
      conditions.push(Prisma.sql`"brandName" ILIKE ${brandName}`);
    }
    if (Array.isArray(where.OR)) {
      const or = where.OR as Array<{
        model?: { contains: string };
        brandName?: { contains: string };
      }>;
      const keyword =
        or.find((o) => o.model?.contains)?.model?.contains ||
        or.find((o) => o.brandName?.contains)?.brandName?.contains;
      if (keyword) {
        const pattern = `%${keyword}%`;
        conditions.push(
          Prisma.sql`("model" ILIKE ${pattern} OR "brandName" ILIKE ${pattern})`,
        );
      }
    }
    return conditions;
  }

  /**
   * 从 findAll 归一化的 Prisma where 中读回精确匹配值：
   * 兼容 `{ equals, mode }` 对象形态（model / brandName）与普通字符串形态。
   */
  private readExactFilterValue(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { equals?: unknown }).equals === 'string'
    ) {
      return (value as { equals: string }).equals;
    }
    return undefined;
  }

  async findOne(
    equipmentId: string,
    opts?: VisibilityOpts,
  ): Promise<EquipmentResponseDto> {
    const isB2c = isB2cVisibility(opts);
    const equipment = await this.prisma.equipment.findUnique({
      where: { equipmentId },
      include: {
        equipmentFilters: {
          // B2C 浏览域（anonymous / b2c）仅看到关联的 enabled 滤清器；
          // 管理域登录用户看全量。
          ...(isB2c ? { where: { filter: { status: 'enabled' } } } : {}),
          include: { filter: true },
        },
      },
    });
    if (!equipment || equipment.deletedAt) {
      throw new NotFoundException('EQUIPMENT_EQUIPMENT_NOT_FOUND');
    }
    this.assertVisible(equipment, opts);
    const { equipmentFilters, ...rest } = equipment;
    return plainToInstance(
      EquipmentResponseDto,
      {
        ...rest,
        // 嵌套 filter 含 Prisma Decimal，须先过 FilterResponseDto（@Type(() => Number)）
        // 否则 class-transformer 以 Decimal 构造器重建实例时抛 Invalid argument。
        equipmentFilters: equipmentFilters.map((ef) => ({
          ...ef,
          filter: plainToInstance(FilterResponseDto, ef.filter, {
            excludeExtraneousValues: true,
          }),
        })),
      },
      { excludeExtraneousValues: true },
    );
  }

  async update(
    equipmentId: string,
    dto: UpdateEquipmentDto,
    updatedById?: string,
  ): Promise<EquipmentResponseDto> {
    const existing = await this.prisma.equipment.findUnique({
      where: { equipmentId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('EQUIPMENT_EQUIPMENT_NOT_FOUND');
    }

    if (dto.engineEnergy && !isEquipmentEngineEnergy(dto.engineEnergy)) {
      throw new BadRequestException(
        'EQUIPMENT_EQUIPMENT_ENGINE_ENERGY_INVALID',
      );
    }

    const newBrandName = await this.resolveBrandNameForUpdate(
      dto.brandId,
      dto.brandName,
      existing.brandId,
      existing.brandName,
    );
    const newCatalogName = await this.resolveCatalogNameForUpdate(
      dto.catalogId,
      dto.catalogName,
      existing.catalogId,
      existing.catalogName,
    );
    const newModel = dto.model ?? existing.model;

    // 复合唯一性重新校验（排除自身）
    if (newModel !== existing.model || newBrandName !== existing.brandName) {
      await this.assertCompositeUnique(newBrandName, newModel, equipmentId);
    }

    const {
      brandName: _ignoredBrandName,
      catalogName: _ignoredCatalogName,
      productionDateStart: rawStart,
      productionDateEnd: rawEnd,
      ...rest
    } = dto;

    const data: Prisma.EquipmentUncheckedUpdateInput = {
      ...rest,
      brandName: newBrandName,
      catalogName: newCatalogName,
      updatedById: updatedById ?? null,
    };
    if (rawStart !== undefined) {
      data.productionDateStart = rawStart ? new Date(rawStart) : null;
    }
    if (rawEnd !== undefined) {
      data.productionDateEnd = rawEnd ? new Date(rawEnd) : null;
    }

    try {
      const equipment = await this.prisma.equipment.update({
        where: { equipmentId },
        data,
      });
      return plainToInstance(EquipmentResponseDto, equipment, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(equipmentId: string): Promise<void> {
    const existing = await this.prisma.equipment.findUnique({
      where: { equipmentId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('EQUIPMENT_EQUIPMENT_NOT_FOUND');
    }
    await this.softDelete.softDelete(
      this.prisma.equipment,
      'equipmentId',
      equipmentId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.equipment.updateMany({
      where: { equipmentId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async attachFilters(
    equipmentId: string,
    filterIds: string[],
  ): Promise<{ added: number; skipped: number }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.equipmentFilter.findMany({
        where: { equipmentId, filterId: { in: filterIds } },
        select: { filterId: true },
      });
      const toAdd = filterIds.filter(
        (id) => !existing.some((e) => e.filterId === id),
      );
      if (toAdd.length > 0) {
        await tx.equipmentFilter.createMany({
          data: toAdd.map((filterId) => ({ equipmentId, filterId })),
          skipDuplicates: true,
        });
      }
      return { added: toAdd.length, skipped: existing.length };
    });
  }

  async detachFilter(equipmentId: string, filterId: string): Promise<void> {
    await this.prisma.equipmentFilter.deleteMany({
      where: { equipmentId, filterId },
    });
  }

  async listFilters(equipmentId: string): Promise<Filter[]> {
    const items = await this.prisma.equipmentFilter.findMany({
      where: { equipmentId },
      include: { filter: true },
    });
    return items.map((ef) => ef.filter).filter((f): f is Filter => f !== null);
  }

  /**
   * create 场景品牌快照解析：提供 brandId 则读品牌名称；否则要求 brandName。
   */
  private async resolveBrandNameForCreate(
    brandId: string | undefined,
    brandName: string | undefined,
  ): Promise<string> {
    if (brandId) {
      const brand = await this.prisma.equipmentBrand.findUnique({
        where: { brandId },
      });
      if (!brand || brand.deletedAt) {
        throw new NotFoundException('EQUIPMENT_BRAND_NOT_FOUND');
      }
      return brand.name;
    }
    if (!brandName) {
      throw new BadRequestException('EQUIPMENT_BRAND_NAME_REQUIRED');
    }
    return brandName;
  }

  private async resolveCatalogNameForCreate(
    catalogId: string | undefined,
    catalogName: string | undefined,
  ): Promise<string> {
    if (catalogId) {
      const catalog = await this.prisma.equipmentCatalog.findUnique({
        where: { catalogId },
      });
      if (!catalog || catalog.deletedAt) {
        throw new NotFoundException('EQUIPMENT_CATALOG_NOT_FOUND');
      }
      return catalog.name;
    }
    if (!catalogName) {
      throw new BadRequestException('EQUIPMENT_CATALOG_NAME_REQUIRED');
    }
    return catalogName;
  }

  /**
   * update 场景品牌快照解析：brandId 变更则读新品牌名称；否则用 dto.brandName 或保持原值。
   */
  private async resolveBrandNameForUpdate(
    brandId: string | undefined,
    brandName: string | undefined,
    existingBrandId: string | null,
    existingBrandName: string,
  ): Promise<string> {
    if (brandId !== undefined && brandId !== existingBrandId) {
      if (brandId !== null) {
        const brand = await this.prisma.equipmentBrand.findUnique({
          where: { brandId },
        });
        if (!brand || brand.deletedAt) {
          throw new NotFoundException('EQUIPMENT_BRAND_NOT_FOUND');
        }
        return brand.name;
      }
      // 显式置空品牌：要求显式提供 brandName 快照
      if (!brandName) {
        throw new BadRequestException('EQUIPMENT_BRAND_NAME_REQUIRED');
      }
      return brandName;
    }
    if (brandName !== undefined) {
      return brandName;
    }
    return existingBrandName;
  }

  private async resolveCatalogNameForUpdate(
    catalogId: string | undefined,
    catalogName: string | undefined,
    existingCatalogId: string | null,
    existingCatalogName: string,
  ): Promise<string> {
    if (catalogId !== undefined && catalogId !== existingCatalogId) {
      if (catalogId !== null) {
        const catalog = await this.prisma.equipmentCatalog.findUnique({
          where: { catalogId },
        });
        if (!catalog || catalog.deletedAt) {
          throw new NotFoundException('EQUIPMENT_CATALOG_NOT_FOUND');
        }
        return catalog.name;
      }
      if (!catalogName) {
        throw new BadRequestException('EQUIPMENT_CATALOG_NAME_REQUIRED');
      }
      return catalogName;
    }
    if (catalogName !== undefined) {
      return catalogName;
    }
    return existingCatalogName;
  }

  /**
   * 复合唯一性校验（brandName + model）。create 不传 excludeEquipmentId；
   * update 传 excludeEquipmentId 排除自身。活跃冲突与软删除冲突分别抛出。
   */
  private async assertCompositeUnique(
    brandName: string,
    model: string,
    excludeEquipmentId?: string,
  ): Promise<void> {
    const baseWhere: Record<string, unknown> = { brandName, model };
    if (excludeEquipmentId) {
      baseWhere.NOT = { equipmentId: excludeEquipmentId };
    }

    const activeConflict = await this.prisma.equipment.findFirst({
      where: { ...baseWhere, deletedAt: null },
      select: { equipmentId: true },
    });
    if (activeConflict) {
      throw new ConflictException('EQUIPMENT_EQUIPMENT_DUPLICATED');
    }

    const softDeletedConflict = await this.prisma.equipment.findFirst({
      where: { ...baseWhere, deletedAt: { not: null } },
      select: { equipmentId: true },
    });
    if (softDeletedConflict) {
      throw new ConflictException(
        'EQUIPMENT_EQUIPMENT_DUPLICATED_SOFT_DELETED',
      );
    }
  }

  /**
   * P2002 兜底：复合唯一约束冲突统一使用 EQUIPMENT_EQUIPMENT 前缀。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      this.softDelete.handleUniqueError(error, EQUIPMENT_UNIQUE_PREFIX);
    }
    throw error;
  }
}
