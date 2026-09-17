import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService, BaseService, VisibilityOpts, isB2cVisibility, SoftDeleteService, PaginationData } from '@gvray/core';




import { runWeightedSort, WeightedField } from '../weighted-sort';
import { CreateFilterDto } from './dto/create-filter.dto';
import { UpdateFilterDto } from './dto/update-filter.dto';
import { QueryFilterDto } from './dto/query-filter.dto';
import { FilterResponseDto } from './dto/filter-response.dto';

/**
 * 滤清器-字段错误码前缀映射，用于 P2002 兜底时按 meta.target 选前缀。
 */
const FILTER_UNIQUE_PREFIX_BY_FIELD: Record<string, string> = {
  model: 'EQUIPMENT_FILTER_MODEL',
  gencode: 'EQUIPMENT_FILTER_GENCODE',
};

/**
 * 匿名访客加权排序字段表 — 用于 B2C 浏览场景下"信息齐全优先"排序。
 *
 * 三档权重（来自 spec docs/specs/anonymous-filter-weighted-sort.md）：
 * - 核心展示型（gencode/photoUuid/drawingUuid）权重 5 — B2C 转化关键
 * - 关键参数型（weight/volume）权重 3 — 核心规格
 * - 详细参数型（dimensionD1/D2/D3/D7/H1/H2/H3/D8）权重 1 — 尺寸细节
 *
 * isString=true 的字段需同时判 `!= ''`（schema 上为 String?，可能存空字符串脏数据）；
 * isString=false 的字段（Decimal?）只需 `IS NOT NULL`。
 *
 * 注：列名经迁移脚本 prisma/scripts/migrate_af_eqm_to_gvray.sql 验证为 camelCase，
 * raw SQL 中需带双引号（如 "photoUuid"、"dimensionD1"）。
 */
const WEIGHTED_SORT_FIELDS: ReadonlyArray<WeightedField> = [
  { field: 'gencode', weight: 5, isString: true },
  { field: 'photoUuid', weight: 5, isString: true },
  { field: 'drawingUuid', weight: 5, isString: true },
  { field: 'weight', weight: 3, isString: false },
  { field: 'volume', weight: 3, isString: false },
  { field: 'dimensionD1', weight: 1, isString: false },
  { field: 'dimensionD2', weight: 1, isString: false },
  { field: 'dimensionD3', weight: 1, isString: false },
  { field: 'dimensionD7', weight: 1, isString: true },
  { field: 'dimensionH1', weight: 1, isString: false },
  { field: 'dimensionH2', weight: 1, isString: false },
  { field: 'dimensionH3', weight: 1, isString: false },
  { field: 'dimensionD8', weight: 1, isString: true },
];

