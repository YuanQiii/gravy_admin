import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, VisibilityOpts, isB2cVisibility, SoftDeleteService, PaginationData } from '@gvray/core';




import { runWeightedSort, WeightedField } from '../weighted-sort';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { CatalogResponseDto } from './dto/catalog-response.dto';

/**
 * 设备目录-字段错误码前缀映射，用于 P2002 兜底时按 meta.target 选前缀。
 */
const CATALOG_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  name: 'EQUIPMENT_CATALOG_NAME',
  code: 'EQUIPMENT_CATALOG_CODE',
};

/**
 * B2C 浏览场景 — Catalogs 匿名加权排序字段表。
 *
 * schema EquipmentCatalog 业务 nullable 字段共 2 个（不含审计/删除字段）：
 *   code, description
 *
 * 权重（按 B2C 客户决策价值）：
 * - 核心匹配 w=5: code (产品系列号，客户搜索匹配用)
 * - 关键说明 w=3: description (产品说明)
 *
 * 列名经 schema + 迁移约定：code (camelCase), description (camelCase)。
 * raw SQL 列名带双引号。description 存在 `@db.Text`，可防空字符串脏数据。
 */
const CATALOG_WEIGHTED_FIELDS: ReadonlyArray<WeightedField> = [
  { field: 'code', weight: 5, isString: true },
  { field: 'description', weight: 3, isString: true },
];

@Injectable()
export class CatalogsService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateCatalogDto,
    createdById?: string,
  ): Promise<CatalogResponseDto> {
    await this.softDelete.assertUniqueActive(
      this.prisma.equipmentCatalog,
      'name',
      dto.name,
      { errorPrefix: 'EQUIPMENT_CATALOG_NAME' },
    );
    if (dto.code) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentCatalog,
        'code',
        dto.code,
        { errorPrefix: 'EQUIPMENT_CATALOG_CODE' },
      );
    }

    try {
      const catalog = await this.prisma.equipmentCatalog.create({
        data: { ...dto, createdById: createdById ?? null },
      });
      return plainToInstance(CatalogResponseDto, catalog, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryCatalogDto,
    opts?: VisibilityOpts,
  ): Promise<PaginationData<CatalogResponseDto>> {
    const where = this.buildWhere({
      contains: { name: query.name },
      equals: { status: query.status, code: query.code },
    });
    where.deletedAt = null;
    this.applyVisibility(where, opts);

    // B2C 浏览域（anonymous / b2c）走加权排序 — 信息齐全目录优先，
    // sortBy 参数被忽略，保证产品决策排序体验一致。
    if (isB2cVisibility(opts)) {
      return this.findAllWithWeightedSort(query, where);
    }

    const result = await this.paginateWithSort(
      this.prisma.equipmentCatalog,
      query,
      where,
      undefined,
    );
    return {
      ...result,
      items: plainToInstance(CatalogResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * B2C 浏览域 Catalogs 加权排序查询。
   *
   * 排序：加权分 DESC（信息齐全优先）→ sortOrder DESC（运营权重兜底）
   *      → createdAt DESC（最后入库兜底，保证翻页稳定）。
   *
   * 约束同 filters.service: where 条件参数化防注入，加权求和片段为
   * 静态常量内联（字段名和权重都是硬编码）。
   * 表名使用 schema @@map("equipment_catalogs")。
   */
  private async findAllWithWeightedSort(
    query: QueryCatalogDto,
    where: Record<string, unknown>,
  ): Promise<PaginationData<CatalogResponseDto>> {
    const conditions: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];
    if (where.status) {
      conditions.push(Prisma.sql`"status" = ${where.status as string}`);
    }
    if (where.code) {
      conditions.push(Prisma.sql`"code" = ${where.code as string}`);
    }
    // name 条件直接从 query DTO 构建（不走 buildWhere 的 contains 中转再拆包）
    if (query.name) {
      const pattern = `%${query.name}%`;
      conditions.push(Prisma.sql`"name" ILIKE ${pattern}`);
    }

    return runWeightedSort<CatalogResponseDto>(this.prisma, {
      table: 'equipment_catalogs',
      fields: CATALOG_WEIGHTED_FIELDS,
      conditions,
      pagination: query,
      dto: CatalogResponseDto,
      count: () =>
        this.prisma.equipmentCatalog.count({
          where: where as Prisma.EquipmentCatalogWhereInput,
        }),
    });
  }

  async findOne(
    catalogId: string,
    opts?: VisibilityOpts,
  ): Promise<CatalogResponseDto> {
    const catalog = await this.prisma.equipmentCatalog.findUnique({
      where: { catalogId },
    });
    if (!catalog || catalog.deletedAt) {
      throw new NotFoundException('目录不存在');
    }
    this.assertVisible(catalog, opts);
    return plainToInstance(CatalogResponseDto, catalog, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    catalogId: string,
    dto: UpdateCatalogDto,
    updatedById?: string,
  ): Promise<CatalogResponseDto> {
    const existing = await this.prisma.equipmentCatalog.findUnique({
      where: { catalogId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('目录不存在');
    }

    if (dto.name && dto.name !== existing.name) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentCatalog,
        'name',
        dto.name,
        {
          errorPrefix: 'EQUIPMENT_CATALOG_NAME',
          excludeIdField: 'catalogId',
          excludeIdValue: catalogId,
        },
      );
    }
    if (dto.code && dto.code !== existing.code) {
      await this.softDelete.assertUniqueActive(
        this.prisma.equipmentCatalog,
        'code',
        dto.code,
        {
          errorPrefix: 'EQUIPMENT_CATALOG_CODE',
          excludeIdField: 'catalogId',
          excludeIdValue: catalogId,
        },
      );
    }

    try {
      const catalog = await this.prisma.equipmentCatalog.update({
        where: { catalogId },
        data: { ...dto, updatedById: updatedById ?? null },
      });
      return plainToInstance(CatalogResponseDto, catalog, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(catalogId: string): Promise<void> {
    const existing = await this.prisma.equipmentCatalog.findUnique({
      where: { catalogId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('目录不存在');
    }
    await this.softDelete.softDelete(
      this.prisma.equipmentCatalog,
      'catalogId',
      catalogId,
    );
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.equipmentCatalog.updateMany({
      where: { catalogId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * P2002 兜底：按 error.meta.target 选择对应字段前缀；无法识别时退回 NAME。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      const field = target.find((t) => CATALOG_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? CATALOG_UNIQUE_PREFIX_BY_FIELD[field]
        : 'EQUIPMENT_CATALOG_NAME';
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