@Injectable()
export class FiltersService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly softDelete: SoftDeleteService,
  ) {
    super(prisma, configService);
  }

  async create(
    dto: CreateFilterDto,
    createdById?: string,
  ): Promise<FilterResponseDto> {
    await this.validateFilterType(dto.typeName);

    await this.softDelete.assertUniqueActive(
      this.prisma.filter,
      'model',
      dto.model,
      { errorPrefix: 'EQUIPMENT_FILTER_MODEL' },
    );
    if (dto.gencode) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filter,
        'gencode',
        dto.gencode,
        { errorPrefix: 'EQUIPMENT_FILTER_GENCODE' },
      );
    }

    const { compatibility, ...rest } = dto;
    const data: Prisma.FilterUncheckedCreateInput = {
      ...rest,
      createdById: createdById ?? null,
    };
    if (compatibility !== undefined) {
      data.compatibility = compatibility as Prisma.InputJsonValue;
    }

    try {
      const filter = await this.prisma.filter.create({ data });
      return plainToInstance(FilterResponseDto, filter, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async findAll(
    query: QueryFilterDto,
    opts?: VisibilityOpts,
  ): Promise<PaginationData<FilterResponseDto>> {
    const where: Prisma.FilterWhereInput = { deletedAt: null };
    if (query.keyword) {
      where.OR = [
        { model: { contains: query.keyword, mode: 'insensitive' } },
        { gencode: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }
    if (query.typeName) {
      where.typeName = query.typeName;
    }
    if (query.status) {
      where.status = query.status;
    }
    this.applyVisibility(where as Record<string, unknown>, opts);

    // B2C 浏览域（anonymous / b2c）走非空加权排序（B2C 转化优先展示信息齐全产品）。
    // sortBy 参数被忽略 — 保护产品决策排序体验一致性。
    if (isB2cVisibility(opts)) {
      return this.findAllWithWeightedSort(query, where);
    }

    const result = await this.paginateWithSort(
      this.prisma.filter,
      query,
      where,
      undefined,
    );
    return {
      ...result,
      items: plainToInstance(FilterResponseDto, result.items, {
        excludeExtraneousValues: true,
      }),
    };
  }

  /**
   * 匿名访客加权排序查询 — 委托共享机制 runWeightedSort 执行。
   *
   * where 条件全部参数化（status/typeName/keyword 经 ${...} 插值防注入）；
   * 加权求和 SQL 由机制从 WEIGHTED_SORT_FIELDS 编译（常量内联）；
   * count 走 Prisma.filter.count（与排序无关）；
   * $queryRaw 返回的 Decimal 字段为 string，由 FilterResponseDto 的 @Type(() => Number)
   * 在 plainToInstance 阶段转 number。
   *
   * 详见 spec docs/specs/anonymous-filter-weighted-sort.md 与 CONTEXT.md
   * *Completeness-weighted sort* 词条、ADR 0005 增补。
   */
  private async findAllWithWeightedSort(
    query: QueryFilterDto,
    where: Prisma.FilterWhereInput,
  ): Promise<PaginationData<FilterResponseDto>> {
    // 构造参数化 WHERE 子句（首个条件 "deletedAt" IS NULL 为默认）
    const conditions: Prisma.Sql[] = [Prisma.sql`"deletedAt" IS NULL`];
    if (where.status) {
      conditions.push(Prisma.sql`"status" = ${where.status}`);
    }
    if (where.typeName) {
      conditions.push(Prisma.sql`"typeName" = ${where.typeName}`);
    }
    if (query.keyword) {
      const pattern = `%${query.keyword}%`;
      conditions.push(
        Prisma.sql`("model" ILIKE ${pattern} OR "gencode" ILIKE ${pattern})`,
      );
    }

    return runWeightedSort<FilterResponseDto>(this.prisma, {
      table: 'filters',
      fields: WEIGHTED_SORT_FIELDS,
      conditions,
      pagination: query,
      dto: FilterResponseDto,
      count: () => this.prisma.filter.count({ where }),
    });
  }

  async findOne(
    filterId: string,
    opts?: VisibilityOpts,
  ): Promise<FilterResponseDto> {
    const filter = await this.prisma.filter.findUnique({
      where: { filterId },
    });
    if (!filter || filter.deletedAt) {
      throw new NotFoundException('滤清器不存在');
    }
    this.assertVisible(filter, opts);
    return plainToInstance(FilterResponseDto, filter, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    filterId: string,
    dto: UpdateFilterDto,
    updatedById?: string,
  ): Promise<FilterResponseDto> {
    const existing = await this.prisma.filter.findUnique({
      where: { filterId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('滤清器不存在');
    }

    if (dto.typeName && dto.typeName !== existing.typeName) {
      await this.validateFilterType(dto.typeName);
    }
    if (dto.model && dto.model !== existing.model) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filter,
        'model',
        dto.model,
        {
          errorPrefix: 'EQUIPMENT_FILTER_MODEL',
          excludeIdField: 'filterId',
          excludeIdValue: filterId,
        },
      );
    }
    if (dto.gencode && dto.gencode !== existing.gencode) {
      await this.softDelete.assertUniqueActive(
        this.prisma.filter,
        'gencode',
        dto.gencode,
        {
          errorPrefix: 'EQUIPMENT_FILTER_GENCODE',
          excludeIdField: 'filterId',
          excludeIdValue: filterId,
        },
      );
    }

    try {
      const filter = await this.prisma.filter.update({
        where: { filterId },
        data: { ...dto, updatedById: updatedById ?? null },
      });
      return plainToInstance(FilterResponseDto, filter, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.rethrowUniqueError(error);
    }
  }

  async remove(filterId: string): Promise<void> {
    const existing = await this.prisma.filter.findUnique({
      where: { filterId },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('滤清器不存在');
    }
    await this.softDelete.softDelete(this.prisma.filter, 'filterId', filterId);
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.prisma.filter.updateMany({
      where: { filterId: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * 校验 typeName 是否存在于 FilterType 启用列表中。
   */
  private async validateFilterType(typeName: string): Promise<void> {
    const filterType = await this.prisma.filterType.findFirst({
      where: { code: typeName, status: 'enabled', deletedAt: null },
    });
    if (!filterType) {
      throw new BadRequestException('EQUIPMENT_FILTER_TYPE_INVALID');
    }
  }

  /**
   * P2002 兜底：按 error.meta.target 选择对应字段前缀；无法识别时退回 MODEL。
   */
  private rethrowUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      const field = target.find((t) => FILTER_UNIQUE_PREFIX_BY_FIELD[t]);
      const prefix = field
        ? FILTER_UNIQUE_PREFIX_BY_FIELD[field]
        : 'EQUIPMENT_FILTER_MODEL';
      this.softDelete.handleUniqueError(error, prefix);
    }
    throw error;
  }
}
